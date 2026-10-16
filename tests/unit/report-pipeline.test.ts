import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { reportPipeline } from "@/core/workflow/report-pipeline";
import { pipelineLock } from "@/core/workflow/pipeline-lock";

describe("ReportPipeline (Deterministic Processing Pipeline)", () => {
  let sessionId: string;
  let deviceId: string;
  let sourceFileId: string;

  beforeEach(async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Acme Financial",
        vendor: "fortigate",
        status: "DRAFT",
      },
    });
    sessionId = session.id;

    const device = await prisma.device.create({
      data: {
        sessionId,
        hostname: "FW-CORP-PRI",
        model: "FortiGate-200F",
        role: "Primary",
      },
    });
    deviceId = device.id;

    const initialLog = `FW-CORP-PRI # get system status\nVersion: FortiGate-200F v7.2.5\n`;
    const stored = await storage.saveFile(
      sessionId,
      "logs",
      "putty_session.txt",
      Buffer.from(initialLog, "utf8"),
      "text/plain"
    );

    const uploaded = await prisma.uploadedFile.create({
      data: {
        sessionId,
        deviceId,
        originalFilename: "putty_session.txt",
        storedFilename: stored.storedFilename,
        storagePath: stored.storagePath,
        mimeType: "text/plain",
        sizeBytes: stored.sizeBytes,
        type: "PUTTY_LOG",
        hashSha256: stored.hashSha256,
      },
    });
    sourceFileId = uploaded.id;
  });

  afterEach(async () => {
    await prisma.pMSession.deleteMany({
      where: { id: sessionId },
    });
  });

  describe("Fingerprint Computation & Stale Decision Invalidation", () => {
    it("computes distinct fingerprints when status, collection state, or source evidence change", () => {
      const fp1 = reportPipeline.computeFingerprint({
        deviceId,
        checkId: "fg-hw-cpu",
        ruleVersion: "v1.1",
        currentValue: "Instantaneous: 20%",
        status: "REVIEW",
        collectionState: "COMPLETE",
        sourceEvidenceIds: ["exec-1"],
        rawOutputExcerpt: "CPU states: 1% user 1% system",
      });

      const fp2 = reportPipeline.computeFingerprint({
        deviceId,
        checkId: "fg-hw-cpu",
        ruleVersion: "v1.1",
        currentValue: "Instantaneous: 20%",
        status: "REVIEW",
        collectionState: "COMPLETE",
        sourceEvidenceIds: ["exec-1"],
        rawOutputExcerpt: "CPU states: 1% user 1% system",
      });

      // Same inputs produce identical deterministic fingerprint
      expect(fp1).toBe(fp2);

      // Changed source evidence changes fingerprint
      const fpChangedEvidence = reportPipeline.computeFingerprint({
        deviceId,
        checkId: "fg-hw-cpu",
        ruleVersion: "v1.1",
        currentValue: "Instantaneous: 45%",
        status: "REVIEW",
        collectionState: "COMPLETE",
        sourceEvidenceIds: ["exec-1", "exec-2"],
        rawOutputExcerpt: "CPU states: 20% user 25% system",
      });
      expect(fpChangedEvidence).not.toBe(fp1);

      // Changed collection completeness changes fingerprint
      const fpMissing = reportPipeline.computeFingerprint({
        deviceId,
        checkId: "fg-hw-cpu",
        ruleVersion: "v1.1",
        currentValue: null,
        status: "PENDING",
        collectionState: "MISSING",
        sourceEvidenceIds: [],
        rawOutputExcerpt: "",
      });
      expect(fpMissing).not.toBe(fp1);
    });

    it("supersedes previously approved review decision when evidence fingerprint changes on re-run", async () => {
      // 1. Setup existing checklist result with approved decision
      const initialFingerprint = "fp_initial_aaa";
      const checklistResult = await prisma.checklistResult.create({
        data: {
          deviceId,
          checkId: "fg-hw-cpu",
          checkName: "CPU Usage",
          status: "REVIEW",
          collectionState: "COMPLETE",
          currentValue: "Instantaneous: 20%",
          evidenceFingerprint: initialFingerprint,
          reviewRequired: false,
        },
      });

      const priorApprovedDecision = await prisma.reviewDecision.create({
        data: {
          checklistResultId: checklistResult.id,
          decision: "APPROVED",
          proposedStatus: "REVIEW",
          finalStatus: "PASS",
          evidenceFingerprint: initialFingerprint,
          reviewer: "Engineer Alice",
          reviewNotes: "Confirmed 1-hour historical trend in FortiAnalyzer.",
        },
      });

      // 2. Add PuTTY log with changed telemetry (CPU now 85% FAIL)
      const logContent = `FW-CORP-PRI # get system performance status\nCPU states: 40% user 45% system 0% nice 15% idle\nMemory: 1000k total, 400k used (40%)\n`;
      const stored = await storage.saveFile(
        sessionId,
        "logs",
        "putty_session.txt",
        Buffer.from(logContent, "utf8"),
        "text/plain"
      );

      // Update uploaded file storage path
      await prisma.uploadedFile.update({
        where: { id: sourceFileId },
        data: { storagePath: stored.storagePath },
      });

      // 3. Run pipeline
      const result = await reportPipeline.processSession(sessionId);
      expect(result.summary.reReviewRequiredCount).toBeGreaterThan(0);

      // 4. Verify prior decision was superseded and a new pending decision created
      const oldDecision = await prisma.reviewDecision.findUnique({
        where: { id: priorApprovedDecision.id },
      });
      expect(oldDecision?.decision).toBe("SUPERSEDED");

      const newPendingDecision = await prisma.reviewDecision.findFirst({
        where: {
          checklistResultId: checklistResult.id,
          decision: "PENDING",
        },
      });
      expect(newPendingDecision).toBeDefined();
      expect(newPendingDecision?.proposedStatus).toBe("FAIL");
      expect(newPendingDecision?.reviewNotes).toContain("Prior approval superseded");
    });
  });

  describe("Stable Segment Identity & In-Place Updates", () => {
    it("preserves command execution identities when source segments are re-processed", async () => {
      // 1. Initial execution created
      const initialExec = await prisma.commandExecution.create({
        data: {
          deviceId,
          sourceFileId,
          segmentIndex: 0,
          command: "get system status",
          outputContent: "Version: FortiGate-200F v7.2.5",
          parseStatus: "PARSED",
        },
      });

      const storedEvImage = await storage.saveFile(
        sessionId,
        "evidence",
        "cli_initial.png",
        Buffer.from("mock_png_bytes"),
        "image/png"
      );

      // Attach evidence to this execution
      const evidence = await prisma.evidence.create({
        data: {
          commandExecutionId: initialExec.id,
          deviceId,
          title: "System Status",
          imageReference: storedEvImage.storagePath,
          isExcluded: false,
        },
      });

      // 2. Reprocess unchanged source log
      const logContent = `FW-CORP-PRI # get system status\nVersion: FortiGate-200F v7.2.5\n`;
      const storedLog = await storage.saveFile(
        sessionId,
        "logs",
        "putty_session.txt",
        Buffer.from(logContent, "utf8"),
        "text/plain"
      );
      await prisma.uploadedFile.update({
        where: { id: sourceFileId },
        data: { storagePath: storedLog.storagePath },
      });

      await reportPipeline.processSession(sessionId);

      // 3. Execution ID must be preserved, and attached evidence relationship must not be destroyed
      const currentExec = await prisma.commandExecution.findFirst({
        where: { deviceId, sourceFileId, segmentIndex: 0 },
      });
      expect(currentExec?.id).toBe(initialExec.id);

      const currentEvidence = await prisma.evidence.findUnique({
        where: { id: evidence.id },
      });
      expect(currentEvidence?.commandExecutionId).toBe(initialExec.id);
    });
  });

  describe("Partial Inputs & Fallback Modes", () => {
    it("processes in CLI_ONLY mode when no Word report is present", async () => {
      const logContent = `FW-CORP-PRI # get system performance status\nCPU states: 5% user 5% system 0% nice 90% idle\nMemory: 1000k total, 300k used (30%)\n`;
      const storedLog = await storage.saveFile(
        sessionId,
        "logs",
        "putty_session.txt",
        Buffer.from(logContent, "utf8"),
        "text/plain"
      );
      await prisma.uploadedFile.update({
        where: { id: sourceFileId },
        data: { storagePath: storedLog.storagePath },
      });

      const result = await reportPipeline.processSession(sessionId);
      expect(result.mode).toBe("CLI_ONLY");
      const docxStage = result.stages.find((s) => s.stage === "DOCX_INSPECTION");
      expect(docxStage?.status).toBe("SKIPPED");
      expect(result.status).toBe("READY_FOR_REVIEW");
    });

    it("throws clear error when no files have been uploaded", async () => {
      // Remove all files
      await prisma.uploadedFile.deleteMany({
        where: { sessionId },
      });

      await expect(reportPipeline.processSession(sessionId)).rejects.toThrow(
        "No files uploaded for processing"
      );
    });
  });
});
