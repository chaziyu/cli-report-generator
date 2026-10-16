export type VendorId = "fortigate" | "paloalto" | "checkpoint" | "cisco" | "other";

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
}

export interface VendorCheckItemDefinition {
  id: string;
  itemNumber?: string; // e.g. "1.1", "1.2", "2.1"
  taskName: string;
  description: string;
  group: string;
  commands: string[]; // command IDs or command strings
  sourceType: "CLI" | "GUI_MANUAL" | "EXTERNAL_REFERENCE";
  targetSection: string;
  targetAppendix?: string;
  thresholdDescription?: string;
  collectionInstructions?: string;
  expectedStatusOptions?: string[]; // e.g. ["Healthy", "Unhealthy", "N/A"]
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
  detectPrompt(line: string): { isPrompt: boolean; hostname?: string; promptChar?: string };
  normalizeOutput?(rawOutput: string): string;
  getParser?(): import("@/core/checks/types").IVendorParser;
}
