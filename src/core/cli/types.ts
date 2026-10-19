import { VendorId } from "@/vendors/types";

export type LineEndingType = "CRLF" | "LF" | "CR" | "MIXED";

export interface NormalizedLog {
  rawSha256: string;
  normalizedContent: string;
  lines: string[];
  encoding: string;
  hasAnsiEscapes: boolean;
  hasPaginationMarkers: boolean;
  paginationMarkerCount: number;
  detectedBanners: string[];
  lineEndingType: LineEndingType;
}

export type CommandSegmentStatus =
  | "SUCCESS"
  | "FAILED"
  | "INCOMPLETE"
  | "EMPTY"
  | "UNSUPPORTED";

export interface CommandSegment {
  id: string; // unique segment ID (e.g. "seg-1", "seg-2")
  command: string; // normalized command string, e.g. "get system performance status"
  rawCommandLine: string; // original line containing prompt and command
  commandId?: string; // mapped stable ID from vendor definitions (e.g. "cmd-fg-sys-perf")
  hostname: string;
  executionContext?: string;
  vdom?: string;
  promptChar: string; // "#" or "$"
  outputLines: string[];
  rawOutput: string;
  lineStart: number; // 1-indexed start line in normalized log
  lineEnd: number; // 1-indexed end line in normalized log
  isRepeated: boolean;
  executionIndex: number; // 0 for 1st execution, 1 for 2nd execution, etc.
  interruptedByPagination: boolean;
  commandStatus: CommandSegmentStatus;
  errorMessage?: string;
}

export interface SegmentedSessionLog {
  rawSha256: string;
  detectedHostname?: string;
  detectedVendor: VendorId;
  detectedVdoms: string[];
  segments: CommandSegment[];
  unsegmentedPrologue: string; // content before the first prompt (e.g. login banner)
  unsegmentedEpilogue: string; // content after the last prompt (e.g. exit/logout)
  totalCommands: number;
  recognizedCommands: number;
  hasRepeatedCommands: boolean;
  hasPaginationInterrupts: boolean;
  warnings: string[];
}
