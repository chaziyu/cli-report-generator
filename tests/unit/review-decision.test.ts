import { describe, it, expect } from "vitest";
import { reviewService } from "@/core/review";
import { FORTIGATE_CHECKLIST } from "@/vendors/fortigate/checklist";

describe("ReviewService & Decision Validation Unit Tests", () => {
  const cpuCheckDef = FORTIGATE_CHECKLIST.find((c) => c.id === "fg-hw-cpu")!;
  const diskCheckDef = FORTIGATE_CHECKLIST.find((c) => c.id === "fg-hw-disk")!;
  const memCheckDef = FORTIGATE_CHECKLIST.find((c) => c.id === "fg-hw-mem")!;

  it("approves a clean passing check without requiring justification", () => {
    const evaluation = {
      checklistResultId: "res-cpu-1",
      status: "PASS",
      currentValue: "18%",
      expectedValue: "< 80%",
      proposedRemarks: "CPU utilization is 18%, within approved threshold",
      collectionState: "COMPLETE",
      reviewRequired: false,
    };

    const valResult = reviewService.validateDecision(
      cpuCheckDef,
      evaluation,
      true, // hasEvidence
      {
        checkId: "fg-hw-cpu",
        decision: "APPROVED",
        finalStatus: "PASS",
        finalRemarks: evaluation.proposedRemarks,
      }
    );

    expect(valResult.isValid).toBe(true);
    expect(valResult.isException).toBe(false);
  });

  it("blocks approval of a check with missing mandatory evidence if justification is missing", () => {
    const evaluation = {
      checklistResultId: "res-mem-1",
      status: "PASS",
      currentValue: null,
      expectedValue: "< 80%",
      proposedRemarks: null,
      collectionState: "MISSING",
      reviewRequired: true,
    };

    const valResult = reviewService.validateDecision(
      memCheckDef,
      evaluation,
      false, // no evidence
      {
        checkId: "fg-hw-mem",
        decision: "APPROVED",
        finalStatus: "PASS",
      }
    );

    expect(valResult.isValid).toBe(false);
    expect(valResult.error).toContain("mandatory CLI evidence is missing");
  });

  it("allows approval of missing mandatory evidence when explicit exception justification is provided", () => {
    const evaluation = {
      checklistResultId: "res-mem-1",
      status: "PASS",
      currentValue: null,
      expectedValue: "< 80%",
      proposedRemarks: null,
      collectionState: "MISSING",
      reviewRequired: true,
    };

    const valResult = reviewService.validateDecision(
      memCheckDef,
      evaluation,
      false,
      {
        checkId: "fg-hw-mem",
        decision: "APPROVED",
        finalStatus: "PASS",
        reviewNotes: "Exception: Live terminal verified with customer engineer during maintenance window",
      }
    );

    expect(valResult.isValid).toBe(true);
    expect(valResult.isException).toBe(true);
  });

  it("requires justification when approving a check that evaluated to FAIL or WARNING", () => {
    const evaluation = {
      checklistResultId: "res-cpu-fail",
      status: "FAIL",
      currentValue: "92%",
      expectedValue: "< 80%",
      proposedRemarks: "CPU utilization is 92%, exceeds 80% threshold",
      collectionState: "COMPLETE",
      reviewRequired: true,
    };

    const withoutJustification = reviewService.validateDecision(
      cpuCheckDef,
      evaluation,
      true,
      {
        checkId: "fg-hw-cpu",
        decision: "APPROVED",
        finalStatus: "FAIL",
      }
    );
    expect(withoutJustification.isValid).toBe(false);
    expect(withoutJustification.error).toContain("requires an engineer justification");

    const withJustification = reviewService.validateDecision(
      cpuCheckDef,
      evaluation,
      true,
      {
        checkId: "fg-hw-cpu",
        decision: "APPROVED",
        finalStatus: "FAIL",
        reviewNotes: "Customer SecOps notified; high CPU due to parallel backup run",
      }
    );
    expect(withJustification.isValid).toBe(true);
  });

  it("requires justification when overriding a check to N/A", () => {
    const evaluation = {
      checklistResultId: "res-disk-1",
      status: "PASS",
      currentValue: "Disk: 25%",
      expectedValue: "Healthy",
      proposedRemarks: "Disk utilization normal",
      collectionState: "COMPLETE",
      reviewRequired: false,
    };

    const overrideWithoutJustification = reviewService.validateDecision(
      diskCheckDef,
      evaluation,
      true,
      {
        checkId: "fg-hw-disk",
        decision: "MODIFIED",
        finalStatus: "NA",
        finalRemarks: "N/A",
      }
    );
    expect(overrideWithoutJustification.isValid).toBe(false);
    expect(overrideWithoutJustification.error).toContain("requires an engineer justification");

    const overrideWithJustification = reviewService.validateDecision(
      diskCheckDef,
      evaluation,
      true,
      {
        checkId: "fg-hw-disk",
        decision: "MODIFIED",
        finalStatus: "NA",
        finalRemarks: "N/A - Diskless model FortiGate 80F",
        reviewNotes: "Hardware model 80F does not contain log disk by hardware design",
      }
    );
    expect(overrideWithJustification.isValid).toBe(true);
  });

  it("accepts REJECTED decision without requiring extra justification", () => {
    const evaluation = {
      checklistResultId: "res-cpu-1",
      status: "PASS",
      currentValue: "18%",
      expectedValue: "< 80%",
      proposedRemarks: "CPU utilization is 18%",
      collectionState: "COMPLETE",
      reviewRequired: false,
    };

    const res = reviewService.validateDecision(cpuCheckDef, evaluation, true, {
      checkId: "fg-hw-cpu",
      decision: "REJECTED",
    });

    expect(res.isValid).toBe(true);
  });

  it("detects differences between original Word document and proposed evaluation", () => {
    const origDoc = {
      foundInDocument: true,
      status: "NA",
      remarks: "No hard disk installed in FortiGate 80F",
      checkboxOptions: [],
    };

    // Different status
    expect(
      reviewService.hasDiffFromOriginal(origDoc, "PASS", "No hard disk installed in FortiGate 80F")
    ).toBe(true);

    // Same status and remarks
    expect(
      reviewService.hasDiffFromOriginal(origDoc, "NA", "No hard disk installed in FortiGate 80F")
    ).toBe(false);

    // Same status but modified remarks
    expect(
      reviewService.hasDiffFromOriginal(origDoc, "NA", "Hard disk is present and operational")
    ).toBe(true);

    // Not found in original doc
    expect(
      reviewService.hasDiffFromOriginal(
        { foundInDocument: false, status: "", remarks: "", checkboxOptions: [] },
        "PASS",
        "New check"
      )
    ).toBe(true);
  });

  it("computes accurate summary counts for review items", () => {
    const items = reviewService.buildReviewItems({
      checklistDefinitions: FORTIGATE_CHECKLIST,
      checklistResults: [
        {
          id: "res-1",
          checkId: "fg-hw-cpu",
          checkName: "CPU Utilization",
          collectionState: "COMPLETE",
          status: "PASS",
          currentValue: "15%",
          reviewRequired: false,
        },
        {
          id: "res-2",
          checkId: "fg-hw-mem",
          checkName: "Memory Utilization",
          collectionState: "COMPLETE",
          status: "WARNING",
          currentValue: "82%",
          reviewRequired: true,
        },
      ],
      decisions: [
        {
          id: "dec-1",
          checklistResultId: "res-1",
          decision: "APPROVED",
          finalStatus: "PASS",
          reviewer: "Engineer A",
          decidedAt: new Date(),
        },
      ],
    });

    const summary = reviewService.computeSummary(items);
    expect(summary.total).toBe(FORTIGATE_CHECKLIST.length);
    expect(summary.approved).toBe(1);
    expect(summary.pending).toBe(FORTIGATE_CHECKLIST.length - 1);
    expect(summary.warnings).toBe(1);
  });
});
