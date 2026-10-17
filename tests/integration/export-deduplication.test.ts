import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as processRoute } from "@/app/api/sessions/[id]/process/route";
import { POST as postReviewRoute } from "@/app/api/sessions/[id]/review/route";
import { POST as exportRoute } from "@/app/api/sessions/[id]/export/route";
import { GET as downloadRoute } from "@/app/api/sessions/[id]/export/[reportId]/route";
import { NextRequest } from "next/server";

describe("Phase 10: Export Deduplication, Versioning & Immutability", () => {
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

  it("measures export caching performance, increments version on invalidation, and preserves template immutability", async () => {
    // 1. Setup Session
    const session = await prisma.pMSession.create({
      data: {
        customer: "CIMB Bank",
        vendor: "fortigate",
        status: "DRAFT",
        devices: {
          create: [{ hostname: "CIMB-FW-01", model: "FortiGate 80F", role: "Standalone" }],
        },
      },
      include: { devices: true },
    });
    sessionId = session.id;
    deviceId = session.devices[0].id;

    // 2. Upload authentic Word report and compute original SHA-256
    const docxPath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );
    const docxBuffer = await fs.readFile(docxPath);
    const storedDoc = await storage.saveFile(
      sessionId,
      "reports",
      "template.docx",
      docxBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    const originalHash = storedDoc.hashSha256;

    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "WORD_REPORT",
        originalFilename: "template.docx",
        storedFilename: storedDoc.storedFilename,
        storagePath: storedDoc.storagePath,
        hashSha256: storedDoc.hashSha256,
        sizeBytes: storedDoc.sizeBytes,
        mimeType: storedDoc.mimeType,
      },
    });

    // Upload minimal log
    const logBuffer = Buffer.from("CIMB-FW-01 # get system status\nVersion: FortiGate-80F v7.0.14\nHostname: CIMB-FW-01\n");
    const storedLog = await storage.saveFile(sessionId, "logs", "session.log", logBuffer, "text/plain");
    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: "session.log",
        storedFilename: storedLog.storedFilename,
        storagePath: storedLog.storagePath,
        hashSha256: storedLog.hashSha256,
        sizeBytes: storedLog.sizeBytes,
        mimeType: "text/plain",
      },
    });

    // Run pipeline
    const procReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await processRoute(procReq, { params: Promise.resolve({ id: sessionId }) });

    // 3. First Export: Generation
    const t0 = performance.now();
    const exportReq1 = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/export`, {
      method: "POST",
      body: JSON.stringify({ deviceId, engineerName: "Lead Engineer" }),
    });
    const exportRes1 = await exportRoute(exportReq1, { params: Promise.resolve({ id: sessionId }) });
    const duration1Ms = performance.now() - t0;

    expect(exportRes1.status).toBe(200);
    const data1 = await exportRes1.json();
    expect(data1.data.isCached).toBe(false);
    expect(data1.data.reportId).toBeDefined();

    // 4. Second Export: Deduplication (Cache Hit)
    const t1 = performance.now();
    const exportReq2 = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/export`, {
      method: "POST",
      body: JSON.stringify({ deviceId, engineerName: "Lead Engineer" }),
    });
    const exportRes2 = await exportRoute(exportReq2, { params: Promise.resolve({ id: sessionId }) });
    const duration2Ms = performance.now() - t1;

    expect(exportRes2.status).toBe(200);
    const data2 = await exportRes2.json();
    expect(data2.data.isCached).toBe(true);
    expect(data2.data.reportId).toBe(data1.data.reportId);

    // Record measured timings
    expect(duration2Ms).toBeLessThan(duration1Ms);

    // 5. Invalidation: Modify Review Decision -> subsequent export must generate new version
    const reviewReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/review`, {
      method: "POST",
      body: JSON.stringify({
        deviceId,
        engineerName: "Lead Engineer",
        action: "SINGLE",
        decision: {
          checkId: "fg-fw-version",
          decision: "APPROVED",
          finalStatus: "PASS",
          reviewNotes: "Approved mature FortiOS firmware version.",
        },
      }),
    });
    const reviewRes = await postReviewRoute(reviewReq, { params: Promise.resolve({ id: sessionId }) });
    expect(reviewRes.status).toBe(200);

    // Export again: cache should be invalidated
    const exportReq3 = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/export`, {
      method: "POST",
      body: JSON.stringify({ deviceId, engineerName: "Lead Engineer" }),
    });
    const exportRes3 = await exportRoute(exportReq3, { params: Promise.resolve({ id: sessionId }) });
    expect(exportRes3.status).toBe(200);
    const data3 = await exportRes3.json();
    expect(data3.data.isCached).toBe(false);
    expect(data3.data.reportId).not.toBe(data1.data.reportId);

    // 6. Immutability Verification: Verify original template in storage remains unaltered
    const currentTemplateBuffer = await storage.getFile(storedDoc.storagePath);
    const currentHash = crypto.createHash("sha256").update(currentTemplateBuffer).digest("hex");
    expect(currentHash).toBe(originalHash);

    // 7. Verify download response headers
    const downloadReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export/${data3.data.reportId}`
    );
    const downloadRes = await downloadRoute(downloadReq, {
      params: Promise.resolve({ id: sessionId, reportId: data3.data.reportId }),
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(downloadRes.headers.get("content-disposition")).toContain("attachment;");
  });
});
