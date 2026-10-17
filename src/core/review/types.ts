import { VendorCheckItemDefinition } from "@/vendors/types";
import { CheckboxOption } from "@/report-layouts/types";

export type ReviewDecisionType = "PENDING" | "APPROVED" | "MODIFIED" | "REJECTED";

export interface ReviewOriginalDocumentValue {
  foundInDocument: boolean;
  itemNumber?: string;
  status: string; // e.g. "NA", "PASS", "FAIL", "PENDING"
  remarks: string;
  checkboxOptions: CheckboxOption[];
}

export interface ReviewProposedEvaluationValue {
  checklistResultId: string | null;
  status: string; // "PASS", "FAIL", "WARNING", "NA", "REVIEW", "PENDING"
  currentValue: string | null;
  expectedValue: string | null;
  proposedRemarks: string | null;
  collectionState: string; // "COMPLETE", "INCOMPLETE", "MISSING", "UNSUPPORTED"
  reviewRequired: boolean;
  evidenceFingerprint?: string | null;
  ruleId?: string;
  ruleNotes?: string;
  sourceCommand?: string;
}

export type EvidenceSourceType = "CLI" | "GUI_SCREENSHOT";
export type EvidenceHealthStatus =
  | "HEALTHY"
  | "MISSING"
  | "INCOMPLETE"
  | "TRUNCATED"
  | "CONFLICTING"
  | "MISMAPPED";

export interface EvidenceHealthSummary {
  status: EvidenceHealthStatus;
  message?: string | null;
  hasRequiredEvidence: boolean;
  cliCount: number;
  guiCount: number;
  excludedCount: number;
  isTruncated: boolean;
  isConflicting: boolean;
}

export interface ReviewEvidenceSummary {
  id: string;
  checkId?: string | null;
  deviceId?: string | null;
  deviceHostname?: string;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  originalFilename?: string | null;
  hashSha256?: string | null;
  sizeBytes?: number | null;
  title: string;
  appendixMapping: string | null;
  caption: string | null;
  imageUrl: string;
  isRedacted: boolean;
  isExcluded: boolean;
  pageNumber: number;
  totalPages: number;
  command?: string | null;
  rawOutputSnippet?: string | null;
  parseStatus?: string | null;
  parseError?: string | null;
  uploadedFileId?: string | null;
}

export interface ReviewDecisionRecord {
  id: string | null;
  decision: ReviewDecisionType | "SUPERSEDED";
  finalStatus: string;
  finalRemarks: string;
  reviewer: string | null;
  reviewNotes: string | null;
  evidenceFingerprint?: string | null;
  decidedAt: string | null;
}

export interface ReviewCheckItem {
  checkId: string;
  itemNumber: string;
  taskName: string;
  sectionName: string;
  targetAppendix: string | null;
  sourceType: "CLI" | "GUI_MANUAL" | "EXTERNAL_REFERENCE";
  requiresEvidence: boolean;
  thresholdDescription: string;
  approvedCommands: string[];

  // Original Word document values
  originalDocument: ReviewOriginalDocumentValue;

  // Automated evaluation values
  proposedEvaluation: ReviewProposedEvaluationValue;

  // Rendered terminal evidence and uploaded screenshots
  evidence: ReviewEvidenceSummary[];

  // Evidence Health & Integrity
  evidenceHealth: EvidenceHealthSummary;

  // Saved or pending review decision
  decision: ReviewDecisionRecord;

  // Diff & Flags
  isDiffFromOriginal: boolean;
  isStatusOverridden: boolean;
  isRemarksModified: boolean;
  requiresJustification: boolean;
  reReviewRequired: boolean;
  isEligibleForExport: boolean;
  isEligibleForBatchPass: boolean;
}

export interface ReviewDecisionInput {
  checkId: string;
  checklistResultId?: string;
  decision: "APPROVED" | "MODIFIED" | "REJECTED";
  finalStatus?: string;
  finalRemarks?: string;
  reviewNotes?: string;
}

export interface ReviewSessionSummary {
  total: number;
  approved: number;
  modified: number;
  rejected: number;
  pending: number;
  warnings: number;
  failures: number;
  exceptions: number;
  diffsCount: number;
  needsAttentionCount: number;
  reReviewRequiredCount: number;
  eligibleForBatchCount: number;
}
