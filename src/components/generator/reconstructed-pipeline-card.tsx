"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  RotateCw,
  Server,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { SessionRecoveryResponse } from "@/app/api/sessions/[id]/recovery/route";

interface ReconstructedPipelineCardProps {
  pipelineState: SessionRecoveryResponse["pipelineState"];
  onRerun: () => void;
  isProcessing?: boolean;
}

export function ReconstructedPipelineCard({
  pipelineState,
  onRerun,
  isProcessing,
}: ReconstructedPipelineCardProps) {
  if (!pipelineState.hasRun) {
    return null;
  }

  const {
    status,
    totalChecks,
    passCount,
    warnCount,
    failCount,
    naCount,
    reviewRequiredCount,
    totalCommands,
    parsedCommandsCount,
    devices,
    lastExecutedAt,
  } = pipelineState;

  const getStatusBadge = () => {
    switch (status) {
      case "SUCCESS":
        return (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-950/40">
            Pipeline Evaluated (Healthy)
          </Badge>
        );
      case "INTERRUPTED":
        return (
          <Badge variant="outline" className="border-rose-500/50 text-rose-300 bg-rose-950/50">
            Processing Interrupted (Server/Process Terminated)
          </Badge>
        );
      case "RE_REVIEW_REQUIRED":
        return (
          <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-950/40">
            {reviewRequiredCount} Check(s) Require Review
          </Badge>
        );
      case "PARTIAL":
        return (
          <Badge variant="outline" className="border-orange-500/40 text-orange-300 bg-orange-950/40">
            Partial Execution (Incomplete Data)
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="outline" className="border-rose-500/40 text-rose-300 bg-rose-950/40">
            Pipeline Errors Encountered
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-blue-500/40 text-blue-300 bg-blue-950/40">
            Processing Ready
          </Badge>
        );
    }
  };

  return (
    <Card className="border-slate-800 bg-[#070b14] shadow-md overflow-hidden border-blue-500/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">
                Persisted PM Pipeline Results
              </h3>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-300 flex items-center gap-2">
              <span>Authoritative results restored from session database.</span>
              {lastExecutedAt && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="h-3 w-3" />
                  Evaluated {formatDate(lastExecutedAt)}
                </span>
              )}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRerun}
            disabled={isProcessing}
            className="gap-1.5 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs self-start sm:self-auto"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            <span>Re-run Pipeline</span>
          </Button>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-800/80">
          <div className="rounded border border-slate-800 bg-[#0c1222] p-2">
            <p className="text-[10px] text-slate-400 font-medium">Total PM Checks</p>
            <p className="text-sm font-bold text-white mt-0.5">{totalChecks}</p>
          </div>

          <div className="rounded border border-emerald-950/60 bg-emerald-950/20 p-2">
            <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Pass
            </p>
            <p className="text-sm font-bold text-emerald-300 mt-0.5">{passCount}</p>
          </div>

          <div className="rounded border border-amber-950/60 bg-amber-950/20 p-2">
            <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Warning / Review
            </p>
            <p className="text-sm font-bold text-amber-300 mt-0.5">{warnCount + reviewRequiredCount}</p>
          </div>

          <div className="rounded border border-rose-950/60 bg-rose-950/20 p-2">
            <p className="text-[10px] text-rose-400 font-medium flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Fail
            </p>
            <p className="text-sm font-bold text-rose-300 mt-0.5">{failCount}</p>
          </div>

          <div className="rounded border border-slate-800 bg-[#0c1222] p-2">
            <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <Terminal className="h-3 w-3" /> CLI Commands
            </p>
            <p className="text-sm font-bold text-slate-200 mt-0.5">
              {parsedCommandsCount} / {totalCommands}
            </p>
          </div>
        </div>

        {/* Device Badges */}
        {devices.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
            <span className="font-medium">Evaluated Firewalls:</span>
            {devices.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-2 py-0.5 text-xs text-slate-200 font-mono border border-slate-700"
              >
                <Server className="h-3 w-3 text-slate-400" />
                {d.hostname}
                <span className="text-[10px] text-slate-400">({d.role || "Device"})</span>
                <span className="text-[10px] text-emerald-400 ml-1">{d.passCount}P</span>
                {d.warnCount > 0 && <span className="text-[10px] text-amber-400">{d.warnCount}W</span>}
                {d.failCount > 0 && <span className="text-[10px] text-rose-400">{d.failCount}F</span>}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
