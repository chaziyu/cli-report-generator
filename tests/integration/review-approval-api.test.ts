import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { GET as getReviewApi, POST as postReviewApi } from "@/app/api/sessions/[id]/review/route";
import { POST as parseLogApi } from "@/app/api/sessions/[id]/parse-log/route";
import { POST as evaluateApi } from "@/app/api/sessions/[id]/evaluate/route";
import { POST as evidenceApi } from "@/app/api/sessions/[id]/evidence/route";
import { NextRequest } from "next/server";

describe("Engineer Review & Approval API Integration", () => {
  let sessionId: string;
  let deviceId: string;
  let checkpointSessionId: string;

  afterAll(async () => {
    if (checkpointSessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: checkpointSessionId } });
      } catch {
        // ignore cleanup error
      }
    }
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it("loads review data comparing original Word doc vs proposed findings and persists ReviewDecisions", async () => {
    // 1. Create PM Session and Device
    const session = await prisma.pMSession.create({
      data: {
        customer: "ITOCHU Malaysia",
        vendor: "fortigate",
        engineerName: "Syivhanii Selvarajan",
        devices: {
          create: [
            {
              hostname: "FGT200F-HQ-PRI",
              model: "FortiGate 200F",
              role: "Primary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    deviceId = session.devices[0].id;

    // 2. Upload authentic Word report if available
    const docxPath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );
    try {
      const docxBuffer = await fs.readFile(docxPath);
      const storedDoc = await storage.saveFile(
        sessionId,
        "reports",
        "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx",
        docxBuffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      await prisma.uploadedFile.create({
        data: {
          sessionId,
          type: "WORD_REPORT",
          originalFilename: storedDoc.originalFilename,
          storedFilename: storedDoc.storedFilename,
          storagePath: storedDoc.storagePath,
          hashSha256: storedDoc.hashSha256,
          sizeBytes: storedDoc.sizeBytes,
          mimeType: storedDoc.mimeType,
        },
      });
    } catch {
      console.warn("Sample Word report not available at", docxPath);
    }

    // 3. Upload PuTTY session log & parse it
    const logPath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "logs",
      "fortigate-clean-session.log"
    );
    const logBuffer = await fs.readFile(logPath);
    const storedLog = await storage.saveFile(
      sessionId,
      "logs",
      "fortigate-clean-session.log",
      logBuffer,
      "text/plain"
    );

    const logFile = await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: storedLog.originalFilename,
        storedFilename: storedLog.storedFilename,
        storagePath: storedLog.storagePath,
        hashSha256: storedLog.hashSha256,
        sizeBytes: storedLog.sizeBytes,
        mimeType: "text/plain",
      },
    });

    // Parse log
    const parseReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/parse-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: logFile.id, deviceId }),
      }
    );
    await parseLogApi(parseReq, { params: Promise.resolve({ id: sessionId }) });

    // Evaluate rules
    const evalReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      }
    );
    await evaluateApi(evalReq, { params: Promise.resolve({ id: sessionId }) });

    // Generate evidence
    const evReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evidence`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      }
    );
    await evidenceApi(evReq, { params: Promise.resolve({ id: sessionId }) });

    // 4. Call GET /api/sessions/[id]/review
    const getReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review?deviceId=${deviceId}`
    );
    const getRes = await getReviewApi(getReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.success).toBe(true);

    const reviewData = getJson.data;
    expect(reviewData.sessionId).toBe(sessionId);
    expect(reviewData.items.length).toBe(21);
    expect(reviewData.summary.total).toBe(21);

    // Verify comparison fields on a known item
    const cpuItem = reviewData.items.find((i: { checkId: string }) => i.checkId === "fg-hw-cpu");
    expect(cpuItem).toBeDefined();
    expect(cpuItem.proposedEvaluation.status).toBe("REVIEW");
    expect(cpuItem.decision.decision).toBe("PENDING");

    // 5. POST single decision: Approve CPU check
    const postReqApprove = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          reviewer: "Syivhanii Selvarajan",
          action: "SINGLE",
          decision: {
            checkId: "fg-hw-cpu",
            decision: "APPROVED",
            finalStatus: "PASS",
            finalRemarks: "CPU utilization is 18%, healthy.",
          },
        }),
      }
    );

    const postResApprove = await postReviewApi(postReqApprove, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(postResApprove.status).toBe(200);
    const approveJson = await postResApprove.json();
    expect(approveJson.success).toBe(true);
    expect(approveJson.data.decisionsRecorded).toBe(1);

    // 6. Test override status with remarks and justification
    const postReqOverride = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          reviewer: "Syivhanii Selvarajan",
          action: "SINGLE",
          decision: {
            checkId: "fg-hw-disk",
            decision: "MODIFIED",
            finalStatus: "NA",
            finalRemarks: "N/A - Hard disk storage not installed on FortiGate-80F.",
            reviewNotes: "Confirmed diskless hardware architecture",
          },
        }),
      }
    );

    const postResOverride = await postReviewApi(postReqOverride, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(postResOverride.status).toBe(200);

    // 7. Test REJECTED decision
    const postReqReject = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          reviewer: "Syivhanii Selvarajan",
          action: "SINGLE",
          decision: {
            checkId: "fg-sys-backup",
            decision: "REJECTED",
          },
        }),
      }
    );

    const postResReject = await postReviewApi(postReqReject, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(postResReject.status).toBe(200);

    // 8. Test batch "APPROVE_PASSING" action
    const postReqBatch = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          reviewer: "Syivhanii Selvarajan",
          action: "APPROVE_PASSING",
        }),
      }
    );

    const postResBatch = await postReviewApi(postReqBatch, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(postResBatch.status).toBe(200);
    const batchJson = await postResBatch.json();
    expect(batchJson.data.decisionsRecorded).toBeGreaterThan(0);

    // 9. Verify persistence in SQLite database
    const savedDecisions = await prisma.reviewDecision.findMany({
      where: {
        checklistResult: {
          deviceId,
        },
      },
      include: {
        checklistResult: true,
      },
    });

    expect(savedDecisions.length).toBeGreaterThanOrEqual(3);

    const cpuDec = savedDecisions.find(
      (d) => d.checklistResult.checkId === "fg-hw-cpu"
    );
    expect(cpuDec).toBeDefined();
    expect(cpuDec?.decision).toBe("APPROVED");
    expect(cpuDec?.finalStatus).toBe("PASS");
    expect(cpuDec?.reviewer).toBe("Syivhanii Selvarajan");

    const diskDec = savedDecisions.find(
      (d) => d.checklistResult.checkId === "fg-hw-disk"
    );
    expect(diskDec).toBeDefined();
    expect(diskDec?.decision).toBe("MODIFIED");
    expect(diskDec?.finalStatus).toBe("NA");
    expect(diskDec?.reviewNotes).toBe("Confirmed diskless hardware architecture");

    // Verify session status updated to REVIEW
    const updatedSession = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    expect(updatedSession?.status).toBe("REVIEW");
  });

  it("requires a justified exception before approving a guide task without evidence", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Check Point Evidence Review Test",
        vendor: "checkpoint",
        devices: { create: [{ hostname: "CP-GW-REVIEW", model: "Quantum 7000M" }] },
      },
      include: { devices: true },
    });
    checkpointSessionId = session.id;
    const checkpointDeviceId = session.devices[0].id;
    const makeRequest = (reviewNotes?: string) => new NextRequest(
      `http://localhost:3000/api/sessions/${checkpointSessionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: checkpointDeviceId,
          action: "SINGLE",
          decision: {
            checkId: "cp-gui-access",
            decision: "APPROVED",
            finalStatus: "PASS",
            reviewNotes,
          },
        }),
      }
    );

    const rejected = await postReviewApi(makeRequest(), {
      params: Promise.resolve({ id: checkpointSessionId }),
    });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain("GUI/manual evidence is missing");

    const approved = await postReviewApi(
      makeRequest("Customer-approved exception: GUI access was unavailable during this PM."),
      { params: Promise.resolve({ id: checkpointSessionId }) }
    );
    expect(approved.status).toBe(200);
    const result = await prisma.checklistResult.findUnique({
      where: { deviceId_checkId: { deviceId: checkpointDeviceId, checkId: "cp-gui-access" } },
      include: { reviewDecisions: true },
    });
    expect(result?.reviewDecisions[0]?.reviewNotes).toContain("Customer-approved exception");
  });
});
