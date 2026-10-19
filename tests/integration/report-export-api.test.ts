import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as parseLogApi } from "@/app/api/sessions/[id]/parse-log/route";
import { POST as evaluateApi } from "@/app/api/sessions/[id]/evaluate/route";
import { POST as evidenceApi } from "@/app/api/sessions/[id]/evidence/route";
import { POST as reviewApi } from "@/app/api/sessions/[id]/review/route";
import { POST as exportApi, GET as getExportApi } from "@/app/api/sessions/[id]/export/route";
import { GET as downloadApi } from "@/app/api/sessions/[id]/export/[reportId]/route";
import { NextRequest } from "next/server";

describe("Word Report Editor & Exporter API Integration (Phase 9)", () => {
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

  it("updates Word report with approved findings and evidence, generates separate DOCX, and exports it", async () => {
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

    // 2. Upload authentic Word report
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

    const docxRecord = await prisma.uploadedFile.create({
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

    // 3. Upload PuTTY log, parse, evaluate, and generate evidence
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
      "fortigate-session.log",
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

    // 4. Record approved review decisions
    const reviewReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          reviewer: "Syivhanii Selvarajan",
          action: "BATCH_DECISIONS",
          decisions: [
            {
              checkId: "fg-hw-cpu",
              decision: "APPROVED",
              finalStatus: "PASS",
              finalRemarks: "CPU utilization tested at 18%, healthy.",
            },
            {
              checkId: "fg-hw-disk",
              decision: "MODIFIED",
              finalStatus: "NA",
              finalRemarks: "N/A - Flash storage only on FortiGate-80F.",
              reviewNotes: "Confirmed diskless hardware architecture",
            },
          ],
        }),
      }
    );
    await reviewApi(reviewReq, { params: Promise.resolve({ id: sessionId }) });

    // 5. Call POST /api/sessions/[id]/export to generate updated Word report
    const exportPostReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      }
    );

    const exportRes = await exportApi(exportPostReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(exportRes.status).toBe(200);
    const exportJson = await exportRes.json();
    expect(exportJson.success).toBe(true);

    const reportData = exportJson.data;
    expect(reportData.reportId).toBeDefined();
    expect(reportData.version).toBe(1);
    expect(reportData.downloadUrl).toContain(`/export/${reportData.reportId}`);
    expect(reportData.changeSummary.appliedRowChanges.length).toBeGreaterThanOrEqual(2);
    expect(reportData.validation.isValid).toBe(true);

    // 6. Call GET /api/sessions/[id]/export
    const exportGetReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`
    );
    const listRes = await getExportApi(exportGetReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.success).toBe(true);
    expect(listJson.data.total).toBe(1);
    expect(listJson.data.reports[0].id).toBe(reportData.reportId);

    // 7. Call GET /api/sessions/[id]/export/[reportId] (Download stream)
    const downloadReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export/${reportData.reportId}`
    );
    const dlRes = await downloadApi(downloadReq, {
      params: Promise.resolve({ id: sessionId, reportId: reportData.reportId }),
    });

    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(dlRes.headers.get("Content-Disposition")).toContain(".docx");

    const dlBuffer = Buffer.from(await dlRes.arrayBuffer());
    expect(dlBuffer.byteLength).toBeGreaterThan(1000);
    // Verify ZIP magic bytes PK (0x50, 0x4B)
    expect(dlBuffer[0]).toBe(0x50);
    expect(dlBuffer[1]).toBe(0x4b);

    // 8. Verify SQLite database persistence of GeneratedReport
    const dbReport = await prisma.generatedReport.findUnique({
      where: { id: reportData.reportId },
    });
    expect(dbReport).toBeDefined();
    expect(dbReport?.generationStatus).toBe("SUCCESS");
    expect(dbReport?.version).toBe(1);
    expect(dbReport?.originalReportId).toBe(docxRecord.id);

    // Verify session status is NOT marked COMPLETED when review is incomplete (concern 6)
    const updatedSession = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    expect(updatedSession?.status).toBe("REVIEW");
  });

  it("rejects export with VENDOR_LAYOUT_MISMATCH when uploaded template belongs to another vendor", async () => {
    const paSession = await prisma.pMSession.create({
      data: {
        customer: "Test PA Customer",
        vendor: "paloalto",
        devices: {
          create: [{ hostname: "PA-FW01", model: "PA-820" }],
        },
      },
      include: { devices: true },
    });

    try {
      const fgDocPath = path.join(
        process.cwd(),
        "doc",
        "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
      );
      if (!fsSync.existsSync(fgDocPath)) return;

      const docxBuffer = await fs.readFile(fgDocPath);
      const storedDoc = await storage.saveFile(
        paSession.id,
        "reports",
        "PM_Report_FortiGate.docx",
        docxBuffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      await prisma.uploadedFile.create({
        data: {
          sessionId: paSession.id,
          type: "WORD_REPORT",
          originalFilename: storedDoc.originalFilename,
          storedFilename: storedDoc.storedFilename,
          storagePath: storedDoc.storagePath,
          hashSha256: storedDoc.hashSha256,
          sizeBytes: storedDoc.sizeBytes,
          mimeType: storedDoc.mimeType,
        },
      });

      const getReq = new NextRequest(
        `http://localhost:3000/api/sessions/${paSession.id}/export`
      );
      const getRes = await getExportApi(getReq, {
        params: Promise.resolve({ id: paSession.id }),
      });
      const getJson = await getRes.json();
      expect(getJson.data.canExport).toBe(false);
      expect(getJson.data.warnings.some((w: string) => w.includes("which does not match session vendor paloalto"))).toBe(true);

      const postReq = new NextRequest(
        `http://localhost:3000/api/sessions/${paSession.id}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: paSession.devices[0].id }),
        }
      );
      const postRes = await exportApi(postReq, {
        params: Promise.resolve({ id: paSession.id }),
      });
      expect(postRes.status).toBe(400);
      const postJson = await postRes.json();
      expect(postJson.code).toBe("VENDOR_LAYOUT_MISMATCH");
    } finally {
      await prisma.pMSession.delete({ where: { id: paSession.id } }).catch(() => {});
    }
  });

  it("exports Palo Alto Word report with approved findings and evidence", async () => {
    const paDocPath = path.join(
      process.cwd(),
      "doc",
      "LFSA_PA-820_PM 2nd half 2026.docx"
    );
    if (!fsSync.existsSync(paDocPath)) return;

    const paSession = await prisma.pMSession.create({
      data: {
        customer: "LFSA",
        vendor: "paloalto",
        engineerName: "Cha Zi Yu",
        devices: {
          create: [{ hostname: "klfo-fw", model: "PA-820" }],
        },
      },
      include: { devices: true },
    });

    const paDeviceId = paSession.devices[0].id;

    try {
      const docxBuffer = await fs.readFile(paDocPath);
      const storedDoc = await storage.saveFile(
        paSession.id,
        "reports",
        "LFSA_PA-820_PM.docx",
        docxBuffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      await prisma.uploadedFile.create({
        data: {
          sessionId: paSession.id,
          type: "WORD_REPORT",
          originalFilename: storedDoc.originalFilename,
          storedFilename: storedDoc.storedFilename,
          storagePath: storedDoc.storagePath,
          hashSha256: storedDoc.hashSha256,
          sizeBytes: storedDoc.sizeBytes,
          mimeType: storedDoc.mimeType,
        },
      });

      await prisma.checklistResult.create({
        data: {
          deviceId: paDeviceId,
          checkId: "pa-disk-space",
          checkName: "Hard Disk Space",
          status: "PASS",
          collectionState: "COMPLETE",
          evidenceFingerprint: "fingerprint-pa-disk",
          reviewRequired: false,
          reviewDecisions: {
            create: [
              {
                decision: "APPROVED",
                finalStatus: "PASS",
                finalRemarks: "Disk usage verified below 90% (observed 78%).",
                reviewer: "Lead Engineer",
                evidenceFingerprint: "fingerprint-pa-disk",
              },
            ],
          },
        },
      });

      const getReq = new NextRequest(
        `http://localhost:3000/api/sessions/${paSession.id}/export`
      );
      const getRes = await getExportApi(getReq, {
        params: Promise.resolve({ id: paSession.id }),
      });
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data.canExport).toBe(true);
      expect(getJson.data.layoutName).toContain("Palo Alto");

      const postReq = new NextRequest(
        `http://localhost:3000/api/sessions/${paSession.id}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: paDeviceId }),
        }
      );
      const postRes = await exportApi(postReq, {
        params: Promise.resolve({ id: paSession.id }),
      });
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.success).toBe(true);
      expect(postJson.data.reportId).toBeDefined();
      expect(postJson.data.validation.isValid).toBe(true);
      expect(postJson.data.changeSummary.appliedRowChanges.length).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.pMSession.delete({ where: { id: paSession.id } }).catch(() => {});
    }
  });
});
