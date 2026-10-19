import { z } from "zod";
import {
  VendorId,
  CollectionState,
  CheckStatus,
  NormalizedCheckResult,
} from "@/vendors/types";

// ============================================================================
// Zod Schema & Invariants for NormalizedCheckResult
// ============================================================================

export const CollectionStateEnum = z.enum([
  "COMPLETE",
  "INCOMPLETE",
  "MISSING",
  "UNSUPPORTED",
]);

export const CheckStatusEnum = z.enum([
  "PASS",
  "FAIL",
  "WARNING",
  "NA",
  "REVIEW",
  "PENDING",
]);

export const VendorIdEnum = z.enum([
  "fortigate",
  "paloalto",
  "juniper_srx",
  "checkpoint",
  "cisco",
  "other",
]);

export const normalizedCheckResultSchema = z
  .object({
    vendorId: VendorIdEnum,
    deviceId: z.string().min(1, "deviceId cannot be empty"),
    checkId: z.string().min(1, "checkId cannot be empty"),
    commandId: z.string().optional(),
    rawOutputRef: z.string().optional(),
    extractedValues: z.record(z.unknown()),
    collectionState: CollectionStateEnum,
    evaluationStatus: CheckStatusEnum,
    ruleId: z.string().optional(),
    remarks: z.string().optional(),
    evidenceRefs: z.array(z.string()).optional(),
    reviewRequired: z.boolean(),
  })
  .superRefine((val, ctx) => {
    // Invariant 1: Missing data must NEVER evaluate to Pass or NA
    if (val.collectionState === "MISSING" && (val.evaluationStatus === "PASS" || val.evaluationStatus === "NA")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Critical Invariant Violated: Missing data can never evaluate to status ${val.evaluationStatus}.`,
        path: ["evaluationStatus"],
      });
    }

    // Invariant 2: Unsupported commands must NEVER evaluate to Pass or NA
    if (
      val.collectionState === "UNSUPPORTED" &&
      (val.evaluationStatus === "PASS" || val.evaluationStatus === "NA")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Critical Invariant Violated: Unsupported commands can never evaluate to status ${val.evaluationStatus}.`,
        path: ["evaluationStatus"],
      });
    }

    // Invariant 3: Incomplete data must NEVER evaluate to Pass
    if (val.collectionState === "INCOMPLETE" && val.evaluationStatus === "PASS") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Critical Invariant Violated: Incomplete data can never evaluate to status PASS.",
        path: ["evaluationStatus"],
      });
    }
  });

// ============================================================================
// Factory Functions
// ============================================================================

export function createNormalizedResult(
  data: NormalizedCheckResult
): NormalizedCheckResult {
  // Enforce invariant checks via Zod
  const validated = normalizedCheckResultSchema.parse(data);
  return validated as NormalizedCheckResult;
}

/**
 * Creates a normalized result for a checklist item where evidence is missing.
 * Invariant: status is NEVER "PASS".
 */
export function createMissingResult(params: {
  vendorId: VendorId;
  deviceId: string;
  checkId: string;
  commandId?: string;
  remarks?: string;
}): NormalizedCheckResult {
  return createNormalizedResult({
    vendorId: params.vendorId,
    deviceId: params.deviceId,
    checkId: params.checkId,
    commandId: params.commandId,
    extractedValues: {},
    collectionState: "MISSING",
    evaluationStatus: "PENDING",
    remarks:
      params.remarks ||
      "Evidence missing: required CLI output was not found in uploaded session logs.",
    reviewRequired: true,
  });
}

/**
 * Creates a normalized result for an unsupported command or manual requirement.
 */
export function createUnsupportedResult(params: {
  vendorId: VendorId;
  deviceId: string;
  checkId: string;
  commandId?: string;
  remarks?: string;
}): NormalizedCheckResult {
  return createNormalizedResult({
    vendorId: params.vendorId,
    deviceId: params.deviceId,
    checkId: params.checkId,
    commandId: params.commandId,
    extractedValues: {},
    collectionState: "UNSUPPORTED",
    evaluationStatus: "REVIEW",
    remarks:
      params.remarks ||
      "Check requires manual portal reference or unsupported command.",
    reviewRequired: true,
  });
}

/**
 * Creates a normalized result where output was incomplete or interrupted.
 */
export function createIncompleteResult(params: {
  vendorId: VendorId;
  deviceId: string;
  checkId: string;
  commandId?: string;
  rawOutputRef?: string;
  extractedValues?: Record<string, unknown>;
  remarks?: string;
}): NormalizedCheckResult {
  return createNormalizedResult({
    vendorId: params.vendorId,
    deviceId: params.deviceId,
    checkId: params.checkId,
    commandId: params.commandId,
    rawOutputRef: params.rawOutputRef,
    extractedValues: params.extractedValues || {},
    collectionState: "INCOMPLETE",
    evaluationStatus: "WARNING",
    remarks:
      params.remarks ||
      "Output incomplete: command output was truncated or interrupted.",
    reviewRequired: true,
  });
}

/**
 * Validates that an array of check results strictly belongs to the specified device.
 * Enforces device isolation across multi-firewall sessions.
 */
export function validateDeviceIsolation(
  deviceId: string,
  results: NormalizedCheckResult[]
): { isIsolated: boolean; foreignCount: number } {
  const foreignResults = results.filter((r) => r.deviceId !== deviceId);
  return {
    isIsolated: foreignResults.length === 0,
    foreignCount: foreignResults.length,
  };
}
