import type { ExtractedMetricsValue } from "@/core/checks/types";

export type VendorId = "fortigate" | "paloalto" | "juniper_srx" | "checkpoint" | "cisco" | "other";

export interface GuideSource {
  document: string;
  section: string;
  tableRow: number;
  page?: number;
}

export interface VendorRuleFinding {
  ruleId: string;
  collectionState: CollectionState;
  evaluationStatus: CheckStatus;
  currentValue: string;
  expectedValue: string;
  remarks: string;
  reviewRequired: boolean;
}

export interface VendorRuleContext {
  hasExecution: boolean;
  hasFailedExecution?: boolean;
  rawOutput?: string;
  executions?: any[];
  allOutputs?: string[];
  allMetrics?: ExtractedMetricsValue[];
  allExecutions?: any[];
  executionsByCommandId?: Record<string, any[]>;
  outputsByCommandId?: Record<string, string[]>;
  metricsByCommandId?: Record<string, ExtractedMetricsValue[]>;
}

export type VendorRuleHandler = (
  metrics: ExtractedMetricsValue | undefined,
  context?: VendorRuleContext
) => VendorRuleFinding;

export type CollectionState =
  | "COMPLETE"
  | "INCOMPLETE"
  | "MISSING"
  | "UNSUPPORTED";

export type CheckStatus =
  | "PASS"
  | "FAIL"
  | "WARNING"
  | "NA"
  | "REVIEW"
  | "PENDING";

export interface VendorCommandDefinition {
  id: string;
  command: string;
  description: string;
  group: string; // e.g. "System", "Performance", "Interfaces", "Licensing", "VPN", "Routing", "HA", "NTP"
  isReadOnly: boolean;
  requiresContext?: boolean;
  expectedOutputs: string[];
  evidenceRequired: boolean;
  targetSection: string;
  targetAppendix?: string;
  mappedCheckIds?: string[];
  notes?: string;
  executionContext?: string;
  contextVerification?: "GUIDE_SPECIFIED" | "VERIFY_REQUIRED";
  engineerControlled?: boolean;
  guideSource?: GuideSource;
}

export interface VendorCheckItemDefinition {
  id: string;
  itemNumber?: string; // e.g. "1.1", "1.2", "2.1"
  taskName: string;
  description: string;
  group: string;
  commands: string[]; // command IDs or command strings
  sourceType: "CLI" | "GUI_MANUAL" | "EXTERNAL_REFERENCE";
  evidenceRequired?: boolean;
  targetSection: string;
  targetAppendix?: string;
  thresholdDescription?: string;
  collectionInstructions?: string;
  expectedStatusOptions?: string[]; // e.g. ["Healthy", "Unhealthy", "N/A"]
  guideSource?: GuideSource;
  evaluationPolicy?: string;
}

export interface NormalizedCheckResult {
  vendorId: VendorId;
  deviceId: string;
  checkId: string;
  commandId?: string;
  rawOutputRef?: string;
  extractedValues: Record<string, unknown>;
  collectionState: CollectionState;
  evaluationStatus: CheckStatus;
  ruleId?: string;
  remarks?: string;
  evidenceRefs?: string[];
  reviewRequired: boolean;
}

export interface IVendorAdapter {
  readonly id: VendorId;
  readonly displayName: string;
  readonly description: string;
  readonly supportedFirmwareRange?: string;

  getCommands(): VendorCommandDefinition[];
  getChecklistDefinition(): VendorCheckItemDefinition[];
  detectPrompt(line: string): {
    isPrompt: boolean;
    hostname?: string;
    promptChar?: string;
    commandText?: string;
    vdom?: string;
    executionContext?: string;
  };
  normalizeOutput?(rawOutput: string): string;
  detectCommandError?(output: string): string | undefined;
  getParser?(): import("@/core/checks/types").IVendorParser;
  getRuleHandler?(checkId: string): VendorRuleHandler | undefined;
}
