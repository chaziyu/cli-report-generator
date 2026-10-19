"use client";

import { useState } from "react";
import {
  FileCheck,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  X,
  Sparkles,
  ShieldCheck,
  FileText,
  ExternalLink,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AppliedRowChange, AppliedAppendixChange, ReportChangeSummary } from "@/core/document";

interface ReportExportModalProps {
  sessionId: string;
  deviceId?: string;
  customerName: string;
  deviceHostname?: string;
  approvedCount: number;
  totalChecks: number;
  hasOriginalDoc: boolean;
  originalDocFilename?: string | null;
  onClose: () => void;
  onExportSuccess?: () => void;
}

export function ReportExportModal({
  sessionId,
  deviceId,
  customerName,
  deviceHostname,
  approvedCount,
  totalChecks,
  hasOriginalDoc,
  originalDocFilename,
  onClose,
  onExportSuccess,
}: ReportExportModalProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<{
    reportId: string;
    version: number;
    filename: string;
    downloadUrl: string;
    changeSummary: ReportChangeSummary;
  } | null>(null);

  const handleGenerateReport = async () => {
    try {
      setExporting(true);
      setError(null);

      const res = await fetch(`/api/sessions/${sessionId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate Word report");
      }

      setGeneratedReport(json.data);
      onExportSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating report");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative flex flex-col max-h-[92vh] w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FileCheck className="h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Export Updated CTC Word Report
              </h3>
              <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/40 bg-emerald-950/40 font-mono">
                CTC PM
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              Apply approved findings and authentic CLI evidence directly into the verified CTC Word report.
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Report Context Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Customer &amp; Host</span>
              <p className="text-xs font-bold text-white truncate">
                {customerName}
              </p>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {deviceHostname || "All Devices"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Source Word Template</span>
              <p className="text-xs font-medium text-slate-200 truncate">
                {originalDocFilename || "Uploaded Word Report"}
              </p>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Format preserved
              </span>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-emerald-400">Approval Scope</span>
              <p className="text-xs font-bold text-emerald-300">
                {approvedCount} of {totalChecks} checks approved
              </p>
              <span className="text-[10px] text-slate-400">
                Unapproved remain original
              </span>
            </div>
          </div>

          {!hasOriginalDoc && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Original Word Document Required
              </p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Please upload an existing CTC Word report (.docx) in the Session Overview before generating an updated report.
              </p>
            </div>
          )}

          {/* Generated Result Banner */}
          {generatedReport ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6 space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">
                  Report Generated Successfully (v{generatedReport.version})
                </h4>
                <p className="text-xs text-slate-300 font-mono">
                  {generatedReport.filename}
                </p>
                <p className="text-[11px] text-slate-400">
                  Applied {generatedReport.changeSummary.appliedRowChanges.length} checklist row updates and {generatedReport.changeSummary.appliedAppendixChanges.length} appendix images. Protected sign-off sections preserved.
                </p>
              </div>

              <div className="pt-2 flex justify-center">
                <a
                  href={generatedReport.downloadUrl}
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/40 transition-all"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Updated Report (.docx)</span>
                </a>
              </div>

              {/* Change Log Table */}
              <div className="pt-4 text-left space-y-2">
                <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-400" />
                  <span>Applied Changes Summary ({generatedReport.changeSummary.appliedRowChanges.length}):</span>
                </h5>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="p-2">Item</th>
                        <th className="p-2">Task</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Updated Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                      {generatedReport.changeSummary.appliedRowChanges.map((change) => (
                        <tr key={change.checkId} className="hover:bg-slate-900/40">
                          <td className="p-2 font-bold text-blue-400">{change.itemNumber}</td>
                          <td className="p-2 font-sans font-medium text-slate-200">{change.taskName}</td>
                          <td className="p-2 text-emerald-400 font-bold">{change.newStatus}</td>
                          <td className="p-2 font-sans text-slate-300 truncate max-w-[200px]" title={change.newRemarks}>
                            {change.newRemarks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Pre-generation confirmation */
            <div className="space-y-4">
              <Card className="border-slate-800 bg-slate-950/40 p-4">
                <h4 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  Targeted OOXML Preserving Generation
                </h4>
                <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                  <li>Opens original report archive and applies only approved checklist findings.</li>
                  <li>Toggles Word checkboxes (<span className="font-mono text-slate-300">☒ / ☐</span>) in status column.</li>
                  <li>Updates remarks column in CTC blue typography (<span className="font-mono text-slate-300">#0070C0</span>).</li>
                  <li>Replaces appendix images with authentic PuTTY terminal evidence PNGs.</li>
                  <li>
                    <strong className="text-slate-200">Guaranteed Protection:</strong> Author details, technical credentials, customer satisfaction survey, and document headers remain 100% untouched.
                  </li>
                </ul>
              </Card>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-6 py-3.5 text-xs text-slate-400">
          <span>QMS-P09-F01 v1.1 Word Report Engine</span>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {generatedReport ? "Done" : "Cancel"}
            </Button>

            {!generatedReport && (
              <Button
                size="sm"
                onClick={handleGenerateReport}
                disabled={exporting || !hasOriginalDoc}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5 shadow-md shadow-emerald-900/30"
              >
                {exporting ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Generating DOCX...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Generate Updated Report</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
