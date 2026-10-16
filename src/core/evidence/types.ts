export interface EvidenceRenderOptions {
  title: string;
  command: string;
  rawOutput: string;
  deviceHostname?: string;
  appendixMapping?: string;
  sourceLabel?: string;
  maxLinesPerPage?: number;
  maxCharsPerLine?: number;
  fontSize?: number;
  redactSecrets?: boolean;
}

export interface RenderedEvidencePage {
  pageNumber: number;
  totalPages: number;
  pngBuffer: Buffer;
  svgString: string;
  fileName: string;
  redactionsApplied: number;
  lineCount: number;
}

export interface EvidenceGenerationResult {
  commandExecutionId?: string;
  deviceId?: string;
  title: string;
  appendixMapping?: string;
  pages: RenderedEvidencePage[];
  totalImages: number;
  isRedacted: boolean;
}
