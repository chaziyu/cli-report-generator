import { describe, it, expect } from "vitest";
import {
  createNormalizedResult,
  createMissingResult,
  createUnsupportedResult,
  createIncompleteResult,
  validateDeviceIsolation,
  normalizedCheckResultSchema,
} from "@/core/checks/normalized-result";
import { NormalizedCheckResult } from "@/vendors/types";

describe("NormalizedCheckResult Invariants & Contracts", () => {
  it("successfully creates a well-formed normalized check result", () => {
    const validResult: NormalizedCheckResult = {
      vendorId: "fortigate",
      deviceId: "dev-hq-01",
      checkId: "fg-hw-cpu",
      commandId: "cmd-fg-sys-perf",
      rawOutputRef: "seg-2",
      extractedValues: {
        cpuUtilizationPct: 1,
        cpuIdlePct: 99,
      },
      collectionState: "COMPLETE",
      evaluationStatus: "PASS",
      ruleId: "rule-cpu-threshold",
      remarks: "CPU usage 1% is below 80% threshold.",
      reviewRequired: false,
    };

    const created = createNormalizedResult(validResult);
    expect(created.checkId).toBe("fg-hw-cpu");
    expect(created.evaluationStatus).toBe("PASS");
    expect(created.collectionState).toBe("COMPLETE");
  });

  it("ENFORCES INVARIANT: Missing data is NEVER converted to status PASS", () => {
    const invalidMissingResult = {
      vendorId: "fortigate",
      deviceId: "dev-hq-01",
      checkId: "fg-lic-forticare",
      commandId: "cmd-fg-lic-contract",
      extractedValues: {},
      collectionState: "MISSING",
      evaluationStatus: "PASS", // ILLEGAL
      reviewRequired: false,
    };

    // Schema validation MUST reject this
    expect(() =>
      normalizedCheckResultSchema.parse(invalidMissingResult)
    ).toThrowError(/Missing data can never evaluate to status PASS/i);
  });

  it("ENFORCES INVARIANT: Unsupported commands can NEVER evaluate to status PASS", () => {
    const invalidUnsupportedResult = {
      vendorId: "fortigate",
      deviceId: "dev-hq-01",
      checkId: "fg-unsupported-task",
      commandId: "cmd-unsupported",
      extractedValues: {},
      collectionState: "UNSUPPORTED",
      evaluationStatus: "PASS", // ILLEGAL
      reviewRequired: false,
    };

    expect(() =>
      normalizedCheckResultSchema.parse(invalidUnsupportedResult)
    ).toThrowError(
      /Unsupported commands can never evaluate to status PASS/i
    );
  });

  it("createMissingResult produces valid result with review required and non-PASS status", () => {
    const missing = createMissingResult({
      vendorId: "fortigate",
      deviceId: "dev-branch-01",
      checkId: "fg-hw-disk",
      commandId: "cmd-fg-hw-disk",
    });

    expect(missing.collectionState).toBe("MISSING");
    expect(missing.evaluationStatus).toBe("PENDING");
    expect(missing.reviewRequired).toBe(true);
    expect(missing.remarks).toContain("Evidence missing");
  });

  it("createUnsupportedResult produces valid result with REVIEW status", () => {
    const unsupported = createUnsupportedResult({
      vendorId: "fortigate",
      deviceId: "dev-branch-01",
      checkId: "fg-life-ffr",
      remarks: "Final Firmware Release requires Fortinet portal lookup.",
    });

    expect(unsupported.collectionState).toBe("UNSUPPORTED");
    expect(unsupported.evaluationStatus).toBe("REVIEW");
    expect(unsupported.reviewRequired).toBe(true);
  });

  it("createIncompleteResult produces valid result with WARNING status", () => {
    const incomplete = createIncompleteResult({
      vendorId: "fortigate",
      deviceId: "dev-branch-01",
      checkId: "fg-net-routing",
      rawOutputRef: "seg-7",
      remarks: "Routing table output was interrupted by pagination.",
    });

    expect(incomplete.collectionState).toBe("INCOMPLETE");
    expect(incomplete.evaluationStatus).toBe("WARNING");
    expect(incomplete.reviewRequired).toBe(true);
  });

  it("validates device isolation across multi-firewall session results", () => {
    const results: NormalizedCheckResult[] = [
      createMissingResult({
        vendorId: "fortigate",
        deviceId: "dev-primary",
        checkId: "fg-hw-cpu",
      }),
      createMissingResult({
        vendorId: "fortigate",
        deviceId: "dev-primary",
        checkId: "fg-hw-mem",
      }),
    ];

    const isolatedCheck = validateDeviceIsolation("dev-primary", results);
    expect(isolatedCheck.isIsolated).toBe(true);
    expect(isolatedCheck.foreignCount).toBe(0);

    // Add a result from secondary device
    results.push(
      createMissingResult({
        vendorId: "fortigate",
        deviceId: "dev-secondary",
        checkId: "fg-hw-cpu",
      })
    );

    const nonIsolatedCheck = validateDeviceIsolation("dev-primary", results);
    expect(nonIsolatedCheck.isIsolated).toBe(false);
    expect(nonIsolatedCheck.foreignCount).toBe(1);
  });
});
