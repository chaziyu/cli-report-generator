export type PipelineMode = "FULL" | "CLI_ONLY" | "TEMPLATE_ONLY" | "STAGING_ONLY";

export interface PipelineStageResult {
  stage:
    | "DOCX_INSPECTION"
    | "LOG_PARSING"
    | "RULE_EVALUATION"
    | "EVIDENCE_RENDERING"
    | "GUI_MAPPING"
    | "REVIEW_PREPARATION";
  status: "COMPLETED" | "WARNING" | "FAILED" | "SKIPPED";
  message: string;
  itemsProcessed?: number;
  error?: string;
}

export interface PipelineSummary {
  devicesEvaluated: number;
  logsProcessed: number;
  commandsSegmented: number;
  rulesTotal: number;
  rulesPassed: number;
  rulesWarning: number;
  rulesFailed: number;
  rulesMissing: number;
  reReviewRequiredCount: number;
  cliEvidencePages: number;
  guiScreenshotsActive: number;
}

export interface AmbiguousLogInfo {
  fileId: string;
  filename: string;
  detectedHostname?: string;
  candidates: Array<{
    deviceId: string;
    hostname: string;
    role: string | null;
  }>;
}

export interface DeviceConfirmationInput {
  fileId: string;
  deviceId: string;
}

export interface PipelineProcessOptions {
  deviceConfirmations?: DeviceConfirmationInput[];
  forceReevaluate?: boolean;
}

export interface PipelineProcessResult {
  sessionId: string;
  mode: PipelineMode;
  status: "READY_FOR_REVIEW" | "PARTIAL" | "FAILED";
  summary: PipelineSummary;
  stages: PipelineStageResult[];
  ambiguousLogs: AmbiguousLogInfo[];
  error?: string;
}
