import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as processRoute } from "@/app/api/sessions/[id]/process/route";
import { GET as getReviewRoute } from "@/app/api/sessions/[id]/review/route";
import { NextRequest } from "next/server";

describe("Phase 10: Multi-Device Identity & HA Evidence Mapping E2E", () => {
  let sessionId: string;
  let priDeviceId: string;
  let secDeviceId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore
      }
    }
  });

  it("handles standalone vs HA pair, multi-log ingestion, and strict device evidence isolation", async () => {
    // 1. Create HA Pair Session (Primary + Secondary)
    const session = await prisma.pMSession.create({
      data: {
        customer: "Maybank Group",
        vendor: "fortigate",
        status: "DRAFT",
        devices: {
          create: [
            {
              hostname: "MBB-FW-HQ-PRI",
              model: "FortiGate 200F",
              role: "Primary",
            },
            {
              hostname: "MBB-FW-HQ-SEC",
              model: "FortiGate 200F",
              role: "Secondary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    priDeviceId = session.devices.find((d) => d.role === "Primary")!.id;
    secDeviceId = session.devices.find((d) => d.role === "Secondary")!.id;

    // 2. Upload Log 1 for Primary Device (with Primary Hostname in prompt)
    const priLogContent = `
MBB-FW-HQ-PRI # get system status
Version: FortiGate-200F v7.4.11,build2878 (GA.M)
Serial-Number: FG200FTK21001111
Hostname: MBB-FW-HQ-PRI

MBB-FW-HQ-PRI # get system performance status
CPU states: 1% user 1% system 0% nice 98% idle
Memory: 16384000k total, 3276800k used (20%)
Uptime: 100 days, 2 hours, 10 minutes

MBB-FW-HQ-PRI # get system ha status
HA Health Status: OK
Model: FortiGate-200F
Mode: a-p
Master: MBB-FW-HQ-PRI, FG200FTK21001111, cluster index: 0
Slave:  MBB-FW-HQ-SEC, FG200FTK21002222, cluster index: 1
Configuration status: in-sync
`;
    const storedPriLog = await storage.saveFile(
      sessionId,
      "logs",
      "mbb-pri.log",
      Buffer.from(priLogContent),
      "text/plain"
    );
    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: "mbb-pri.log",
        storedFilename: storedPriLog.storedFilename,
        storagePath: storedPriLog.storagePath,
        hashSha256: storedPriLog.hashSha256,
        sizeBytes: storedPriLog.sizeBytes,
        mimeType: "text/plain",
      },
    });

    // 3. Upload Log 2 for Secondary Device (with Secondary Hostname in prompt)
    const secLogContent = `
MBB-FW-HQ-SEC # get system status
Version: FortiGate-200F v7.4.11,build2878 (GA.M)
Serial-Number: FG200FTK21002222
Hostname: MBB-FW-HQ-SEC

MBB-FW-HQ-SEC # get system performance status
CPU states: 0% user 1% system 0% nice 99% idle
Memory: 16384000k total, 4096000k used (25%)
Uptime: 100 days, 2 hours, 05 minutes

MBB-FW-HQ-SEC # get system ha status
HA Health Status: OK
Model: FortiGate-200F
Mode: a-p
Master: MBB-FW-HQ-PRI, FG200FTK21001111, cluster index: 0
Slave:  MBB-FW-HQ-SEC, FG200FTK21002222, cluster index: 1
Configuration status: in-sync
`;
    const storedSecLog = await storage.saveFile(
      sessionId,
      "logs",
      "mbb-sec.log",
      Buffer.from(secLogContent),
      "text/plain"
    );
    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: "mbb-sec.log",
        storedFilename: storedSecLog.storedFilename,
        storagePath: storedSecLog.storagePath,
        hashSha256: storedSecLog.hashSha256,
        sizeBytes: storedSecLog.sizeBytes,
        mimeType: "text/plain",
      },
    });

    // 4. Run Process Pipeline
    const processReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const processRes = await processRoute(processReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(processRes.status).toBe(200);
    const processBody = await processRes.json();
    expect(processBody.success).toBe(true);
    expect(processBody.data.summary.devicesEvaluated).toBe(2);

    // 5. Verify Device Isolation in Review Data
    const priReviewReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review?deviceId=${priDeviceId}`
    );
    const priReviewRes = await getReviewRoute(priReviewReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(priReviewRes.status).toBe(200);
    const priData = await priReviewRes.json();

    const priUptime = priData.data.items.find((i: { checkId: string }) => i.checkId === "fg-sys-uptime");
    expect(priUptime).toBeDefined();
    expect(priUptime.proposedEvaluation.currentValue).toContain("100 days");

    const secReviewReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review?deviceId=${secDeviceId}`
    );
    const secReviewRes = await getReviewRoute(secReviewReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(secReviewRes.status).toBe(200);
    const secData = await secReviewRes.json();

    const secUptime = secData.data.items.find((i: { checkId: string }) => i.checkId === "fg-sys-uptime");
    expect(secUptime).toBeDefined();
    expect(secUptime.proposedEvaluation.currentValue).toContain("100 days");

    expect(priUptime.proposedEvaluation.currentValue).not.toEqual(secUptime.proposedEvaluation.currentValue);
  });
});
