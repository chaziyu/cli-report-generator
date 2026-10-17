import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { GET as getVendorChecklist } from "@/app/api/vendors/[vendor]/checklist/route";
import { POST as processRoute } from "@/app/api/sessions/[id]/process/route";
import { GET as getReviewRoute, POST as postReviewRoute } from "@/app/api/sessions/[id]/review/route";
import { POST as uploadFileApi } from "@/app/api/sessions/[id]/files/route";
import { POST as exportRoute } from "@/app/api/sessions/[id]/export/route";
import { GET as downloadRoute } from "@/app/api/sessions/[id]/export/[reportId]/route";
import { NextRequest } from "next/server";
import JSZip from "jszip";

describe("Phase 10: Complete Single-Page E2E Workflow", () => {
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

  it("executes the entire single-page workflow from CLI command reference to updated Word download", async () => {
    // -------------------------------------------------------------------------
    // Step 1: CLI Command Reference discovery
    // -------------------------------------------------------------------------
    const checklistReq = new NextRequest("http://localhost:3000/api/vendors/fortigate/checklist");
    const checklistRes = await getVendorChecklist(checklistReq, {
      params: Promise.resolve({ vendor: "fortigate" }),
    });
    expect(checklistRes.status).toBe(200);
    const checklistData = await checklistRes.json();
    expect(checklistData.data.items).toBeDefined();
    expect(checklistData.data.items.length).toBeGreaterThanOrEqual(21);
    expect(checklistData.data.totalCommands).toBeGreaterThan(0);

    // -------------------------------------------------------------------------
    // Step 2: Session Creation & File Ingestion (DOCX + PuTTY Log)
    // -------------------------------------------------------------------------
    const session = await prisma.pMSession.create({
      data: {
        customer: "ITOCHU Malaysia",
        vendor: "fortigate",
        engineerName: "Syivhanii Selvarajan",
        status: "DRAFT",
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

    // Upload authentic sanitized Word report
    const docxPath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );
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
        originalFilename: "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx",
        storedFilename: storedDoc.storedFilename,
        storagePath: storedDoc.storagePath,
        hashSha256: storedDoc.hashSha256,
        sizeBytes: storedDoc.sizeBytes,
        mimeType: storedDoc.mimeType,
      },
    });

    // Upload authentic sanitized PuTTY session log
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

    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: "fortigate-clean-session.log",
        storedFilename: storedLog.storedFilename,
        storagePath: storedLog.storagePath,
        hashSha256: storedLog.hashSha256,
        sizeBytes: storedLog.sizeBytes,
        mimeType: "text/plain",
      },
    });

    // -------------------------------------------------------------------------
    // Step 3: GUI Screenshot Uploads (Web GUI Accessibility & Backup Config)
    // -------------------------------------------------------------------------
    // Create valid PNG buffers using sharp
    const pngBuffer = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 4,
        background: { r: 30, g: 80, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const formGui = new FormData();
    formGui.append("file", new Blob([pngBuffer], { type: "image/png" }), "gui-dashboard.png");
    formGui.append("type", "GUI_SCREENSHOT");
    formGui.append("checkId", "fg-mgmt-gui");
    formGui.append("deviceId", deviceId);
    formGui.append("appendixMapping", "Appendix 9: Web GUI Access");

    const uploadGuiReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/files`,
      { method: "POST", body: formGui }
    );
    const uploadGuiRes = await uploadFileApi(uploadGuiReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(uploadGuiRes.status).toBe(201);
    const guiUploadResult = await uploadGuiRes.json();
    expect(guiUploadResult.success).toBe(true);

    const formBackup = new FormData();
    formBackup.append("file", new Blob([pngBuffer], { type: "image/png" }), "backup-config.png");
    formBackup.append("type", "GUI_SCREENSHOT");
    formBackup.append("checkId", "fg-sys-backup");
    formBackup.append("deviceId", deviceId);
    formBackup.append("appendixMapping", "Appendix 16: Backup Configuration");

    const uploadBackupReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/files`,
      { method: "POST", body: formBackup }
    );
    const uploadBackupRes = await uploadFileApi(uploadBackupReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(uploadBackupRes.status).toBe(201);

    // -------------------------------------------------------------------------
    // Step 4: Process Pipeline (Deterministic Evaluation & Evidence Rendering)
    // -------------------------------------------------------------------------
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
    expect(processBody.data.summary.rulesTotal).toBeGreaterThanOrEqual(21);
    expect(processBody.data.summary.devicesEvaluated).toBe(1);

    // -------------------------------------------------------------------------
    // Step 5: Review Findings Inline
    // -------------------------------------------------------------------------
    const reviewReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review?deviceId=${deviceId}`
    );
    const reviewRes = await getReviewRoute(reviewReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(reviewRes.status).toBe(200);
    const reviewData = await reviewRes.json();
    expect(reviewData.data.items).toBeDefined();
    expect(reviewData.data.items.length).toBeGreaterThanOrEqual(21);

    // Inspect summary counts
    expect(reviewData.data.summary.total).toBe(reviewData.data.items.length);

    // Verify GUI Accessibility item received the GUI screenshot
    const guiItem = reviewData.data.items.find((i: { checkId: string }) => i.checkId === "fg-mgmt-gui");
    expect(guiItem).toBeDefined();
    expect(guiItem.evidence.length).toBeGreaterThanOrEqual(1);
    expect(guiItem.evidence[0].sourceType).toBe("GUI_SCREENSHOT");

    // -------------------------------------------------------------------------
    // Step 6: Engineer Review Decisions (Batch approve passing + explicit approve reviews)
    // -------------------------------------------------------------------------
    const manualDecisions = [
      {
        checkId: "fg-mgmt-gui",
        decision: "APPROVED",
        overrideStatus: "PASS",
        justification: "Verified HTTPS admin portal accessibility via uploaded screenshot.",
        reviewRemark: "Web GUI accessible over HTTPS. Refer Appendix 9",
        evidenceFingerprint: guiItem.proposedEvaluation.evidenceFingerprint,
      },
      {
        checkId: "fg-sys-backup",
        decision: "APPROVED",
        overrideStatus: "PASS",
        justification: "Configuration backup downloaded and verified.",
        reviewRemark: "Firewall configuration backup verified and archived. Refer Appendix 16",
        evidenceFingerprint: reviewData.data.items.find((i: { checkId: string }) => i.checkId === "fg-sys-backup").proposedEvaluation.evidenceFingerprint,
      },
    ];

    for (const d of manualDecisions) {
      const singleApproveReq = new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            deviceId,
            engineerName: "Syivhanii Selvarajan",
            action: "SINGLE",
            decision: {
              checkId: d.checkId,
              decision: d.decision,
              finalStatus: d.overrideStatus,
              finalRemarks: d.reviewRemark,
              reviewNotes: d.justification,
              evidenceFingerprint: d.evidenceFingerprint,
            },
          }),
        }
      );
      const approveRes = await postReviewRoute(singleApproveReq, {
        params: Promise.resolve({ id: sessionId }),
      });
      expect(approveRes.status).toBe(200);
    }

    // Safe batch approve all passing items
    const batchReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          reviewer: "Syivhanii Selvarajan",
          action: "APPROVE_PASSING",
        }),
      }
    );
    const batchRes = await postReviewRoute(batchReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(batchRes.status).toBe(200);
    const batchData = await batchRes.json();
    expect(batchData.success).toBe(true);
    expect(batchData.data.decisionsRecorded).toBeGreaterThan(0);

    // -------------------------------------------------------------------------
    // Step 7: Export Word Report (.docx)
    // -------------------------------------------------------------------------
    const exportReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/export`, {
      method: "POST",
      body: JSON.stringify({
        deviceId,
        engineerName: "Syivhanii Selvarajan",
      }),
    });
    const exportRes = await exportRoute(exportReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.json();
    expect(exportData.success).toBe(true);
    const reportId = exportData.data.reportId;
    expect(reportId).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 8: Download Updated Word Report & Verify Package
    // -------------------------------------------------------------------------
    const downloadReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export/${reportId}`
    );
    const downloadRes = await downloadRoute(downloadReq, {
      params: Promise.resolve({ id: sessionId, reportId }),
    });
    expect(downloadRes.status).toBe(200);

    // Verify response headers
    const contentType = downloadRes.headers.get("content-type");
    const contentDisposition = downloadRes.headers.get("content-disposition");
    expect(contentType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(contentDisposition).toContain("attachment;");
    expect(contentDisposition).toContain(".docx");

    // Verify binary integrity as valid OOXML zip
    const exportedArrayBuffer = await downloadRes.arrayBuffer();
    expect(exportedArrayBuffer.byteLength).toBeGreaterThan(10000);

    const zip = await JSZip.loadAsync(exportedArrayBuffer);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
  });
});
