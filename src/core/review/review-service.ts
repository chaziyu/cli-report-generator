import {
  ReviewCheckItem,
  ReviewDecisionInput,
  ReviewDecisionType,
  ReviewOriginalDocumentValue,
  ReviewProposedEvaluationValue,
  ReviewEvidenceSummary,
  ReviewDecisionRecord,
  ReviewSessionSummary,
} from "./types";
import { VendorCheckItemDefinition } from "@/vendors/types";
import { EditableChecklistRowTarget } from "@/report-layouts/types";

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
   * Combines definitions, doc targets, checklist results, evidence, and review decisions
   * into unified ReviewCheckItems.
   */
  buildReviewItems({
    checklistDefinitions,
    docRowTargets = [],
    checklistResults = [],
    evidences = [],
    decisions = [],
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
        decidedAt: Date | string;
      }>;
    }>;
    evidences?: Array<{
      id: string;
      commandExecutionId?: string | null;
      title: string;
      appendixMapping?: string | null;
      caption?: string | null;
      imageReference: string;
      isRedacted: boolean;
      pageNumber: number;
      totalPages: number;
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
      decidedAt: Date | string;
    }>;
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
      const docRow = docTargetByCheckId.get(def.id) || (def.itemNumber ? docTargetByItemNum.get(def.itemNumber) : undefined);
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
        sourceCommand: def.commands?.[0] || "",
      };

      // 3. Evidence matches
      // Map evidence by targetAppendix matching or command execution matching
      const matchingEvidences: ReviewEvidenceSummary[] = evidences
        .filter((ev) => {
          if (def.targetAppendix && ev.appendixMapping) {
            const cleanTarget = def.targetAppendix.toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanMap = ev.appendixMapping.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (cleanMap.includes(cleanTarget) || cleanTarget.includes(cleanMap)) {
              return true;
            }
          }
          return false;
        })
        .map((ev) => ({
          id: ev.id,
          title: ev.title,
          appendixMapping: ev.appendixMapping || null,
          caption: ev.caption || null,
          imageUrl: `/api/sessions/placeholder/evidence/${ev.id}`, // filled by caller if needed
          isRedacted: ev.isRedacted,
          pageNumber: ev.pageNumber,
          totalPages: ev.totalPages,
        }));

      // 4. Review decision
      let activeDecision: ReviewDecisionRecord;
      const dec = evalResult?.id ? latestDecisionByResultId.get(evalResult.id) : undefined;

      if (dec) {
        activeDecision = {
          id: dec.id,
          decision: (dec.decision as ReviewDecisionType) || "PENDING",
          finalStatus: dec.finalStatus || proposedEvaluation.status || originalDocument.status || "PENDING",
          finalRemarks: dec.finalRemarks ?? proposedEvaluation.proposedRemarks ?? originalDocument.remarks ?? "",
          reviewer: dec.reviewer,
          reviewNotes: dec.reviewNotes || null,
          decidedAt: typeof dec.decidedAt === "string" ? dec.decidedAt : dec.decidedAt?.toISOString() || null,
        };
      } else {
        activeDecision = {
          id: null,
          decision: "PENDING",
          finalStatus: proposedEvaluation.status !== "PENDING" ? proposedEvaluation.status : originalDocument.status || "PENDING",
          finalRemarks: proposedEvaluation.proposedRemarks ?? originalDocument.remarks ?? "",
          reviewer: null,
          reviewNotes: null,
          decidedAt: null,
        };
      }

      // 5. Diff & Flags
      const isDiff = this.hasDiffFromOriginal(
        originalDocument,
        proposedEvaluation.status,
        proposedEvaluation.proposedRemarks
      );

      const isStatusOverridden =
        activeDecision.decision === "MODIFIED" &&
        this.normalizeStatus(activeDecision.finalStatus) !== this.normalizeStatus(proposedEvaluation.status);

      const isRemarksModified =
        activeDecision.decision === "MODIFIED" &&
        activeDecision.finalRemarks !== (proposedEvaluation.proposedRemarks || "");

      const requiresJustification = this.checkRequiresJustification(
        def,
        proposedEvaluation,
        matchingEvidences.length > 0,
        activeDecision.finalStatus
      );

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
        decision: activeDecision,
        isDiffFromOriginal: isDiff,
        isStatusOverridden,
        isRemarksModified,
        requiresJustification,
      };
    });
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
    };
  }
}

export const reviewService = new ReviewService();
