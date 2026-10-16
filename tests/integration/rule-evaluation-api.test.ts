import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { POST as evaluateApi, GET as getEvaluateApi } from "@/app/api/sessions/[id]/evaluate/route";
import { NextRequest } from "next/server";

describe("Rule Evaluation API Integration", () => {
  let sessionId: string;
  let deviceId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore
      }
    }
  });

  it("evaluates PM rules for a device, persists ChecklistResult records, and retrieves them via GET", async () => {
    // 1. Create a test session and device
    const session = await prisma.pMSession.create({
      data: {
        customer: "Eval Test Customer",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FGT60F-BRANCH",
              model: "FortiGate 60F",
              role: "Standalone",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    deviceId = session.devices[0].id;

    // 2. Add realistic command executions with outputContent
    await prisma.commandExecution.createMany({
      data: [
        {
          deviceId,
          command: "get system performance status",
          outputContent: `
CPU states: 0% user 1% system 0% nice 99% idle 0% iowait 0% irq 0% softirq
Memory: 16384000k total, 5406720k used (33%), 10977280k free (67%)
Average sessions: 1845 concurrent sessions, 42 sessions/sec
Uptime: 177 days,  14 hours,  24 minutes
`,
          parseStatus: "PARSED",
        },
        {
          deviceId,
          command: "fnsysctl df",
          outputContent: `
Filesystem           1k-blocks      Used Available Use% Mounted on
none                    819200       124    819076   0% /tmp
none                   8192000    421040   7770960   5% /dev/shm
`,
          parseStatus: "PARSED",
        },
        {
          deviceId,
          command: "get system ha status",
          outputContent: `
HA information
Configuration status: in-sync
Model: FortiGate-60F
Mode: standalone
Group: 0
`,
          parseStatus: "PARSED",
        },
      ],
    });

    // 3. Call POST /api/sessions/[id]/evaluate
    const postReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      }
    );

    const postRes = await evaluateApi(postReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.data.devicesEvaluated).toBe(1);

    const summary = postData.data.deviceSummaries[0];
    expect(summary.totalChecks).toBe(21);
    expect(summary.reviewCount).toBeGreaterThanOrEqual(1);

    // 4. Verify SQLite persistence of ChecklistResult
    const persistedResults = await prisma.checklistResult.findMany({
      where: { deviceId },
    });
    expect(persistedResults.length).toBe(21);

    const cpuItem = persistedResults.find((r) => r.checkId === "fg-hw-cpu");
    expect(cpuItem).toBeDefined();
    expect(cpuItem?.status).toBe("REVIEW");
    expect(cpuItem?.reviewRequired).toBe(true);
    expect(cpuItem?.currentValue).toContain("1%");

    const diskItem = persistedResults.find((r) => r.checkId === "fg-hw-disk");
    expect(diskItem).toBeDefined();
    expect(diskItem?.status).toBe("NA"); // Flash storage only
    expect(diskItem?.remarks).toContain("flash storage only");

    const haItem = persistedResults.find((r) => r.checkId === "fg-sys-ha");
    expect(haItem).toBeDefined();
    expect(haItem?.status).toBe("NA"); // Standalone
    expect(haItem?.remarks).toContain("standalone firewall");

    // 5. Call GET /api/sessions/[id]/evaluate
    const getReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evaluate?deviceId=${deviceId}`
    );
    const getRes = await getEvaluateApi(getReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.success).toBe(true);
    expect(getData.data.devices.length).toBe(1);
    expect(getData.data.devices[0].counts.total).toBe(21);
    expect(getData.data.devices[0].counts.pass).toBeGreaterThanOrEqual(1);
    expect(getData.data.devices[0].counts.review).toBeGreaterThanOrEqual(1);
    expect(getData.data.devices[0].counts.na).toBeGreaterThanOrEqual(2);
  });
});
