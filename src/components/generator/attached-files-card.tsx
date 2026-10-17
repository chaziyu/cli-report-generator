"use client";

import { useState } from "react";
import {
  FileText,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Server,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/utils";
import { SessionRecoveryResponse } from "@/app/api/sessions/[id]/recovery/route";

interface AttachedFilesCardProps {
  files: SessionRecoveryResponse["files"];
  onUploadAdditional?: () => void;
}

export function AttachedFilesCard({ files, onUploadAdditional }: AttachedFilesCardProps) {
  const [showLogs, setShowLogs] = useState(true);

  const hasDocx = Boolean(files.docxReport);
  const logCount = files.puttyLogs.length;
  const hasMissingFiles = files.missingDiskFiles.length > 0;

  if (!hasDocx && logCount === 0) {
    return null;
  }

  return (
    <Card className="border-slate-800 bg-[#070b14] shadow-lg overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <Layers className="h-4 w-4 text-blue-400" />
              Attached PM Evidence Files
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Persisted in local session storage. Re-uploaded or additional files can be appended at any time.
            </CardDescription>
          </div>

          {onUploadAdditional && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUploadAdditional}
              className="gap-1.5 border-slate-700 bg-slate-800 text-slate-200 hover:text-white text-xs h-8"
            >
              <Upload className="h-3.5 w-3.5 text-blue-400" />
              <span>Attach More Files</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Missing Disk Files Warning Banner (Adjustment 5) */}
        {hasMissingFiles && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Inaccessible or Missing Storage Files Detected</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              One or more files recorded in SQLite could not be located in local disk storage. You can re-upload them below:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-300 font-mono">
              {files.missingDiskFiles.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Word Template Card */}
        {files.docxReport && (
          <div className="rounded-lg border border-slate-800 bg-[#0c1222] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 overflow-hidden">
              <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white truncate">
                    {files.docxReport.originalFilename}
                  </span>
                  {files.docxReport.existsOnDisk ? (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/40 text-[10px]">
                      Verified on Disk
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-rose-500/40 text-rose-300 bg-rose-950/50 text-[10px]">
                      Missing on Disk
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formatBytes(files.docxReport.sizeBytes)} · Layout: {files.docxReport.layoutName || "CTC Report"} · Uploaded {formatDate(files.docxReport.createdAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* PuTTY Session Logs Section (Multiple Logs Support - Adjustment 1) */}
        {logCount > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span>PuTTY Session Logs ({logCount})</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <span>{showLogs ? "Collapse" : "Expand"}</span>
                {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showLogs && (
              <div className="grid grid-cols-1 gap-2.5">
                {files.puttyLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-slate-800/80 bg-[#0c1222] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3 overflow-hidden">
                      <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                        <Terminal className="h-4 w-4" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white truncate">
                            {log.originalFilename}
                          </span>
                          {log.deviceHostname && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 font-mono border border-slate-700">
                              <Server className="h-2.5 w-2.5 text-slate-400" />
                              {log.deviceHostname}
                            </span>
                          )}
                          {log.existsOnDisk ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/40 text-[10px]">
                              Online
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-rose-500/40 text-rose-300 bg-rose-950/50 text-[10px]">
                              Missing
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatBytes(log.sizeBytes)} · {log.commandCount} CLI commands parsed · Status: <span className="font-semibold text-slate-300">{log.status}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
