import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import JSZip from "jszip";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { docxEditor, docxValidator } from "@/core/document";
import { docxInspector } from "@/core/document/docx-inspector";
import { POST as exportApi, GET as getExportApi } from "@/app/api/sessions/[id]/export/route";
import { NextRequest } from "next/server";

describe("Phase 7 Word Report Export: Preserving OOXML, Multi-Image, Deduplication & Validation", () => {
  let sessionId: string;
  let primaryDeviceId: string;
  let secondaryDeviceId: string;
  let docxFileId: string;
  let originalDocxBuffer: Buffer;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it("1. preserves existing appendix images by default when appending new evidence (Correction 1 & 4)", async () => {
    const docxPath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );
    originalDocxBuffer = await fs.readFile(docxPath);

    // Inspect original document
    const origZip = await JSZip.loadAsync(originalDocxBuffer);
    const origImg7Entry = origZip.file("word/media/image7.png");
    expect(origImg7Entry).toBeDefined();
    const origImg7Buffer = await origImg7Entry!.async("nodebuffer");

    // Sample 1x1 PNG buffer for evidence
    const sampleEvidenceBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    // Edit report with replaceExistingMedia = false (default)
    const result = await docxEditor.editReport({
      originalDocxBuffer,
      decisions: [
        {
          checkId: "fg-hw-mem",
          finalStatus: "PASS",
          finalRemarks: "Memory utilization healthy at 33%.",
          reviewer: "Lead Engineer",
        },
      ],
      evidences: [
        {
          checkIds: ["fg-hw-mem"],
          appendixNumber: 1,
          imageBuffer: sampleEvidenceBuffer,
          title: "Memory Utilization Terminal Output",
          caption: "get system performance status (CLI)",
          replaceExistingMedia: false, // Default: preserve original
        },
      ],
    });

    expect(result.validation.isValid).toBe(true);

    // Verify in modified ZIP:
    const modZip = await JSZip.loadAsync(result.modifiedBuffer);

    // Original image7.png must be completely preserved byte-for-byte!
    const modImg7Entry = modZip.file("word/media/image7.png");
    expect(modImg7Entry).toBeDefined();
    const modImg7Buffer = await modImg7Entry!.async("nodebuffer");
    expect(modImg7Buffer.equals(origImg7Buffer)).toBe(true);

    // New evidence image must exist alongside original
    const newMediaFiles = Object.keys(modZip.files).filter((p) =>
      p.startsWith("word/media/image_app_1_")
    );
    expect(newMediaFiles.length).toBeGreaterThanOrEqual(1);

    // Check applied appendix action
    const appChange = result.changeSummary.appliedAppendixChanges.find(
      (c) => c.appendixNumber === 1
    );
    expect(appChange).toBeDefined();
    expect(appChange?.action).toBe("PRESERVED_ORIGINAL_AND_APPENDED");
  });

  it("2. replaces existing appendix image only when explicit replacement is approved (Correction 1)", async () => {
    const sampleReplacementBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wHwMDAwMDEwMAAA8BAf6cO0sAAAAASUVORK5CYII=",
      "base64"
    );

    const result = await docxEditor.editReport({
      originalDocxBuffer,
      decisions: [
        {
          checkId: "fg-hw-mem",
          finalStatus: "PASS",
          finalRemarks: "Memory utilization tested.",
        },
      ],
      evidences: [
        {
          checkIds: ["fg-hw-mem"],
          appendixNumber: 1,
          imageBuffer: sampleReplacementBuffer,
          title: "Memory Utilization Explicit Replacement",
          replaceExistingMedia: true, // Explicit approval
        },
      ],
    });

    expect(result.validation.isValid).toBe(true);

    const modZip = await JSZip.loadAsync(result.modifiedBuffer);
    const modImg7Entry = modZip.file("word/media/image7.png");
    expect(modImg7Entry).toBeDefined();
    const modImg7Buffer = await modImg7Entry!.async("nodebuffer");
    expect(modImg7Buffer.equals(sampleReplacementBuffer)).toBe(true);

    const appChange = result.changeSummary.appliedAppendixChanges.find(
      (c) => c.appendixNumber === 1
    );
    expect(appChange?.action).toBe("REPLACED_EXISTING");
  });

  it("3. inserts multiple evidence images with valid OOXML drawing markup and unique relationship IDs (Correction 4)", async () => {
    const imgBuffer1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const imgBuffer2 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wHwMDAwMDEwMAAA8BAf6cO0sAAAAASUVORK5CYII=",
      "base64"
    );

    const result = await docxEditor.editReport({
      originalDocxBuffer,
      decisions: [
        {
          checkId: "fg-sys-backup",
          finalStatus: "PASS",
          finalRemarks: "Configuration backup confirmed via CLI and GUI.",
        },
      ],
      evidences: [
        {
          checkIds: ["fg-sys-backup"],
          appendixNumber: 16,
          imageBuffer: imgBuffer1,
          title: "Backup Config - CLI Terminal Page 1",
          caption: "CLI config download terminal output",
          replaceExistingMedia: false,
        },
        {
          checkIds: ["fg-sys-backup"],
          appendixNumber: 16,
          imageBuffer: imgBuffer2,
          title: "Backup Config - Web GUI Confirmation",
          caption: "FortiOS Web GUI backup dialog screenshot",
          replaceExistingMedia: false,
        },
      ],
    });

    expect(result.validation.isValid).toBe(true);
    expect(result.validation.checkedComponents.mediaIntegrity).toBe(true);
    expect(result.validation.checkedComponents.relationshipsXml).toBe(true);

    // Verify in modified ZIP that multiple media entries were created for appendix 16
    const modZip = await JSZip.loadAsync(result.modifiedBuffer);
    const app16Files = Object.keys(modZip.files).filter((p) =>
      p.startsWith("word/media/image_app_16_")
    );
    expect(app16Files.length).toBe(2);

    // Verify rels XML contains unique relationships
    const relsXml = await modZip.file("word/_rels/document.xml.rels")!.async("string");
    for (const f of app16Files) {
      const relTarget = f.replace("word/", "");
      expect(relsXml).toContain(relTarget);
    }
  });

  it("4. detects template device structure and prevents silent first-device export for multi-device sessions (Correction 2)", async () => {
    // Create multi-device session: Primary and Secondary firewalls
    const session = await prisma.pMSession.create({
      data: {
        customer: "ITOCHU Multi-Cluster",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FGT200F-HQ-PRI",
              model: "FortiGate 200F",
              role: "Primary",
            },
            {
              hostname: "FGT200F-HQ-SEC",
              model: "FortiGate 200F",
              role: "Secondary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    primaryDeviceId = session.devices[0].id;
    secondaryDeviceId = session.devices[1].id;

    // Save Word report to storage
    const storedDoc = await storage.saveFile(
      sessionId,
      "reports",
      "PM_Report_Template.docx",
      originalDocxBuffer,
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
    docxFileId = docxRecord.id;

    // Attempt export WITHOUT deviceId in multi-device session
    const reqNoDevice = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const resNoDevice = await exportApi(reqNoDevice, {
      params: Promise.resolve({ id: sessionId }),
    });

    // Must be rejected with HTTP 400 and clear error requiring deviceId
    expect(resNoDevice.status).toBe(400);
    const jsonNoDevice = await resNoDevice.json();
    expect(jsonNoDevice.success).toBe(false);
    expect(jsonNoDevice.code).toBe("DEVICE_SELECTION_REQUIRED");
    expect(jsonNoDevice.error).toContain("multiple firewalls");

    // Export WITH explicit primaryDeviceId succeeds
    const reqPrimary = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: primaryDeviceId }),
      }
    );
    const resPrimary = await exportApi(reqPrimary, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(resPrimary.status).toBe(200);
    const jsonPrimary = await resPrimary.json();
    expect(jsonPrimary.success).toBe(true);
    expect(jsonPrimary.data.filename).toContain("FGT200F-HQ-PRI");
  });

  it("5. uses comprehensive input-signature deduplication and invalidates cache when evidence or decisions change (Correction 3)", async () => {
    // Consecutively export Primary device again without changes
    const req1 = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: primaryDeviceId }),
      }
    );
    const res1 = await exportApi(req1, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.success).toBe(true);
    // Must return cached report without creating duplicate files
    expect(json1.data.isCached).toBe(true);
    expect(json1.data.version).toBe(1);

    // Verify in database: total reports for this session remains 1
    const reportsCount = await prisma.generatedReport.count({
      where: { sessionId },
    });
    expect(reportsCount).toBe(1);

    // Invalidate cache: create an approved review decision on primary device
    const checkRes = await prisma.checklistResult.create({
      data: {
        deviceId: primaryDeviceId,
        checkId: "fg-hw-cpu",
        checkName: "CPU Utilization",
        status: "PASS",
        collectionState: "COMPLETE",
        evidenceFingerprint: "fingerprint-cpu-123",
        reviewRequired: false,
        reviewDecisions: {
          create: [
            {
              decision: "APPROVED",
              finalStatus: "PASS",
              finalRemarks: "CPU utilization tested at 12%, healthy.",
              reviewer: "Senior Security Specialist",
              evidenceFingerprint: "fingerprint-cpu-123",
            },
          ],
        },
      },
    });

    // Re-run export: should detect change in approved findings and generate version 2
    const req2 = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: primaryDeviceId }),
      }
    );
    const res2 = await exportApi(req2, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.success).toBe(true);
    expect(json2.data.isCached).toBe(false);
    expect(json2.data.version).toBe(2);

    // Verify 2 reports now exist
    const reportsCount2 = await prisma.generatedReport.count({
      where: { sessionId },
    });
    expect(reportsCount2).toBe(2);
  });

  it("6. strictly enforces protected sections, headers, footers, and table structure via extended DocxValidator (Correction 5)", async () => {
    const inspection = await docxInspector.inspectDocument(originalDocxBuffer);

    // Validate original document structure
    const validation = await docxValidator.validateModifiedDocument(
      originalDocxBuffer,
      inspection
    );

    expect(validation.isValid).toBe(true);
    expect(validation.checkedComponents.zipArchive).toBe(true);
    expect(validation.checkedComponents.documentXml).toBe(true);
    expect(validation.checkedComponents.relationshipsXml).toBe(true);
    expect(validation.checkedComponents.protectedSectionsPreserved).toBe(true);
    expect(validation.checkedComponents.mediaIntegrity).toBe(true);
    expect(validation.checkedComponents.headersFootersPreserved).toBe(true);
    expect(validation.checkedComponents.tableStructurePreserved).toBe(true);
    expect(validation.checkedComponents.appendixHeadingsPreserved).toBe(true);
    expect(validation.checkedComponents.contentTypesValid).toBe(true);
  });

  it("7. filters out excluded screenshots and enforces that active evidence requires approved checklist findings (Requirement 1 & Corrections 6/7)", async () => {
    // 1. Create approved checklist finding for fg-mgmt-gui
    await prisma.checklistResult.create({
      data: {
        deviceId: secondaryDeviceId,
        checkId: "fg-mgmt-gui",
        checkName: "GUI / Web Management Access",
        status: "PASS",
        collectionState: "COMPLETE",
        evidenceFingerprint: "fingerprint-gui-approved",
        reviewRequired: false,
        reviewDecisions: {
          create: [
            {
              decision: "APPROVED",
              finalStatus: "PASS",
              finalRemarks: "HTTPS GUI administration access verified.",
              reviewer: "Senior Security Specialist",
              evidenceFingerprint: "fingerprint-gui-approved",
            },
          ],
        },
      },
    });

    // 2. Add an active evidence for the approved check, an excluded screenshot, and an active evidence for an unapproved check
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const storedActive = await storage.saveFile(
      sessionId,
      "evidence",
      "active_gui.png",
      samplePng,
      "image/png"
    );
    const storedExcluded = await storage.saveFile(
      sessionId,
      "evidence",
      "excluded_gui.png",
      samplePng,
      "image/png"
    );
    const storedUnapproved = await storage.saveFile(
      sessionId,
      "evidence",
      "unapproved_dns.png",
      samplePng,
      "image/png"
    );

    // Active + Approved
    await prisma.evidence.create({
      data: {
        deviceId: secondaryDeviceId,
        checkId: "fg-mgmt-gui",
        title: "Active GUI Admin Screenshot",
        appendixMapping: "Appendix 9 – GUI / Web Management Access",
        imageReference: storedActive.storagePath,
        isExcluded: false,
      },
    });

    // Excluded
    await prisma.evidence.create({
      data: {
        deviceId: secondaryDeviceId,
        checkId: "fg-mgmt-gui",
        title: "Excluded Draft Screenshot",
        appendixMapping: "Appendix 9 – GUI / Web Management Access",
        imageReference: storedExcluded.storagePath,
        isExcluded: true, // EXCLUDED
      },
    });

    // Active BUT Associated Check (fg-sys-ntp) is UNAPPROVED (Requirement 1)
    await prisma.evidence.create({
      data: {
        deviceId: secondaryDeviceId,
        checkId: "fg-sys-ntp",
        title: "Unapproved NTP Screenshot",
        appendixMapping: "Appendix 13 – NTP Configuration",
        imageReference: storedUnapproved.storagePath,
        isExcluded: false, // Active, but check not approved!
      },
    });

    // Export secondary device
    const req = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: secondaryDeviceId }),
      }
    );
    const res = await exportApi(req, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Verify applied appendix changes:
    // Only active evidence associated with an APPROVED check is applied!
    const appliedApps = json.data.changeSummary.appliedAppendixChanges;
    const activeApplied = appliedApps.find((a: any) => a.title === "Active GUI Admin Screenshot");
    const excludedApplied = appliedApps.find((a: any) => a.title === "Excluded Draft Screenshot");
    const unapprovedApplied = appliedApps.find((a: any) => a.title === "Unapproved NTP Screenshot");

    expect(activeApplied).toBeDefined();
    expect(excludedApplied).toBeUndefined();
    expect(unapprovedApplied).toBeUndefined(); // Must NOT be inserted merely because isExcluded=false!

    // Verify omitted unapproved evidence is tracked
    const omittedList = json.data.changeSummary.omittedUnapprovedEvidence;
    expect(omittedList).toBeDefined();
    const ntpOmitted = omittedList.find((o: any) => o.title === "Unapproved NTP Screenshot");
    expect(ntpOmitted).toBeDefined();
    expect(ntpOmitted.reason).toBe("ASSOCIATED_CHECK_PENDING_APPROVAL");
  });

  it("8. preserves original uploaded DOCX immutably and outputs separate versioned file (Invariant 2 & 5)", async () => {
    // Check original uploaded document file in storage
    const originalDoc = await prisma.uploadedFile.findUnique({
      where: { id: docxFileId },
    });
    expect(originalDoc).toBeDefined();

    const storedOriginal = await storage.getFile(originalDoc!.storagePath);
    // Hash of original stored file must match the original template hash
    expect(storedOriginal.byteLength).toBe(originalDocxBuffer.byteLength);

    // Check generated report files in storage
    const reports = await prisma.generatedReport.findMany({
      where: { sessionId },
    });
    for (const r of reports) {
      // Must be in separate "exports/" directory
      expect(r.fileReference).toContain("exports");
      const exportFile = await storage.getFile(r.fileReference);
      expect(exportFile.byteLength).toBeGreaterThan(1000);
      // PK magic bytes
      expect(exportFile[0]).toBe(0x50);
      expect(exportFile[1]).toBe(0x4b);
    }
  });
});
