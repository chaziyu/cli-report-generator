import { createHash } from "crypto";
import {
  ReviewCheckItem,
  ReviewDecisionInput,
  ReviewDecisionType,
  ReviewOriginalDocumentValue,
  ReviewProposedEvaluationValue,
  ReviewEvidenceSummary,
  ReviewDecisionRecord,
  ReviewSessionSummary,
  EvidenceHealthStatus,
  EvidenceHealthSummary,
  EvidenceSourceType,
} from "./types";
import { VendorCheckItemDefinition, VendorId } from "@/vendors/types";
import { EditableChecklistRowTarget, ReportLayoutDefinition } from "@/report-layouts/types";
import { prisma } from "@/lib/db/prisma";
import { vendorRegistry } from "@/vendors";

export interface DecisionValidationResult {
  isValid: boolean;
  error?: string;
  isException?: boolean;
}

export class ReviewService {
  /**
   * Normalizes status string for comparison (e.g. "N/A" -> "NA", "pass" -> "PASS").
   */
  normalizeStatus(status?: string | null): string {
    if (!status) return "PENDING";
    const s = status.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (s === "NOTAPPLICABLE" || s === "NOTAPPLY" || s === "NA") return "NA";
    if (s === "PASSED" || s === "PASS") return "PASS";
    if (s === "FAILED" || s === "FAIL") return "FAIL";
    if (s === "WARN" || s === "WARNING") return "WARNING";
    if (s === "REVIEW" || s === "MANUAL") return "REVIEW";
    return s || "PENDING";
  }

  /**
   * Evaluates if a proposed value or final decision differs from the original document value.
   */
  hasDiffFromOriginal(
    orig: ReviewOriginalDocumentValue,
    proposedStatus?: string | null,
    proposedRemarks?: string | null
  ): boolean {
    if (!orig.foundInDocument) return true;

    const normOrigStatus = this.normalizeStatus(orig.status);
    const normPropStatus = this.normalizeStatus(proposedStatus);

    if (normOrigStatus !== normPropStatus) return true;

    const normOrigRemarks = (orig.remarks || "").trim().toLowerCase();
    const normPropRemarks = (proposedRemarks || "").trim().toLowerCase();

    // If both have remarks and they differ meaningfully
    if (normOrigRemarks !== normPropRemarks) {
      // Ignore tiny formatting differences like trailing periods
      const cleanOrig = normOrigRemarks.replace(/[.\s]/g, "");
      const cleanProp = normPropRemarks.replace(/[.\s]/g, "");
      if (cleanOrig !== cleanProp) return true;
    }

    return false;
  }

  /**
   * Checks whether approving or overriding this check strictly requires an explicit justification/exception.
   *
   * Business rule from CTC specification:
   * "An approval does not override missing mandatory evidence without an explicit exception record."
   */
  checkRequiresJustification(
    checkDef: VendorCheckItemDefinition,
    evaluation: ReviewProposedEvaluationValue,
    hasEvidence: boolean,
    targetStatus?: string
  ): boolean {
    const normEvalStatus = this.normalizeStatus(evaluation.status);
    const normTarget = this.normalizeStatus(targetStatus || evaluation.status);

    const isEvidenceMandatory = Boolean(checkDef.targetAppendix);

    // 1. Mandatory evidence check: Requires evidence but collection is MISSING or no evidence exists
    if (isEvidenceMandatory && (!hasEvidence || evaluation.collectionState === "MISSING")) {
      return true;
    }

    // 2. Evaluated status is FAIL or WARNING
    if (normEvalStatus === "FAIL" || normEvalStatus === "WARNING") {
      return true;
    }

    // 3. Target status overridden to NA (requires justification why it is N/A)
    if (normTarget === "NA" && normEvalStatus !== "NA") {
      return true;
    }

    // 4. Overriding a FAIL or WARNING to PASS
    if ((normEvalStatus === "FAIL" || normEvalStatus === "WARNING") && normTarget === "PASS") {
      return true;
    }

    return false;
  }

  /**
   * Validates an engineer's review decision before persistence.
   */
  validateDecision(
    checkDef: VendorCheckItemDefinition,
    evaluation: ReviewProposedEvaluationValue,
    hasEvidence: boolean,
    input: ReviewDecisionInput
  ): DecisionValidationResult {
    const validDecisions: ReviewDecisionType[] = ["APPROVED", "MODIFIED", "REJECTED"];
    if (!validDecisions.includes(input.decision)) {
      return {
        isValid: false,
        error: `Invalid decision "${input.decision}". Must be one of: APPROVED, MODIFIED, REJECTED.`,
      };
    }

    // For REJECTED:
    if (input.decision === "REJECTED") {
      return { isValid: true };
    }

    const targetStatus = input.finalStatus || evaluation.status;
    const isEvidenceMandatory = Boolean(checkDef.targetAppendix);
    const reqJustification = this.checkRequiresJustification(
      checkDef,
      evaluation,
      hasEvidence,
      targetStatus
    );

    const hasNotes = Boolean(input.reviewNotes && input.reviewNotes.trim().length > 0);

    // Rule: Missing mandatory evidence cannot be approved without explicit justification
    if (
      isEvidenceMandatory &&
      (!hasEvidence || evaluation.collectionState === "MISSING") &&
      !hasNotes
    ) {
      return {
        isValid: false,
        error: `Approval for "${checkDef.taskName}" requires an explicit justification/exception record because mandatory CLI evidence is missing.`,
        isException: true,
      };
    }

    // Rule: Warnings or Failures approved without justification
    const normEvalStatus = this.normalizeStatus(evaluation.status);
    if ((normEvalStatus === "FAIL" || normEvalStatus === "WARNING") && !hasNotes && input.decision === "APPROVED") {
      return {
        isValid: false,
        error: `Approval for "${checkDef.taskName}" requires an engineer justification because the check evaluated to ${normEvalStatus}.`,
        isException: true,
      };
    }

    // Rule: Overriding to NA without justification
    if (this.normalizeStatus(input.finalStatus) === "NA" && normEvalStatus !== "NA" && !hasNotes) {
      return {
        isValid: false,
        error: `Overriding "${checkDef.taskName}" to N/A requires an engineer justification (e.g. diskless model or standalone unit).`,
        isException: true,
      };
    }

    return {
      isValid: true,
      isException: reqJustification && hasNotes,
    };
  }

  /**
   * Authoritative approval-eligibility rule:
   * Verifies whether a finding's latest ReviewDecision is valid for report export.
   * - Decision must be APPROVED or MODIFIED.
   * - Superseded or pending decisions are never eligible.
   * - If re-review is required (e.g. evidence changed and fresh approval has not yet been given), ineligible.
   * - If the finding has an evidenceFingerprint, the decision's evidenceFingerprint
   *   must match the current finding's fingerprint.
   * - Once a fresh approval is recorded for a changed finding, it becomes eligible!
   */
  isDecisionEligibleForExport(
    findingFingerprint?: string | null,
    decision?: {
      decision: string;
      evidenceFingerprint?: string | null;
    } | null,
    reviewRequired?: boolean
  ): boolean {
    if (!decision) return false;
    if (decision.decision !== "APPROVED" && decision.decision !== "MODIFIED") {
      return false;
    }
    // Stale/re-review pending: evidence changed between runs without a fresh approval
    if (reviewRequired) {
      return false;
    }
    // If the finding has a fingerprint, the decision must match that exact fingerprint
    if (findingFingerprint && decision.evidenceFingerprint) {
      if (decision.evidenceFingerprint !== findingFingerprint) {
        return false;
      }
    }
    return true;
  }

  /**
   * Strict validation rule for bulk passing approval:
   * Only include deterministic PASS findings with complete applicable evidence,
   * resolved device identity, no conflicts, and no outstanding manual or external verification.
   */
  isEligibleForPassingBatchApproval({
    sourceType,
    status,
    collectionState,
    requiresEvidence,
    hasEvidence,
    reviewRequired,
    isDiffFromOriginal,
    hasPendingConflict,
  }: {
    sourceType?: string;
    status: string;
    collectionState: string;
    requiresEvidence: boolean;
    hasEvidence: boolean;
    reviewRequired?: boolean;
    isDiffFromOriginal?: boolean;
    hasPendingConflict?: boolean;
  }): boolean {
    // 1. Must be deterministically PASS
    const normStatus = this.normalizeStatus(status);
    if (normStatus !== "PASS") return false;

    // 2. Only deterministic CLI observations qualify for bulk pass
    // GUI_MANUAL and EXTERNAL_REFERENCE require explicit verification
    if (sourceType === "GUI_MANUAL" || sourceType === "EXTERNAL_REFERENCE") {
      return false;
    }

    // 3. Complete collection: collectionState must be COMPLETE (never MISSING, INCOMPLETE, or UNSUPPORTED)
    if (
      collectionState === "MISSING" ||
      collectionState === "INCOMPLETE" ||
      collectionState === "UNSUPPORTED"
    ) {
      return false;
    }

    // 4. Evidence check: if evidence is required, evidence must exist
    if (requiresEvidence && !hasEvidence) {
      return false;
    }

    // 5. Must not require re-review or have outstanding conflicts
    if (reviewRequired) return false;
    if (hasPendingConflict) return false;

    return true;
  }

  /**
   * Evaluates whether a checklist item requires engineer attention.
   */
  isNeedsAttentionItem(item: ReviewCheckItem): boolean {
    const normStatus = this.normalizeStatus(item.proposedEvaluation.status);
    const isApproved =
      item.decision.decision === "APPROVED" || item.decision.decision === "MODIFIED";

    // 1. Re-review required due to evidence change between runs
    if (item.reReviewRequired || item.proposedEvaluation.reviewRequired) return true;

    // If already approved with matching fingerprint and no re-review needed
    if (isApproved && item.isEligibleForExport) {
      return false;
    }

    // 2. Warnings or Failures
    if (normStatus === "WARNING" || normStatus === "FAIL") return true;

    // 3. Requires manual verification / review
    if (normStatus === "REVIEW" || item.sourceType === "GUI_MANUAL") return true;

    // 4. Missing evidence for mandatory appendix
    if (item.requiresEvidence && (!item.evidence || item.evidence.length === 0)) return true;

    // 5. Incomplete or missing collection state
    if (
      item.proposedEvaluation.collectionState === "MISSING" ||
      item.proposedEvaluation.collectionState === "INCOMPLETE"
    ) {
      return true;
    }

    // 6. Requires explicit justification notes
    if (item.requiresJustification && !item.decision.reviewNotes) return true;

    // 7. Unapproved diff from original document
    if (item.isDiffFromOriginal && !isApproved) return true;

    // 8. Pending decision on any non-pass item
    if (item.decision.decision === "PENDING" && normStatus !== "PASS") return true;

    return false;
  }

  /**
   * Combines definitions, doc targets, checklist results, evidence, and review decisions
   * into unified ReviewCheckItems.
   */
  buildReviewItems({
    checklistDefinitions,
    docRowTargets = [],
    checklistResults = [],
    evidences = [],
    decisions = [],
    targetDeviceId,
    deviceHostname,
    reportLayout,
  }: {
    checklistDefinitions: VendorCheckItemDefinition[];
    docRowTargets?: EditableChecklistRowTarget[];
    checklistResults?: Array<{
      id: string;
      checkId: string;
      checkName: string;
      sectionName?: string | null;
      targetAppendix?: string | null;
      collectionState: string;
      status: string;
      currentValue?: string | null;
      expectedValue?: string | null;
      remarks?: string | null;
      evidenceFingerprint?: string | null;
      reviewRequired: boolean;
      reviewDecisions?: Array<{
        id: string;
        decision: string;
        proposedStatus?: string | null;
        proposedRemarks?: string | null;
        finalStatus?: string | null;
        finalRemarks?: string | null;
        reviewer: string;
        reviewNotes?: string | null;
        evidenceFingerprint?: string | null;
        decidedAt: Date | string;
      }>;
    }>;
    evidences?: Array<{
      id: string;
      commandExecutionId?: string | null;
      uploadedFileId?: string | null;
      deviceId?: string | null;
      checkId?: string | null;
      title: string;
      appendixMapping?: string | null;
      caption?: string | null;
      imageReference: string;
      sourceLabel?: string;
      isRedacted: boolean;
      isExcluded?: boolean;
      pageNumber: number;
      totalPages: number;
      deviceHostname?: string;
      commandExecution?: {
        command?: string | null;
        commandGroup?: string | null;
        parseStatus?: string | null;
        parseError?: string | null;
        outputContent?: string | null;
      } | null;
      uploadedFile?: {
        id?: string;
        originalFilename?: string | null;
        hashSha256?: string | null;
        sizeBytes?: number | null;
        mimeType?: string | null;
      } | null;
    }>;
    decisions?: Array<{
      id: string;
      checklistResultId: string;
      decision: string;
      proposedStatus?: string | null;
      proposedRemarks?: string | null;
      finalStatus?: string | null;
      finalRemarks?: string | null;
      reviewer: string;
      reviewNotes?: string | null;
      evidenceFingerprint?: string | null;
      decidedAt: Date | string;
    }>;
    targetDeviceId?: string;
    deviceHostname?: string;
    reportLayout?: ReportLayoutDefinition;
  }): ReviewCheckItem[] {
    // Index doc row targets by checkId and by itemNumber
    const docTargetByCheckId = new Map<string, EditableChecklistRowTarget>();
    const docTargetByItemNum = new Map<string, EditableChecklistRowTarget>();
    for (const row of docRowTargets) {
      docTargetByCheckId.set(row.checkId, row);
      if (row.itemNumber) {
        docTargetByItemNum.set(row.itemNumber, row);
      }
    }

    // Index checklist results by checkId
    const resultByCheckId = new Map<string, (typeof checklistResults)[0]>();
    for (const r of checklistResults) {
      resultByCheckId.set(r.checkId, r);
    }

    // Index decisions by checklistResultId
    const latestDecisionByResultId = new Map<string, (typeof decisions)[0]>();
    for (const d of decisions) {
      const existing = latestDecisionByResultId.get(d.checklistResultId);
      if (!existing || new Date(d.decidedAt) > new Date(existing.decidedAt)) {
        latestDecisionByResultId.set(d.checklistResultId, d);
      }
    }

    return checklistDefinitions.map((def) => {
      // 1. Doc target
      const docRow =
        docTargetByCheckId.get(def.id) ||
        (def.itemNumber ? docTargetByItemNum.get(def.itemNumber) : undefined);
      const originalDocument: ReviewOriginalDocumentValue = {
        foundInDocument: Boolean(docRow),
        itemNumber: docRow?.itemNumber || def.itemNumber,
        status: docRow?.currentStatus || "",
        remarks: docRow?.currentRemarks || "",
        checkboxOptions: docRow?.checkboxOptions || [],
      };

      // 2. Evaluated result
      const evalResult = resultByCheckId.get(def.id);
      const proposedEvaluation: ReviewProposedEvaluationValue = {
        checklistResultId: evalResult?.id || null,
        status: evalResult?.status || "PENDING",
        currentValue: evalResult?.currentValue || null,
        expectedValue: evalResult?.expectedValue || def.thresholdDescription || null,
        proposedRemarks: evalResult?.remarks || null,
        collectionState: evalResult?.collectionState || "MISSING",
        reviewRequired: evalResult?.reviewRequired || false,
        evidenceFingerprint: evalResult?.evidenceFingerprint || null,
        sourceCommand: def.commands?.[0] || "",
      };

      // 3. Evidence matches
      // Prioritize stable checkId match. Fall back to command or appendix string match if checkId is unset.
      const matchingEvidences: ReviewEvidenceSummary[] = evidences
        .filter((ev) => {
          // Primary match: exact stable checkId
          if (ev.checkId && ev.checkId === def.id) {
            return true;
          }
          // Secondary fallback match: only when checkId is absent
          if (!ev.checkId) {
            if (def.commands && ev.commandExecution?.command) {
              const cleanEvCmd = ev.commandExecution.command.trim().toLowerCase();
              if (def.commands.some((c) => cleanEvCmd.includes(c.toLowerCase()) || c.toLowerCase().includes(cleanEvCmd))) {
                return true;
              }
            }
            if (def.targetAppendix && ev.appendixMapping) {
              const cleanTarget = def.targetAppendix.toLowerCase().replace(/[^a-z0-9]/g, "");
              const cleanMap = ev.appendixMapping.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (cleanMap.includes(cleanTarget) || cleanTarget.includes(cleanMap)) {
                return true;
              }
            }
          }
          return false;
        })
        .map((ev) => {
          const isCli = Boolean(ev.commandExecutionId || ev.commandExecution);
          const sourceType: EvidenceSourceType = isCli ? "CLI" : "GUI_SCREENSHOT";

          return {
            id: ev.id,
            checkId: ev.checkId || def.id,
            deviceId: ev.deviceId || targetDeviceId || null,
            deviceHostname: ev.deviceHostname || deviceHostname || "Target Device",
            sourceType,
            sourceLabel: ev.sourceLabel || (isCli ? "Rendered from PuTTY session log" : "Uploaded GUI screenshot"),
            originalFilename: ev.uploadedFile?.originalFilename || null,
            hashSha256: ev.uploadedFile?.hashSha256 || null,
            sizeBytes: ev.uploadedFile?.sizeBytes || null,
            title: ev.title || def.taskName,
            appendixMapping: ev.appendixMapping || def.targetAppendix || null,
            caption: ev.caption || null,
            imageUrl: `/api/sessions/placeholder/evidence/${ev.id}`, // Replaced by router with actual URL
            isRedacted: Boolean(ev.isRedacted),
            isExcluded: Boolean(ev.isExcluded),
            pageNumber: ev.pageNumber || 1,
            totalPages: ev.totalPages || 1,
            command: ev.commandExecution?.command || null,
            rawOutputSnippet: ev.commandExecution?.outputContent || null,
            parseStatus: ev.commandExecution?.parseStatus || null,
            parseError: ev.commandExecution?.parseError || null,
            uploadedFileId: ev.uploadedFileId || null,
          };
        });

      // 4. Evidence Health & Integrity Detection
      const activeEvidences = matchingEvidences.filter((e) => !e.isExcluded);
      const excludedEvidences = matchingEvidences.filter((e) => e.isExcluded);
      const cliCount = activeEvidences.filter((e) => e.sourceType === "CLI").length;
      const guiCount = activeEvidences.filter((e) => e.sourceType === "GUI_SCREENSHOT").length;

      const hasTruncatedLog = activeEvidences.some(
        (e) => e.parseStatus === "FAILED" || (e.parseError && e.parseError.length > 0)
      );

      const hasConflicting = activeEvidences.some(
        (e) => targetDeviceId && e.deviceId && e.deviceId !== targetDeviceId
      );

      let healthStatus: EvidenceHealthStatus = "HEALTHY";
      let healthMessage: string | null = null;
      const requiresEv = Boolean(def.targetAppendix) || def.sourceType === "CLI";

      if (requiresEv && activeEvidences.length === 0) {
        healthStatus = "MISSING";
        healthMessage = `Mandatory evidence missing for ${def.targetAppendix || "appendix"}`;
      } else if (proposedEvaluation.collectionState === "INCOMPLETE") {
        healthStatus = "INCOMPLETE";
        healthMessage = "Telemetry output captured but incomplete for full PM assessment";
      } else if (hasTruncatedLog) {
        healthStatus = "TRUNCATED";
        healthMessage = "Command output was interrupted or truncated during session capture";
      } else if (hasConflicting) {
        healthStatus = "CONFLICTING";
        healthMessage = "Evidence assigned to this check conflicts with target device identity";
      } else {
        healthStatus = "HEALTHY";
        healthMessage = `${activeEvidences.length} valid evidence asset(s) linked`;
      }

      const evidenceHealth: EvidenceHealthSummary = {
        status: healthStatus,
        message: healthMessage,
        hasRequiredEvidence: activeEvidences.length > 0,
        cliCount,
        guiCount,
        excludedCount: excludedEvidences.length,
        isTruncated: hasTruncatedLog,
        isConflicting: hasConflicting,
      };

      // 5. Review decision
      let activeDecision: ReviewDecisionRecord;
      const dec = evalResult?.id ? latestDecisionByResultId.get(evalResult.id) : undefined;

      if (dec) {
        activeDecision = {
          id: dec.id,
          decision: (dec.decision as ReviewDecisionType | "SUPERSEDED") || "PENDING",
          finalStatus:
            dec.finalStatus ||
            proposedEvaluation.status ||
            originalDocument.status ||
            "PENDING",
          finalRemarks:
            dec.finalRemarks ??
            proposedEvaluation.proposedRemarks ??
            originalDocument.remarks ??
            "",
          reviewer: dec.reviewer,
          reviewNotes: dec.reviewNotes || null,
          evidenceFingerprint: dec.evidenceFingerprint || null,
          decidedAt:
            typeof dec.decidedAt === "string"
              ? dec.decidedAt
              : dec.decidedAt?.toISOString() || null,
        };
      } else {
        activeDecision = {
          id: null,
          decision: "PENDING",
          finalStatus:
            proposedEvaluation.status !== "PENDING"
              ? proposedEvaluation.status
              : originalDocument.status || "PENDING",
          finalRemarks:
            proposedEvaluation.proposedRemarks ?? originalDocument.remarks ?? "",
          reviewer: null,
          reviewNotes: null,
          evidenceFingerprint: null,
          decidedAt: null,
        };
      }

      // 6. Diff & Flags
      const isDiff = this.hasDiffFromOriginal(
        originalDocument,
        proposedEvaluation.status,
        proposedEvaluation.proposedRemarks
      );

      const isStatusOverridden =
        activeDecision.decision === "MODIFIED" &&
        this.normalizeStatus(activeDecision.finalStatus) !==
          this.normalizeStatus(proposedEvaluation.status);

      const isRemarksModified =
        activeDecision.decision === "MODIFIED" &&
        activeDecision.finalRemarks !== (proposedEvaluation.proposedRemarks || "");

      // Justification check based on ACTIVE non-excluded evidence
      const requiresJustification = this.checkRequiresJustification(
        def,
        proposedEvaluation,
        activeEvidences.length > 0,
        activeDecision.finalStatus
      );

      // Re-review detection:
      // A finding requires re-review if reviewRequired is flagged (evidence changed),
      // or if prior decision was SUPERSEDED and no fresh approval exists.
      const reReviewRequired = Boolean(
        evalResult?.reviewRequired ||
          activeDecision.decision === "SUPERSEDED" ||
          (activeDecision.decision === "PENDING" &&
            activeDecision.reviewNotes?.includes("superseded"))
      );

      // Authoritative export eligibility:
      const isEligibleForExport = this.isDecisionEligibleForExport(
        evalResult?.evidenceFingerprint,
        activeDecision,
        evalResult?.reviewRequired
      );

      // Strict bulk pass qualification:
      const isEligibleForBatchPass = this.isEligibleForPassingBatchApproval({
        sourceType: def.sourceType,
        status: proposedEvaluation.status,
        collectionState: proposedEvaluation.collectionState,
        requiresEvidence: Boolean(def.targetAppendix),
        hasEvidence: activeEvidences.length > 0,
        reviewRequired: evalResult?.reviewRequired,
        isDiffFromOriginal: isDiff,
      });

      return {
        checkId: def.id,
        itemNumber: def.itemNumber || docRow?.itemNumber || "",
        taskName: def.taskName,
        sectionName: def.group || docRow?.sectionName || "General",
        targetAppendix: def.targetAppendix || null,
        sourceType: def.sourceType,
        requiresEvidence: Boolean(def.targetAppendix),
        thresholdDescription: def.thresholdDescription || "",
        approvedCommands: def.commands || [],
        originalDocument,
        proposedEvaluation,
        evidence: matchingEvidences,
        evidenceHealth,
        decision: activeDecision,
        isDiffFromOriginal: isDiff,
        isStatusOverridden,
        isRemarksModified,
        requiresJustification,
        reReviewRequired,
        isEligibleForExport,
        isEligibleForBatchPass,
      };
    });
  }

  /**
   * Recalculates evidence fingerprint, collection state, and invalidates stale approvals
   * when evidence is reassigned, excluded, or restored.
   */
  async recalculateFindingEvidenceState(
    sessionId: string,
    deviceId: string,
    checkId: string,
    reason: string = "Evidence assignment or exclusion modified by engineer"
  ): Promise<{ checklistResultId: string; newFingerprint: string; reReviewTriggered: boolean } | null> {
    const result = await prisma.checklistResult.findUnique({
      where: {
        deviceId_checkId: {
          deviceId,
          checkId,
        },
      },
      include: {
        reviewDecisions: {
          orderBy: { decidedAt: "desc" },
        },
      },
    });

    if (!result) return null;

    // 1. Fetch active (non-excluded) evidence for this device and check
    const activeEvidences = await prisma.evidence.findMany({
      where: {
        deviceId,
        checkId,
        isExcluded: false,
      },
      include: {
        uploadedFile: true,
        commandExecution: true,
      },
    });

    // 2. Fetch session and vendor definition
    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    const adapter = session?.vendor ? vendorRegistry.get(session.vendor as VendorId) : null;
    const def = adapter?.getChecklistDefinition().find((d) => d.id === checkId);

    // 3. Evaluate collection state
    let newCollectionState = result.collectionState;
    if (def?.sourceType === "GUI_MANUAL") {
      newCollectionState = activeEvidences.length > 0 ? "COMPLETE" : "MISSING";
    } else if (def?.targetAppendix) {
      if (activeEvidences.length === 0 && result.collectionState === "COMPLETE") {
        newCollectionState = "INCOMPLETE";
      }
    }

    // 4. Compute updated evidence fingerprint
    const evidencePayload = activeEvidences
      .map((e) => `${e.id}:${e.uploadedFile?.hashSha256 || e.imageReference}:${e.isExcluded}`)
      .sort()
      .join("|");

    const rawExcerpt = result.currentValue || result.remarks || "";
    const newFingerprint = createHash("sha256")
      .update(
        [
          deviceId,
          checkId,
          "v1.1",
          result.currentValue || "",
          result.status,
          newCollectionState,
          evidencePayload,
          rawExcerpt,
        ].join("|")
      )
      .digest("hex");

    // 5. Invalidate prior approved/modified decisions if fingerprint changed
    const priorApprovedDecision = result.reviewDecisions.find(
      (d) => d.decision === "APPROVED" || d.decision === "MODIFIED"
    );

    let reReviewTriggered = false;

    if (priorApprovedDecision && result.evidenceFingerprint !== newFingerprint) {
      await prisma.reviewDecision.update({
        where: { id: priorApprovedDecision.id },
        data: { decision: "SUPERSEDED" },
      });

      await prisma.reviewDecision.create({
        data: {
          checklistResultId: result.id,
          decision: "PENDING",
          proposedStatus: result.status,
          proposedRemarks: result.remarks,
          evidenceFingerprint: newFingerprint,
          reviewer: "System",
          reviewNotes: reason,
        },
      });

      reReviewTriggered = true;
    }

    const isMissingMandatory =
      (Boolean(def?.targetAppendix) || def?.sourceType === "GUI_MANUAL") &&
      activeEvidences.length === 0;

    const reviewRequired =
      reReviewTriggered ||
      isMissingMandatory ||
      Boolean(result.evidenceFingerprint && result.evidenceFingerprint !== newFingerprint) ||
      result.reviewRequired;

    // 6. Update ChecklistResult
    await prisma.checklistResult.update({
      where: { id: result.id },
      data: {
        evidenceFingerprint: newFingerprint,
        collectionState: newCollectionState,
        reviewRequired,
      },
    });

    return {
      checklistResultId: result.id,
      newFingerprint,
      reReviewTriggered,
    };
  }

  /**
   * Computes session review KPI summary.
   */
  computeSummary(items: ReviewCheckItem[]): ReviewSessionSummary {
    let approved = 0;
    let modified = 0;
    let rejected = 0;
    let pending = 0;
    let warnings = 0;
    let failures = 0;
    let exceptions = 0;
    let diffsCount = 0;
    let needsAttentionCount = 0;
    let reReviewRequiredCount = 0;
    let eligibleForBatchCount = 0;

    for (const item of items) {
      if (item.decision.decision === "APPROVED") approved++;
      else if (item.decision.decision === "MODIFIED") modified++;
      else if (item.decision.decision === "REJECTED") rejected++;
      else pending++;

      const evalStatus = this.normalizeStatus(item.proposedEvaluation.status);
      if (evalStatus === "WARNING") warnings++;
      if (evalStatus === "FAIL") failures++;

      if (item.requiresJustification && item.decision.reviewNotes) {
        exceptions++;
      }

      if (item.isDiffFromOriginal) {
        diffsCount++;
      }

      if (this.isNeedsAttentionItem(item)) {
        needsAttentionCount++;
      }

      if (item.reReviewRequired) {
        reReviewRequiredCount++;
      }

      if (item.isEligibleForBatchPass && item.decision.decision === "PENDING") {
        eligibleForBatchCount++;
      }
    }

    return {
      total: items.length,
      approved,
      modified,
      rejected,
      pending,
      warnings,
      failures,
      exceptions,
      diffsCount,
      needsAttentionCount,
      reReviewRequiredCount,
      eligibleForBatchCount,
    };
  }
}

export const reviewService = new ReviewService();
