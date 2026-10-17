"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  FileCheck2,
  AlertTriangle,
  RotateCw,
  ShieldCheck,
  CheckCircle2,
  Server,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DeviceExportInfo {
  id: string;
  hostname: string;
  model: string | null;
  role: string | null;
  totalChecks: number;
  approvedChecksCount: number;
  pendingChecksCount: number;
  evidenceCount: number;
  latestReport: {
    id: string;
    version: number;
    downloadUrl: string;
    createdAt: string;
  } | null;
}

interface ExportReadinessData {
  canExport: boolean;
  hasOriginalDoc: boolean;
  originalDocFilename: string | null;
  layoutName: string;
  supportsMultiDeviceSections: boolean;
  warnings: string[];
  errors: string[];
  devices: DeviceExportInfo[];
  totalReports: number;
  evidenceSummary: {
    activeCount: number;
    excludedCount: number;
  };
}

interface ReportDownloadSectionProps {
  sessionId: string;
  onExportComplete?: () => void;
}

export function ReportDownloadSection({
  sessionId,
  onExportComplete,
}: ReportDownloadSectionProps) {
  const [readiness, setReadiness] = useState<ExportReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<{
    version: number;
    filename: string;
    downloadUrl: string;
    appliedRows: number;
    appliedAppendices: number;
    isCached: boolean;
  } | null>(null);

  const fetchReadiness = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/sessions/${sessionId}/export`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load export readiness");
      }
      setReadiness(json.data);
      if (json.data.devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(json.data.devices[0].id);
      }
    } catch (err) {
      console.error("Export readiness load error:", err);
      setError(err instanceof Error ? err.message : "Error checking export readiness");
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedDeviceId]);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  const activeDevice =
    readiness?.devices.find((d) => d.id === selectedDeviceId) ||
    readiness?.devices[0];

  const handleDownloadReport = async () => {
    if (!readiness?.canExport) {
      setError("Cannot export: original Word report (.docx) must be uploaded first.");
      return;
    }

    try {
      setExporting(true);
      setError(null);
      setDownloadSuccess(null);

      const res = await fetch(`/api/sessions/${sessionId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: activeDevice?.id,
          force: false,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate report");
      }

      const reportData = json.data;
      setDownloadSuccess({
        version: reportData.version,
        filename: reportData.filename,
        downloadUrl: reportData.downloadUrl,
        appliedRows: reportData.changeSummary?.appliedRowChanges?.length || 0,
        appliedAppendices: reportData.changeSummary?.appliedAppendixChanges?.length || 0,
        isCached: Boolean(reportData.isCached),
      });

      // Trigger instant browser download via anchor
      const downloadLink = document.createElement("a");
      downloadLink.href = reportData.downloadUrl;
      downloadLink.download = reportData.filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      onExportComplete?.();
      fetchReadiness();
    } catch (err) {
      console.error("Download failed:", err);
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-[#070b14] shadow-md overflow-hidden mt-6">
      <CardHeader className="border-b border-slate-800/80 bg-slate-950/60 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-emerald-400" />
              <span>Download Updated Word Report (.docx)</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-300">
              Applies only current engineer-approved findings and verified evidence into CTC QMS-P09-F01 v1.1.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {readiness?.canExport ? (
              <Badge className="bg-emerald-950/80 text-emerald-300 border-emerald-500/40 text-xs px-2.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                <span>Ready for Export</span>
              </Badge>
            ) : (
              <Badge className="bg-amber-950/80 text-amber-300 border-amber-500/40 text-xs px-2.5 py-1">
                <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-400" />
                <span>Word Doc Required</span>
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-5">
        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Export Blocked</p>
              <p className="text-rose-200">{error}</p>
            </div>
          </div>
        )}

        {/* Multi-Device Selector Tabs (Correction 2) */}
        {readiness && readiness.devices.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-blue-400" />
              <span>Select Firewall Report:</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {readiness.devices.map((device) => {
                const isSelected = device.id === (activeDevice?.id || selectedDeviceId);
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => {
                      setSelectedDeviceId(device.id);
                      setDownloadSuccess(null);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? "bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-900/20"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <span className="font-bold">{device.hostname}</span>
                    <span className="text-[10px] text-slate-400">({device.role || "Device"})</span>
                    <Badge variant="outline" className="text-[10px] ml-1 bg-slate-950/60">
                      {device.approvedChecksCount} / {device.totalChecks} approved
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Readiness Context Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Word Template</span>
            <p className="text-xs font-semibold text-white truncate" title={readiness?.originalDocFilename || ""}>
              {readiness?.originalDocFilename || "No DOCX uploaded"}
            </p>
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              <span>Layout &amp; Sign-off Protected</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Approved Findings</span>
            <p className="text-xs font-bold text-emerald-300">
              {activeDevice ? `${activeDevice.approvedChecksCount} of ${activeDevice.totalChecks} checks` : "—"}
            </p>
            <p className="text-[10px] text-slate-400">
              {activeDevice && activeDevice.pendingChecksCount > 0
                ? `${activeDevice.pendingChecksCount} unapproved remain original`
                : "All findings approved"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Evidence In Appendices</span>
            <p className="text-xs font-bold text-blue-300">
              {activeDevice ? `${activeDevice.evidenceCount} active items` : "—"}
            </p>
            <p className="text-[10px] text-slate-400">
              Original screenshots preserved by default
            </p>
          </div>
        </div>

        {/* Warnings list if any */}
        {readiness && readiness.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span>Export Considerations:</span>
            </p>
            <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
              {readiness.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Download Success Notice */}
        {downloadSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-emerald-300">
                  Report v{downloadSuccess.version} Downloaded Successfully!
                </span>
              </div>
              {downloadSuccess.isCached && (
                <Badge variant="outline" className="text-[10px] text-blue-300 border-blue-500/30 bg-blue-950/40">
                  Deduplicated Build
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-300 font-mono">
              {downloadSuccess.filename}
            </p>
            <p className="text-[11px] text-slate-400">
              Applied {downloadSuccess.appliedRows} checklist row modifications and{" "}
              {downloadSuccess.appliedAppendices} appendix evidence images. Author signatures and customer survey intact.
            </p>
          </div>
        )}

        {/* Single Primary Action Button (Correction 9) */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Target device: <strong className="text-white">{activeDevice?.hostname || "Firewall"}</strong></span>
          </div>

          <Button
            size="lg"
            onClick={handleDownloadReport}
            disabled={exporting || loading || !readiness?.canExport}
            className="w-full sm:w-auto min-w-[260px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 text-sm cursor-pointer transition-colors"
          >
            {exporting ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                <span>Generating Updated DOCX...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>Download Updated Word Report (.docx)</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
