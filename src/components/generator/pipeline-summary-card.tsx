"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  ArrowRight,
  FileText,
  Terminal,
  ShieldCheck,
  AlertCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PipelineProcessResult } from "@/core/workflow/pipeline-types";

interface PipelineSummaryCardProps {
  result: PipelineProcessResult;
  onRetry: () => void;
  onConfirmDeviceMapping: (fileId: string, deviceId: string) => Promise<void>;
}

export function PipelineSummaryCard({
  result,
  onRetry,
  onConfirmDeviceMapping,
}: PipelineSummaryCardProps) {
  const { summary, stages, ambiguousLogs, sessionId, mode } = result;
  const [selectedDeviceByLog, setSelectedDeviceByLog] = useState<Record<string, string>>({});
  const [confirmingLogId, setConfirmingLogId] = useState<string | null>(null);

  const handleConfirm = async (fileId: string) => {
    const deviceId = selectedDeviceByLog[fileId];
    if (!deviceId) return;
    setConfirmingLogId(fileId);
    try {
      await onConfirmDeviceMapping(fileId, deviceId);
    } finally {
      setConfirmingLogId(null);
    }
  };

  return (
    <Card className="border-slate-800 bg-[#070b14] shadow-xl overflow-hidden">
      <CardHeader className="border-b border-slate-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span>PM Report Findings &amp; Generation Summary</span>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-mono py-0 ml-1 ${
                  result.status === "READY_FOR_REVIEW"
                    ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/60"
                    : "border-amber-500/40 text-amber-300 bg-amber-950/60"
                }`}
              >
                {result.status === "READY_FOR_REVIEW" ? "Ready For Review" : "Action Required"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Deterministic evaluation against CTC QMS-P09-F01 v1.1 standards completed.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                const el = document.getElementById("inline-review-section");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-8 shadow-sm"
            >
              <span>Review Findings</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Ambiguous Log Confirmation Notice (Issue 3) */}
        {ambiguousLogs.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-200">
                  {ambiguousLogs.length === 1
                    ? "One PuTTY log could not be matched. Select its firewall to continue."
                    : `${ambiguousLogs.length} PuTTY logs could not be matched. Select their firewalls to continue.`}
                </p>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  Other matched devices have already been processed. Select the firewall for this log to include its findings.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {ambiguousLogs.map((log) => (
                <div
                  key={log.fileId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-amber-500/30 bg-[#070b14] p-2.5"
                >
                  <div className="truncate">
                    <p className="text-xs font-mono text-white truncate">{log.filename}</p>
                    <p className="text-[10px] text-slate-400">
                      Detected prompt: <span className="font-mono text-amber-300">{log.detectedHostname || "Unknown"}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={selectedDeviceByLog[log.fileId] || ""}
                      onChange={(e) =>
                        setSelectedDeviceByLog((prev) => ({
                          ...prev,
                          [log.fileId]: e.target.value,
                        }))
                      }
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Select Firewall Device...</option>
                      {log.candidates.map((cand) => (
                        <option key={cand.deviceId} value={cand.deviceId}>
                          {cand.hostname} ({cand.role || "Standalone"})
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      onClick={() => handleConfirm(log.fileId)}
                      disabled={!selectedDeviceByLog[log.fileId] || confirmingLogId === log.fileId}
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      {confirmingLogId === log.fileId ? "Confirming..." : "Confirm"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="rounded border border-slate-800 bg-[#0c1222] p-2.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Passed</span>
            <span className="text-lg font-bold text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
              {summary.rulesPassed}
            </span>
          </div>

          <div className="rounded border border-slate-800 bg-[#0c1222] p-2.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Warnings</span>
            <span className="text-lg font-bold text-amber-400 flex items-center justify-center gap-1 mt-0.5">
              <AlertTriangle className="h-4 w-4" />
              {summary.rulesWarning}
            </span>
          </div>

          <div className="rounded border border-slate-800 bg-[#0c1222] p-2.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Failed</span>
            <span className="text-lg font-bold text-rose-400 flex items-center justify-center gap-1 mt-0.5">
              <XCircle className="h-4 w-4" />
              {summary.rulesFailed}
            </span>
          </div>

          <div className="rounded border border-slate-800 bg-[#0c1222] p-2.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Missing</span>
            <span className="text-lg font-bold text-slate-400 flex items-center justify-center gap-1 mt-0.5">
              <HelpCircle className="h-4 w-4" />
              {summary.rulesMissing}
            </span>
          </div>

          <div className="rounded border border-slate-800 bg-[#0c1222] p-2.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Terminal Screenshots</span>
            <span className="text-lg font-bold text-blue-400 flex items-center justify-center gap-1 mt-0.5">
              <Terminal className="h-4 w-4" />
              {summary.cliEvidencePages}
            </span>
          </div>

          <div className="rounded border border-slate-800 bg-[#0c1222] p-2.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">GUI Evidence</span>
            <span className="text-lg font-bold text-purple-400 flex items-center justify-center gap-1 mt-0.5">
              <Layers className="h-4 w-4" />
              {summary.guiScreenshotsActive}
            </span>
          </div>
        </div>

        {/* Re-Review Invalidation Banner (Issue 2) */}
        {summary.reReviewRequiredCount > 0 && (
          <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>
              <strong>{summary.reReviewRequiredCount} finding(s)</strong> flagged for re-review because their underlying CLI evidence changed between runs. Prior approvals were superseded for audit compliance.
            </span>
          </div>
        )}

        {/* Stage Outcomes List (Issue 4: Real results, no fake timers) */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Pipeline Execution Outcomes:
          </p>
          <div className="space-y-1 text-xs">
            {stages.map((stg, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded border border-slate-800/80 bg-[#0c1222]/60 px-3 py-1.5"
              >
                <div className="flex items-center gap-2 truncate">
                  {stg.status === "COMPLETED" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  {stg.status === "WARNING" && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  )}
                  {stg.status === "SKIPPED" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                  )}
                  <span className="text-slate-200 truncate">{stg.message}</span>
                </div>
                <Badge variant="outline" className="text-[9px] font-mono py-0 text-slate-400 shrink-0 ml-2">
                  {stg.stage}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Mode Notice if CLI Only or Template Only */}
        {mode === "CLI_ONLY" && (
          <div className="flex items-center justify-between rounded border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-200">
            <span>
              <strong>CLI Preview Mode:</strong> Telemetry evaluated and terminal screenshots rendered. Upload a Word report template (.docx) to export the final CTC report.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
