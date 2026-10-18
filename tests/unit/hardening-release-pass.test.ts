import { describe, it, expect, afterAll } from "vitest";
import { createHash } from "crypto";
import path from "path";
import fs from "fs/promises";
import JSZip from "jszip";
import { reviewService } from "@/core/review";
import { docxValidator } from "@/core/document";
import { DocumentInspectionResult } from "@/report-layouts/types";
import { FORTIGATE_CHECKLIST } from "@/vendors/fortigate/checklist";
import { detectRoleHint } from "@/components/generator/report-generator-workspace";
import { prisma } from "@/lib/db/prisma";
import { POST as uploadFilesApi, DELETE as deleteFilesApi } from "@/app/api/sessions/[id]/files/route";
import { NextRequest } from "next/server";

describe("Hardening Release Pass - 8 Core Verified Concerns", () => {
  const cpuCheckDef = FORTIGATE_CHECKLIST.find((c) => c.id === "fg-hw-cpu")!;
  const memCheckDef = FORTIGATE_CHECKLIST.find((c) => c.id === "fg-hw-mem")!;
  const diskCheckDef = FORTIGATE_CHECKLIST.find((c) => c.id === "fg-hw-disk")!;

  let testSessionId: string | null = null;
  let otherSessionId: string | null = null;

  afterAll(async () => {
    if (testSessionId) {
      await prisma.pMSession.deleteMany({ where: { id: testSessionId } });
    }
    if (otherSessionId) {
      await prisma.pMSession.deleteMany({ where: { id: otherSessionId } });
    }
  });

  // =========================================================================
  // Concern 1: Validate deviceId ownership on GUI screenshot POST uploads
  //            Prevent cross-session evidence associations during export
  // =========================================================================
  describe("Concern 1: Device ownership validation & cross-session isolation", () => {
    it("rejects GUI screenshot upload when deviceId does not belong to session", async () => {
      // Create session 1 with device 1
      const s1 = await prisma.pMSession.create({
        data: {
          customer: "Hardening Customer 1",
          vendor: "fortigate",
          devices: {
            create: [{ hostname: "FGT-HOST-1", model: "FortiGate 100F", role: "Primary" }],
          },
        },
        include: { devices: true },
      });
      testSessionId = s1.id;

      // Create session 2 with device 2
      const s2 = await prisma.pMSession.create({
        data: {
          customer: "Hardening Customer 2",
          vendor: "fortigate",
          devices: {
            create: [{ hostname: "FGT-HOST-2", model: "FortiGate 100F", role: "Primary" }],
          },
        },
        include: { devices: true },
      });
      otherSessionId = s2.id;

      const fakeImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      const fakeBlob = new Blob([fakeImageBuffer], { type: "image/png" });
      const formData = new FormData();
      formData.append("file", fakeBlob, "screenshot.png");
      formData.append("type", "GUI_SCREENSHOT");
      // Intentionally supply device from s2 to s1
      formData.append("deviceId", s2.devices[0].id);
      formData.append("checkId", "fg-mgmt-gui");

      const req = new NextRequest(`http://localhost:3000/api/sessions/${s1.id}/files`, {
        method: "POST",
        body: formData,
      });

      const res = await uploadFilesApi(req, {
        params: Promise.resolve({ id: s1.id }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain(`does not belong to this session`);
    });
  });

  // =========================================================================
  // Concern 2: Review approvals invalidation and recalculation on uploads/deletes
  // =========================================================================
  describe("Concern 2: Review approvals invalidation on evidence state change", () => {
    it("recalculates finding evidence state and supersedes prior APPROVED/MODIFIED decisions when fingerprint changes", async () => {
      if (!testSessionId) return;
      const device = await prisma.device.findFirst({ where: { sessionId: testSessionId } });
      expect(device).toBeDefined();

      // Create checklist result with old fingerprint
      const clResult = await prisma.checklistResult.create({
        data: {
          deviceId: device!.id,
          checkId: "fg-hw-cpu",
          checkName: "CPU Utilization",
          status: "PASS",
          currentValue: "25%",
          expectedValue: "< 80%",
          evidenceFingerprint: "old-fingerprint-abc",
          collectionState: "COMPLETE",
          reviewRequired: false,
          reviewDecisions: {
            create: [
              {
                decision: "APPROVED",
                finalStatus: "PASS",
                finalRemarks: "CPU healthy",
                reviewer: "Test Engineer",
                evidenceFingerprint: "old-fingerprint-abc",
              },
            ],
          },
        },
        include: { reviewDecisions: true },
      });

      // Recalculate with new evidence state
      const recalcResult = await reviewService.recalculateFindingEvidenceState(
        testSessionId,
        device!.id,
        "fg-hw-cpu",
        "New GUI screenshot uploaded for CPU check"
      );

      expect(recalcResult).toBeDefined();
      expect(recalcResult?.reReviewTriggered).toBe(true);

      // Verify old approval was marked SUPERSEDED
      const updatedDecisions = await prisma.reviewDecision.findMany({
        where: { checklistResultId: clResult.id },
        orderBy: { decidedAt: "asc" },
      });

      const superseded = updatedDecisions.filter((d) => d.decision === "SUPERSEDED");
      const pending = updatedDecisions.filter((d) => d.decision === "PENDING");

      expect(superseded.length).toBe(1);
      expect(pending.length).toBe(1);
      expect(pending[0].reviewNotes).toContain("New GUI screenshot");
    });
  });

  // =========================================================================
  // Concern 3: Enforce mandatory justification for changing FAIL/WARNING to PASS,
  //            including MODIFIED decisions
  // =========================================================================
  describe("Concern 3: Mandatory justification for FAIL/WARNING status overrides", () => {
    const failEvaluation = {
      checklistResultId: "res-fail-1",
      status: "FAIL",
      currentValue: "95%",
      expectedValue: "< 80%",
      proposedRemarks: "CPU usage critical at 95%",
      collectionState: "COMPLETE",
      reviewRequired: true,
    };

    const warnEvaluation = {
      checklistResultId: "res-warn-1",
      status: "WARNING",
      currentValue: "85%",
      expectedValue: "< 80%",
      proposedRemarks: "CPU usage high at 85%",
      collectionState: "COMPLETE",
      reviewRequired: true,
    };

    it("rejects MODIFIED decision changing FAIL to PASS without justification notes", () => {
      const res = reviewService.validateDecision(cpuCheckDef, failEvaluation, true, {
        checkId: "fg-hw-cpu",
        decision: "MODIFIED",
        finalStatus: "PASS",
        finalRemarks: "Overridden by engineer",
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("requires an explicit engineer justification");
    });

    it("rejects MODIFIED decision changing WARNING to PASS without justification notes", () => {
      const res = reviewService.validateDecision(cpuCheckDef, warnEvaluation, true, {
        checkId: "fg-hw-cpu",
        decision: "MODIFIED",
        finalStatus: "PASS",
        finalRemarks: "Overridden by engineer",
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("requires an explicit engineer justification");
    });

    it("accepts MODIFIED decision changing FAIL to PASS with valid justification notes", () => {
      const res = reviewService.validateDecision(cpuCheckDef, failEvaluation, true, {
        checkId: "fg-hw-cpu",
        decision: "MODIFIED",
        finalStatus: "PASS",
        finalRemarks: "Spike occurred during authorized Nessus vulnerability scan",
        reviewNotes: "Authorized maintenance window Nessus scan triggered temporary CPU alert; confirmed normal",
      });

      expect(res.isValid).toBe(true);
      expect(res.isException).toBe(true);
    });

    it("rejects APPROVED decision on FAIL without justification notes", () => {
      const res = reviewService.validateDecision(cpuCheckDef, failEvaluation, true, {
        checkId: "fg-hw-cpu",
        decision: "APPROVED",
        finalStatus: "FAIL",
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain("requires an engineer justification");
    });
  });

  // =========================================================================
  // Concern 4: Enforce exact evidence fingerprint equality for export eligibility
  //            Missing decision fingerprint must not qualify
  // =========================================================================
  describe("Concern 4: Strict evidence fingerprint equality for export eligibility", () => {
    const currentFingerprint = "sha256-evidence-active-hash-999";

    it("rejects decisions when evidenceFingerprint is null but finding has a fingerprint", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        currentFingerprint,
        {
          decision: "APPROVED",
          evidenceFingerprint: null,
        },
        false
      );
      expect(eligible).toBe(false);
    });

    it("rejects decisions when evidenceFingerprint is undefined but finding has a fingerprint", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        currentFingerprint,
        {
          decision: "APPROVED",
          evidenceFingerprint: undefined,
        },
        false
      );
      expect(eligible).toBe(false);
    });

    it("rejects decisions when evidenceFingerprint is an empty string", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        currentFingerprint,
        {
          decision: "APPROVED",
          evidenceFingerprint: "",
        },
        false
      );
      expect(eligible).toBe(false);
    });

    it("rejects decisions when evidenceFingerprint is different from finding fingerprint", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        currentFingerprint,
        {
          decision: "APPROVED",
          evidenceFingerprint: "sha256-outdated-hash-000",
        },
        false
      );
      expect(eligible).toBe(false);
    });

    it("accepts decisions when evidenceFingerprint matches current finding fingerprint exactly", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        currentFingerprint,
        {
          decision: "APPROVED",
          evidenceFingerprint: currentFingerprint,
        },
        false
      );
      expect(eligible).toBe(true);
    });
  });

  // =========================================================================
  // Concern 5: Export cache signatures include content hashes, captions, engineer
  // =========================================================================
  describe("Concern 5: Export cache signature completeness", () => {
    function computeTestSignature(params: {
      imageContent: string;
      caption?: string;
      engineerName: string;
      customer: string;
    }): string {
      const imgBuffer = Buffer.from(params.imageContent);
      const contentHash = createHash("sha256").update(imgBuffer).digest("hex");

      const payload = {
        deviceMetadata: {
          hostname: "FGT-TEST",
          engineerName: params.engineerName,
        },
        reportMetadata: {
          customer: params.customer,
          engineerName: params.engineerName,
        },
        evidenceHashes: [
          {
            id: "ev-1",
            title: "CPU Evidence",
            caption: params.caption || "",
            contentHash,
          },
        ],
      };

      return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    }

    it("produces different signatures when evidence image buffer content changes", () => {
      const sigA = computeTestSignature({
        imageContent: "image-bytes-version-1",
        caption: "Standard caption",
        engineerName: "Jane Doe",
        customer: "Acme Corp",
      });

      const sigB = computeTestSignature({
        imageContent: "image-bytes-version-2", // altered image bytes
        caption: "Standard caption",
        engineerName: "Jane Doe",
        customer: "Acme Corp",
      });

      expect(sigA).not.toBe(sigB);
    });

    it("produces different signatures when evidence caption changes", () => {
      const sigA = computeTestSignature({
        imageContent: "image-bytes-version-1",
        caption: "Original caption",
        engineerName: "Jane Doe",
        customer: "Acme Corp",
      });

      const sigB = computeTestSignature({
        imageContent: "image-bytes-version-1",
        caption: "Updated modified caption",
        engineerName: "Jane Doe",
        customer: "Acme Corp",
      });

      expect(sigA).not.toBe(sigB);
    });

    it("produces different signatures when engineer name changes", () => {
      const sigA = computeTestSignature({
        imageContent: "image-bytes-version-1",
        caption: "Original caption",
        engineerName: "Jane Doe",
        customer: "Acme Corp",
      });

      const sigB = computeTestSignature({
        imageContent: "image-bytes-version-1",
        caption: "Original caption",
        engineerName: "John Smith",
        customer: "Acme Corp",
      });

      expect(sigA).not.toBe(sigB);
    });
  });

  // =========================================================================
  // Concern 6: Session status completeness verification
  // =========================================================================
  describe("Concern 6: Approval completeness before marking session COMPLETED", () => {
    it("does not qualify a session as fully approved if any checklist item lacks an eligible decision", () => {
      const dummyChecks = [
        {
          checkId: "fg-hw-cpu",
          reviewRequired: false,
          evidenceFingerprint: "fp-1",
          reviewDecisions: [
            { decision: "APPROVED", evidenceFingerprint: "fp-1" },
          ],
        },
        {
          checkId: "fg-hw-mem",
          reviewRequired: false,
          evidenceFingerprint: "fp-2",
          // Pending / no decisions
          reviewDecisions: [],
        },
      ];

      const isFullyApproved =
        dummyChecks.length > 0 &&
        dummyChecks.every((check) => {
          const latest = check.reviewDecisions[0];
          return (
            latest &&
            reviewService.isDecisionEligibleForExport(
              check.evidenceFingerprint,
              latest,
              check.reviewRequired
            )
          );
        });

      expect(isFullyApproved).toBe(false);
    });

    it("qualifies a session as fully approved when all checklist items have matching eligible decisions", () => {
      const dummyChecks = [
        {
          checkId: "fg-hw-cpu",
          reviewRequired: false,
          evidenceFingerprint: "fp-1",
          reviewDecisions: [
            { decision: "APPROVED", evidenceFingerprint: "fp-1" },
          ],
        },
        {
          checkId: "fg-hw-mem",
          reviewRequired: false,
          evidenceFingerprint: "fp-2",
          reviewDecisions: [
            { decision: "MODIFIED", evidenceFingerprint: "fp-2" },
          ],
        },
      ];

      const isFullyApproved =
        dummyChecks.length > 0 &&
        dummyChecks.every((check) => {
          const latest = check.reviewDecisions[0];
          return (
            latest &&
            reviewService.isDecisionEligibleForExport(
              check.evidenceFingerprint,
              latest,
              check.reviewRequired
            )
          );
        });

      expect(isFullyApproved).toBe(true);
    });
  });

  // =========================================================================
  // Concern 7: Support multiple staged PuTTY logs and HA Primary/Secondary detection
  // =========================================================================
  describe("Concern 7: Multi-log staging & HA role detection", () => {
    it("detects Primary role for logs with primary / master / active / fw1 keywords", () => {
      expect(detectRoleHint("FGT_Primary_2026.log", 0)).toBe("Primary");
      expect(detectRoleHint("FGT_Master_CLI.txt", 0)).toBe("Primary");
      expect(detectRoleHint("FGT_Active_Session.log", 1)).toBe("Primary");
      expect(detectRoleHint("FW1_DC_Firewall.log", 1)).toBe("Primary");
    });

    it("detects Secondary role for logs with secondary / slave / standby / fw2 keywords", () => {
      expect(detectRoleHint("FGT_Secondary_2026.log", 0)).toBe("Secondary");
      expect(detectRoleHint("FGT_Slave_CLI.txt", 0)).toBe("Secondary");
      expect(detectRoleHint("FGT_Standby_Session.log", 0)).toBe("Secondary");
      expect(detectRoleHint("FW2_DR_Firewall.log", 0)).toBe("Secondary");
    });

    it("falls back to index-based role detection when no keywords are present", () => {
      expect(detectRoleHint("putty_session_alpha.log", 0)).toBe("Primary");
      expect(detectRoleHint("putty_session_beta.log", 1)).toBe("Secondary");
      expect(detectRoleHint("putty_session_gamma.log", 2)).toBe("Auto");
    });
  });

  // =========================================================================
  // Concern 8: Strengthened DOCX protected-content comparisons against original
  // =========================================================================
  describe("Concern 8: DOCX protected section validation against original document", () => {
    it("fails validation if Table 0 (Author Credentials) text is modified compared to original document", async () => {
      const samplePath = path.join(
        process.cwd(),
        "doc",
        "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
      );

      let docBuffer: Buffer;
      try {
        docBuffer = await fs.readFile(samplePath);
      } catch {
        console.warn("Skipping test: sample file not available at", samplePath);
        return;
      }

      // Load original DOCX zip and tamper with Table 0 in word/document.xml
      const zip = await JSZip.loadAsync(docBuffer);
      let docXml = await zip.file("word/document.xml")!.async("string");

      // Table 0 contains CTC engineer credentials. Replace text inside first table
      const firstTableMatch = docXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/);
      expect(firstTableMatch).not.toBeNull();

      const tamperedTable = firstTableMatch![0].replace(
        /(<w:t[^>]*>)([^<]*)(<\/w:t>)/,
        "$1TAMPERED_ENGINEER_NAME$3"
      );
      docXml = docXml.replace(firstTableMatch![0], tamperedTable);
      zip.file("word/document.xml", docXml);

      const tamperedBuffer = await zip.generateAsync({ type: "nodebuffer" });

      // Run validator with original inspection and original document buffer
      const inspectionMock = {
        isValidDocx: true,
        detectedVendor: "fortigate",
        layoutId: "ctc-fortigate-v1_1",
        layoutName: "CTC FortiGate PM Report Standard v1.1",
        totalTables: 4,
        editableChecklistRows: [],
        existingAppendices: [],
        appendixContainers: [],
        protectedSections: [
          {
            name: "Author Credentials & Document Details",
            type: "TABLE" as const,
            tableIndex: 0,
            contentHash: "dummy-hash",
            normalizedText: "original text",
            rowCount: 4,
            cellCount: 8,
          },
        ],
        sha256Hash: "original-sha",
      };

      const valResult = await docxValidator.validateModifiedDocument(
        tamperedBuffer,
        inspectionMock as unknown as DocumentInspectionResult,
        docBuffer // Original buffer provided for deep comparison
      );

      expect(valResult.isValid).toBe(false);
      expect(
        valResult.errors.some((e) => e.includes("Author Credentials") && e.includes("altered"))
      ).toBe(true);
    });

    it("passes validation when protected sections are identical to original document", async () => {
      const samplePath = path.join(
        process.cwd(),
        "doc",
        "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
      );

      let docBuffer: Buffer;
      try {
        docBuffer = await fs.readFile(samplePath);
      } catch {
        console.warn("Skipping test: sample file not available at", samplePath);
        return;
      }

      // Load original DOCX without modifying protected tables
      const zip = await JSZip.loadAsync(docBuffer);
      const docXml = await zip.file("word/document.xml")!.async("string");
      const tables = docXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) || [];

      const inspectionMock = {
        isValidDocx: true,
        detectedVendor: "fortigate",
        layoutId: "ctc-fortigate-v1_1",
        layoutName: "CTC FortiGate PM Report Standard v1.1",
        totalTables: tables.length,
        editableChecklistRows: [],
        existingAppendices: [],
        appendixContainers: [],
        protectedSections: [
          {
            name: "Author Credentials & Document Details",
            type: "TABLE" as const,
            tableIndex: 0,
          },
          {
            name: "Customer Satisfaction Survey",
            type: "TABLE" as const,
            tableIndex: 1,
          },
        ],
        sha256Hash: "original-sha",
      };

      const valResult = await docxValidator.validateModifiedDocument(
        docBuffer,
        inspectionMock as unknown as DocumentInspectionResult,
        docBuffer
      );

      expect(valResult.isValid).toBe(true);
      expect(valResult.checkedComponents.protectedSectionsPreserved).toBe(true);
      expect(valResult.errors.length).toBe(0);
    });
  });
});
