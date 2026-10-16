import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  POST as generateEvidenceApi,
  GET as getEvidenceListApi,
} from "@/app/api/sessions/[id]/evidence/route";
import { GET as getRawEvidenceImageApi } from "@/app/api/sessions/[id]/evidence/[evidenceId]/route";
import { NextRequest } from "next/server";

describe("CLI Evidence API Integration", () => {
  let sessionId: string;
  let deviceId: string;
  let commandExecutionId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore
      }
    }
  });

  it("generates terminal screenshot evidence PNGs from command executions and serves them", async () => {
    // 1. Create session and device
    const session = await prisma.pMSession.create({
      data: {
        customer: "Evidence Test Customer",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FGT100F-CORE",
              model: "FortiGate 100F",
              role: "Primary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    deviceId = session.devices[0].id;

    // 2. Create command execution with raw output
    const exec = await prisma.commandExecution.create({
      data: {
        deviceId,
        command: "fnsysctl df",
        outputContent: `Filesystem           1k-blocks      Used Available Use% Mounted on
none                    819200       124    819076   0% /tmp
none                   8192000    421040   7770960   5% /dev/shm
/dev/nodev             2097152    184320   1912832   9% /var/log`,
        parseStatus: "PARSED",
      },
    });
    commandExecutionId = exec.id;

    // 3. Call POST /api/sessions/[id]/evidence
    const postReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evidence`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, commandExecutionId }),
      }
    );

    const postRes = await generateEvidenceApi(postReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.success).toBe(true);
    expect(postJson.data.totalImagesGenerated).toBeGreaterThanOrEqual(1);

    const evidenceId = postJson.data.generatedEvidenceIds[0];
    expect(evidenceId).toBeDefined();

    // 4. Call GET /api/sessions/[id]/evidence
    const getListReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evidence?deviceId=${deviceId}`
    );
    const getListRes = await getEvidenceListApi(getListReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(getListRes.status).toBe(200);
    const listJson = await getListRes.json();
    expect(listJson.success).toBe(true);
    expect(listJson.data.total).toBeGreaterThanOrEqual(1);

    const firstEvidence = listJson.data.evidences[0];
    expect(firstEvidence.id).toBe(evidenceId);
    expect(firstEvidence.deviceHostname).toBe("FGT100F-CORE");
    expect(firstEvidence.appendixMapping).toContain("Appendix 1");
    expect(firstEvidence.imageUrl).toContain(`/api/sessions/${sessionId}/evidence/${evidenceId}`);

    // 5. Call GET /api/sessions/[id]/evidence/[evidenceId]
    const getRawReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evidence/${evidenceId}`
    );
    const getRawRes = await getRawEvidenceImageApi(getRawReq, {
      params: Promise.resolve({ id: sessionId, evidenceId }),
    });

    expect(getRawRes.status).toBe(200);
    expect(getRawRes.headers.get("Content-Type")).toBe("image/png");

    const arrayBuffer = await getRawRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });
});
