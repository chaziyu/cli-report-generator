import { describe, it, expect } from "vitest";
import { reviewService, ReviewCheckItem } from "@/core/review";

describe("Inline Review & Approval Logic (Phase 5 Unit Tests)", () => {
  describe("Authoritative Approval-Eligibility Rule (Issue 1)", () => {
    const fingerprintV1 = "sha256-abc-v1";
    const fingerprintV2 = "sha256-def-v2";

    it("considers a valid approved decision matching current fingerprint as eligible for export", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        fingerprintV1,
        { decision: "APPROVED", evidenceFingerprint: fingerprintV1 },
        false
      );
      expect(eligible).toBe(true);
    });

    it("rejects an approval if reviewRequired is true (unresolved re-review required)", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        fingerprintV2,
        { decision: "APPROVED", evidenceFingerprint: fingerprintV1 },
        true // reviewRequired flagged due to changed evidence
      );
      expect(eligible).toBe(false);
    });

    it("allows export when changed evidence receives a fresh approval matching the new fingerprint", () => {
      // Evidence changed from V1 to V2, engineer re-approves:
      // reviewRequired is reset to false, decision evidenceFingerprint matches V2
      const eligible = reviewService.isDecisionEligibleForExport(
        fingerprintV2,
        { decision: "APPROVED", evidenceFingerprint: fingerprintV2 },
        false
      );
      expect(eligible).toBe(true);
    });

    it("rejects superseded decisions", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        fingerprintV1,
        { decision: "SUPERSEDED", evidenceFingerprint: fingerprintV1 },
        false
      );
      expect(eligible).toBe(false);
    });

    it("rejects decisions when evidence fingerprint does not match the current finding", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        fingerprintV2,
        { decision: "APPROVED", evidenceFingerprint: fingerprintV1 }, // old fingerprint
        false
      );
      expect(eligible).toBe(false);
    });

    it("rejects pending decisions", () => {
      const eligible = reviewService.isDecisionEligibleForExport(
        fingerprintV1,
        { decision: "PENDING", evidenceFingerprint: fingerprintV1 },
        false
      );
      expect(eligible).toBe(false);
    });
  });

  describe("Strict Bulk Passing Approval Validation (Issue 2)", () => {
    it("qualifies a clean deterministic CLI PASS finding with complete evidence", () => {
      const eligible = reviewService.isEligibleForPassingBatchApproval({
        sourceType: "CLI",
        status: "PASS",
        collectionState: "COMPLETE",
        requiresEvidence: true,
        hasEvidence: true,
        reviewRequired: false,
      });
      expect(eligible).toBe(true);
    });

    it("excludes checks requiring GUI manual confirmation", () => {
      const eligible = reviewService.isEligibleForPassingBatchApproval({
        sourceType: "GUI_MANUAL",
        status: "PASS",
        collectionState: "COMPLETE",
        requiresEvidence: true,
        hasEvidence: true,
        reviewRequired: false,
      });
      expect(eligible).toBe(false);
    });

    it("excludes checks with missing required evidence", () => {
      const eligible = reviewService.isEligibleForPassingBatchApproval({
        sourceType: "CLI",
        status: "PASS",
        collectionState: "MISSING",
        requiresEvidence: true,
        hasEvidence: false,
        reviewRequired: false,
      });
      expect(eligible).toBe(false);
    });

    it("excludes checks with incomplete collection state", () => {
      const eligible = reviewService.isEligibleForPassingBatchApproval({
        sourceType: "CLI",
        status: "PASS",
        collectionState: "INCOMPLETE",
        requiresEvidence: false,
        hasEvidence: false,
        reviewRequired: false,
      });
      expect(eligible).toBe(false);
    });

    it("excludes checks requiring re-review", () => {
      const eligible = reviewService.isEligibleForPassingBatchApproval({
        sourceType: "CLI",
        status: "PASS",
        collectionState: "COMPLETE",
        requiresEvidence: true,
        hasEvidence: true,
        reviewRequired: true,
      });
      expect(eligible).toBe(false);
    });

    it("excludes non-passing findings (WARNING, FAIL, REVIEW)", () => {
      expect(
        reviewService.isEligibleForPassingBatchApproval({
          sourceType: "CLI",
          status: "WARNING",
          collectionState: "COMPLETE",
          requiresEvidence: true,
          hasEvidence: true,
        })
      ).toBe(false);

      expect(
        reviewService.isEligibleForPassingBatchApproval({
          sourceType: "CLI",
          status: "FAIL",
          collectionState: "COMPLETE",
          requiresEvidence: true,
          hasEvidence: true,
        })
      ).toBe(false);

      expect(
        reviewService.isEligibleForPassingBatchApproval({
          sourceType: "CLI",
          status: "REVIEW",
          collectionState: "COMPLETE",
          requiresEvidence: true,
          hasEvidence: true,
        })
      ).toBe(false);
    });
  });

  describe("Needs Attention Filter Predicate", () => {
    const baseItem: ReviewCheckItem = {
      checkId: "fg-sys-cpu",
      itemNumber: "1.1",
      taskName: "CPU Usage",
      sectionName: "System Performance",
      targetAppendix: "Appendix 1",
      sourceType: "CLI",
      requiresEvidence: true,
      thresholdDescription: "CPU < 80%",
      approvedCommands: ["get system performance status"],
      originalDocument: {
        foundInDocument: true,
        status: "PASS",
        remarks: "Normal",
        checkboxOptions: [],
      },
      proposedEvaluation: {
        checklistResultId: "cr-1",
        status: "PASS",
        currentValue: "15%",
        expectedValue: "< 80%",
        proposedRemarks: "CPU normal",
        collectionState: "COMPLETE",
        reviewRequired: false,
      },
      evidence: [
        {
          id: "ev-1",
          title: "CPU",
          appendixMapping: "Appendix 1",
          caption: null,
          imageUrl: "/api/evidence/1",
          isRedacted: false,
          isExcluded: false,
          sourceType: "CLI",
          sourceLabel: "Rendered from PuTTY session log",
          pageNumber: 1,
          totalPages: 1,
        },
      ],
      evidenceHealth: {
        status: "HEALTHY",
        message: null,
        hasRequiredEvidence: true,
        cliCount: 1,
        guiCount: 0,
        excludedCount: 0,
        isTruncated: false,
        isConflicting: false,
      },
      decision: {
        id: "dec-1",
        decision: "APPROVED",
        finalStatus: "PASS",
        finalRemarks: "CPU normal",
        reviewer: "Lead Engineer",
        reviewNotes: null,
        decidedAt: new Date().toISOString(),
      },
      isDiffFromOriginal: false,
      isStatusOverridden: false,
      isRemarksModified: false,
      requiresJustification: false,
      reReviewRequired: false,
      isEligibleForExport: true,
      isEligibleForBatchPass: true,
    };

    it("does not flag clean approved passing items", () => {
      expect(reviewService.isNeedsAttentionItem(baseItem)).toBe(false);
    });

    it("flags items requiring re-review", () => {
      const item: ReviewCheckItem = {
        ...baseItem,
        reReviewRequired: true,
        isEligibleForExport: false,
      };
      expect(reviewService.isNeedsAttentionItem(item)).toBe(true);
    });

    it("flags warnings and failures", () => {
      const warnItem: ReviewCheckItem = {
        ...baseItem,
        proposedEvaluation: {
          ...baseItem.proposedEvaluation,
          status: "WARNING",
        },
        decision: {
          ...baseItem.decision,
          decision: "PENDING",
        },
        isEligibleForExport: false,
      };
      expect(reviewService.isNeedsAttentionItem(warnItem)).toBe(true);

      const failItem: ReviewCheckItem = {
        ...baseItem,
        proposedEvaluation: {
          ...baseItem.proposedEvaluation,
          status: "FAIL",
        },
        decision: {
          ...baseItem.decision,
          decision: "PENDING",
        },
        isEligibleForExport: false,
      };
      expect(reviewService.isNeedsAttentionItem(failItem)).toBe(true);
    });

    it("flags missing mandatory evidence", () => {
      const item: ReviewCheckItem = {
        ...baseItem,
        evidence: [],
        decision: {
          ...baseItem.decision,
          decision: "PENDING",
        },
        isEligibleForExport: false,
      };
      expect(reviewService.isNeedsAttentionItem(item)).toBe(true);
    });

    it("flags manual GUI checks requiring engineer verification", () => {
      const item: ReviewCheckItem = {
        ...baseItem,
        sourceType: "GUI_MANUAL",
        decision: {
          ...baseItem.decision,
          decision: "PENDING",
        },
        isEligibleForExport: false,
      };
      expect(reviewService.isNeedsAttentionItem(item)).toBe(true);
    });
  });
});
