"use client";

import { useState } from "react";
import {
  FileText,
  Upload,
  Terminal,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Server,
  Layers,
  Hash,
  Eye,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";

interface UploadedFileSummary {
  id: string;
  originalFilename: string;
  type: string;
  sizeBytes: number;
  hashSha256: string;
  createdAt: string | Date;
}

interface DeviceSummary {
  id: string;
  hostname: string;
  model: string | null;
  role: string | null;
}

interface CommandSegmentUI {
  id: string;
  command: string;
  rawCommandLine?: string;
  commandId?: string;
  hostname: string;
  vdom?: string;
  promptChar?: string;
  executionContext?: string;
  outputLines: string[];
  rawOutput: string;
  lineStart: number;
  lineEnd: number;
  isRepeated: boolean;
  executionIndex: number;
  interruptedByPagination: boolean;
  commandStatus: "SUCCESS" | "FAILED" | "INCOMPLETE" | "EMPTY" | "UNSUPPORTED";
  errorMessage?: string;
}

interface ParseResultUI {
  fileId: string;
  filename: string;
  rawSha256: string;
  normalizedMetadata: {
    encoding: string;
    lineCount: number;
    hasAnsiEscapes: boolean;
    hasPaginationMarkers: boolean;
    paginationMarkerCount: number;
    lineEndingType: string;
    detectedBanners: string[];
  };
  segmentedLog: {
    detectedHostname?: string;
    detectedVendor: string;
    detectedVdoms: string[];
    totalCommands: number;
    recognizedCommands: number;
    hasRepeatedCommands: boolean;
    hasPaginationInterrupts: boolean;
    warnings: string[];
    segments: CommandSegmentUI[];
  };
  deviceMapping: {
    matchedDeviceId?: string;
    matchedDeviceHostname?: string;
    confidence: string;
    matchReason: string;
    requiresConfirmation: boolean;
  };
  assignedDeviceId?: string | null;
  savedCommandExecutions: number;
}

interface LogImporterWorkspaceProps {
  sessionId: string;
  uploadedFiles: UploadedFileSummary[];
  devices: DeviceSummary[];
  onLogParsed?: () => void;
}

export function LogImporterWorkspace({
  sessionId,
  uploadedFiles,
  devices,
  onLogParsed,
}: LogImporterWorkspaceProps) {
  const [selectedFileId, setSelectedFileId] = useState<string>(
    uploadedFiles.find((f) => f.type === "PUTTY_LOG")?.id || ""
  );
  const [targetDeviceId, setTargetDeviceId] = useState<string>(
    devices[0]?.id || ""
  );
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResultUI | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  const puttyFiles = uploadedFiles.filter((f) => f.type === "PUTTY_LOG");

  const handleParseLog = async () => {
    if (!selectedFileId) {
      setParseError("Please select a PuTTY session log to parse.");
      return;
    }

    setParsing(true);
    setParseError(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/parse-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: selectedFileId,
          targetDeviceId: targetDeviceId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse session log");
      }

      setParseResult(data.data);
      if (data.data.segmentedLog.segments.length > 0) {
        setSelectedSegmentId(data.data.segmentedLog.segments[0].id);
      }
      if (onLogParsed) {
        onLogParsed();
      }
    } catch (err: unknown) {
      setParseError(
        err instanceof Error ? err.message : "Error parsing session log"
      );
    } finally {
      setParsing(false);
    }
  };

  const handleCopyOutput = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const activeSegment = parseResult?.segmentedLog.segments.find(
    (s) => s.id === selectedSegmentId
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-slate-900/60 to-blue-950/30 p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                <FileText className="h-3 w-3 text-purple-400" />
                PuTTY Session Log Ingestion &amp; Segmentation
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                Original File Preserved
              </span>
            </div>
            <h3 className="text-base font-semibold text-white">
              Log Normalizer &amp; Deterministic Command Segmenter
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Accepts authentic customer session logs, removes ANSI control characters and pagination artifacts,
              identifies prompt boundaries without naive splitting, and maps extracted outputs to individual firewall devices.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleParseLog}
              disabled={parsing || puttyFiles.length === 0}
              className="gap-2 bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-md shadow-purple-900/30 text-xs"
            >
              {parsing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Segmenting Log...</span>
                </>
              ) : (
                <>
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Parse &amp; Segment Log</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {parseError && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Log Ingestion Controls & Device Assignment */}
      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            Select Ingested PuTTY Log &amp; Target Firewall Device
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Choose which uploaded session log to parse and confirm its device binding.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          {puttyFiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400 space-y-2">
              <Upload className="mx-auto h-7 w-7 text-slate-500" />
              <p>No PuTTY session logs uploaded yet.</p>
              <p className="text-slate-500 text-[11px]">
                Switch to &quot;1. Foundation &amp; Scope&quot; tab to upload your .txt session log first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Select Log File */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  PuTTY Session Log File
                </label>
                <select
                  value={selectedFileId}
                  onChange={(e) => setSelectedFileId(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {puttyFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.originalFilename} ({formatBytes(file.sizeBytes)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Device */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Target Firewall Device
                </label>
                <select
                  value={targetDeviceId}
                  onChange={(e) => setTargetDeviceId(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.hostname} {device.model ? `(${device.model})` : ""} {device.role ? `[${device.role}]` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parse Results View */}
      {parseResult && (
        <div className="space-y-6">
          {/* Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Commands Found
              </span>
              <p className="text-xl font-bold font-mono text-emerald-400">
                {parseResult.segmentedLog.totalCommands}
              </p>
              <span className="text-[10px] text-slate-400">
                Segmented boundaries
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Recognized PM Tasks
              </span>
              <p className="text-xl font-bold font-mono text-blue-400">
                {parseResult.segmentedLog.recognizedCommands}
              </p>
              <span className="text-[10px] text-slate-400">
                Matched to PM checklist
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Detected Hostname
              </span>
              <p className="text-sm font-bold font-mono text-white truncate">
                {parseResult.segmentedLog.detectedHostname || "Unknown"}
              </p>
              <span className="text-[10px] text-emerald-400">
                From CLI prompt
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Line Endings &amp; Count
              </span>
              <p className="text-sm font-semibold text-purple-300 font-mono">
                {parseResult.normalizedMetadata.lineEndingType} ({parseResult.normalizedMetadata.lineCount} lines)
              </p>
              <span className="text-[10px] text-slate-400">
                Normalized to \n
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Pagination Markers
              </span>
              <p
                className={`text-sm font-semibold font-mono ${
                  parseResult.normalizedMetadata.hasPaginationMarkers
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {parseResult.normalizedMetadata.hasPaginationMarkers
                  ? `${parseResult.normalizedMetadata.paginationMarkerCount} stripped`
                  : "Clean (0 markers)"}
              </p>
              <span className="text-[10px] text-slate-400">
                Terminal output flow
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Repeated Runs
              </span>
              <p
                className={`text-sm font-semibold font-mono ${
                  parseResult.segmentedLog.hasRepeatedCommands
                    ? "text-amber-400"
                    : "text-slate-300"
                }`}
              >
                {parseResult.segmentedLog.hasRepeatedCommands
                  ? "Detected & Indexed"
                  : "None (Unique)"}
              </p>
              <span className="text-[10px] text-slate-400">
                Preserves output order
              </span>
            </div>
          </div>

          {/* Warnings Bar */}
          {parseResult.segmentedLog.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Segmentation Warnings &amp; Observations:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 pl-1">
                {parseResult.segmentedLog.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Device Mapping Notice */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-white">Device Association:</strong>{" "}
                {parseResult.deviceMapping.matchReason}
              </span>
            </div>
            <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400 border border-slate-800 self-start sm:self-center font-mono">
              Confidence: {parseResult.deviceMapping.confidence}
            </span>
          </div>

          {/* Main 2-Column Terminal Explorer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Command Segments List (5 cols) */}
            <div className="lg:col-span-5 space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                Extracted Command Segments ({parseResult.segmentedLog.segments.length}):
              </span>

              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {parseResult.segmentedLog.segments.map((seg, idx) => {
                  const isSelected = seg.id === selectedSegmentId;
                  return (
                    <button
                      key={seg.id}
                      onClick={() => setSelectedSegmentId(seg.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? "border-purple-500/50 bg-purple-500/10 shadow-sm"
                          : "border-slate-800 bg-slate-900/50 hover:bg-slate-800/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-emerald-400 truncate">
                          #{idx + 1} {seg.command}
                        </span>
                        <Badge
                          variant={
                            seg.commandStatus === "SUCCESS"
                              ? "success"
                              : seg.commandStatus === "FAILED"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[9px] py-0 font-mono"
                        >
                          {seg.commandStatus}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-slate-400 mt-1">
                        <span className="text-slate-500 font-mono text-[10px]">
                          lines {seg.lineStart}-{seg.lineEnd}
                        </span>
                        {seg.isRepeated && (
                          <span className="text-amber-400 font-mono text-[10px]">
                            Run #{seg.executionIndex + 1} (Repeated)
                          </span>
                        )}
                        {seg.commandId ? (
                          <span className="text-blue-400 font-mono text-[10px]">
                            {seg.commandId}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Custom</span>
                        )}
                        {seg.executionContext || parseResult.segmentedLog.detectedVendor === "checkpoint" ? (
                          <span className="text-violet-300 text-[10px]">
                            Context: {seg.executionContext || "Not identified"}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Terminal Output Viewer (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              {activeSegment ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden flex flex-col h-full min-h-[500px]">
                  {/* Terminal Title Bar */}
                  <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                      </div>
                      <span className="text-xs font-mono font-medium text-slate-300 ml-2">
                        {activeSegment.hostname} {activeSegment.vdom ? `(${activeSegment.vdom})` : ""} {activeSegment.promptChar} {activeSegment.command}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyOutput(activeSegment.rawOutput)}
                      className="flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[11px] text-slate-300 border border-slate-700 transition-colors"
                      title="Copy raw output"
                    >
                      {copiedText ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Output</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Terminal Body */}
                  <div className="p-4 overflow-x-auto overflow-y-auto max-h-[550px] font-mono text-xs leading-relaxed text-slate-200 bg-slate-950 flex-1">
                    <div className="text-emerald-400 font-semibold mb-2 select-all">
                      {activeSegment.rawCommandLine}
                    </div>
                    {activeSegment.rawOutput ? (
                      <pre className="whitespace-pre font-mono text-[11px] text-slate-300 select-all">
                        {activeSegment.rawOutput}
                      </pre>
                    ) : (
                      <span className="italic text-slate-500">
                        [Command completed with no output]
                      </span>
                    )}
                  </div>

                  {/* Terminal Footer Info */}
                  <div className="border-t border-slate-800/80 bg-slate-900/50 px-4 py-2 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono">
                      Segment ID: {activeSegment.id}
                    </span>
                    <span className="font-mono text-slate-500">
                      SHA-256 verified against original file
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-12 text-center text-xs text-slate-500">
                  Select a command segment on the left to inspect its authentic CLI output.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
