"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  Terminal,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  Server,
  ShieldCheck,
  RefreshCw,
  X,
  Calendar,
  Building,
  Sparkles,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatBytes } from "@/lib/utils";
import { metadataReconciler, ReconciledMetadata } from "@/core/session/metadata-reconciler";
import { CliCommandSection } from "@/components/commands";
import { GuiScreenshotUploader } from "@/components/evidence";
import { PipelineSummaryCard } from "./pipeline-summary-card";
import { InlineReviewSection } from "./inline-review-section";
import { ReportDownloadSection } from "./report-download-section";
import { PipelineProcessResult } from "@/core/workflow/pipeline-types";
import { useSessionRecovery } from "./hooks/use-session-recovery";
import { AttachedFilesCard } from "./attached-files-card";
import { ReconstructedPipelineCard } from "./reconstructed-pipeline-card";

export interface RecentSessionItem {
  id: string;
  customer: string;
  vendor: string;
  engineerName: string | null;
  pmDate: string | Date;
  status: string;
  createdAt: string | Date;
  devices: Array<{
    id: string;
    hostname: string;
    model: string | null;
    role: string | null;
  }>;
  _count: {
    devices: number;
    uploadedFiles: number;
    generatedReports: number;
  };
}

interface StagedFile {
  file: File;
  type: "WORD_REPORT" | "PUTTY_LOG";
}

export function ReportGeneratorWorkspace({
  initialSessions,
}: {
  initialSessions: RecentSessionItem[];
}) {
  // Phase 8: Autosave & Session Recovery Hook
  const {
    sessionId: activeSessionId,
    recoveryData,
    isLoading: isRecovering,
    error: recoveryError,
    loadSession,
    startNewSession,
    refreshRecovery,
  } = useSessionRecovery();

  // Staged files (local state before upload)
  const [stagedDocx, setStagedDocx] = useState<File | null>(null);
  const [stagedLog, setStagedLog] = useState<File | null>(null);

  // Active Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [vendor, setVendor] = useState("fortigate");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Automated Pipeline State (Phase 4)
  const [pipelineResult, setPipelineResult] = useState<PipelineProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Reconciled Report Information
  const [metadata, setMetadata] = useState<ReconciledMetadata | null>(null);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editCustomer, setEditCustomer] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editHostname, setEditHostname] = useState("");

  // Recent Sessions Drawer (collapsed by default)
  const [showRecent, setShowRecent] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSessionItem[]>(initialSessions);

  // Session Devices (for multi-device screenshot and checklist targeting)
  const [sessionDevices, setSessionDevices] = useState<
    Array<{ id: string; hostname: string; role: string | null }>
  >([]);

  // Review Data state (allows resuming review after refresh without re-running pipeline)
  const [hasReviewData, setHasReviewData] = useState(false);

  // Synchronize recoveryData with component state when recovered or switched (Adjustment 3 & 7)
  useEffect(() => {
    if (recoveryData) {
      setSessionId(recoveryData.session.id);
      setVendor(recoveryData.session.vendor);
      setEditCustomer(recoveryData.metadata.customer || recoveryData.session.customer);
      setEditModel(recoveryData.metadata.model || "");
      setEditHostname(recoveryData.metadata.primaryHostname || "");
      setMetadata(recoveryData.metadata as any);
      setSessionDevices(recoveryData.devices);
      setHasReviewData(recoveryData.reviewState.totalFindings > 0);
    } else {
      // Clean slate when starting new session or switching
      setSessionId(null);
      setMetadata(null);
      setSessionDevices([]);
      setHasReviewData(false);
      setPipelineResult(null);
      setStagedDocx(null);
      setStagedLog(null);
      setUploadError(null);
      setUploadSuccess(null);
      setPipelineError(null);
    }
  }, [recoveryData]);

  // File input refs
  const docxInputRef = useRef<HTMLInputElement>(null);
  const logInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (f.name.toLowerCase().endsWith(".docx")) {
        setStagedDocx(f);
      } else if (
        f.name.toLowerCase().endsWith(".txt") ||
        f.name.toLowerCase().endsWith(".log")
      ) {
        setStagedLog(f);
      }
    }
  };

  const handleDocxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setStagedDocx(e.target.files[0]);
    }
  };

  const handleLogChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setStagedLog(e.target.files[0]);
    }
  };

  // Ensure session exists or create it on demand
  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId;

    const createRes = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor,
        customer: editCustomer.trim() || "Draft PM Session",
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData.success) {
      throw new Error(createData.error || "Failed to initialize session");
    }
    const newId = createData.data.id;
    setSessionId(newId);
    if (createData.data.devices) {
      setSessionDevices(createData.data.devices);
    }
    await loadSession(newId);
    return newId;
  };

  // Upload staged files and extract metadata automatically
  const handleUploadAndInspect = async () => {
    if (!stagedDocx && !stagedLog) {
      setUploadError("Please select at least one Word report (.docx) or PuTTY log (.txt).");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const currentSessionId = await ensureSession();

      // 2. Upload Word Report if staged
      let docxInspectionData: any = null;
      if (stagedDocx) {
        const docxFormData = new FormData();
        docxFormData.append("file", stagedDocx);
        docxFormData.append("type", "WORD_REPORT");

        const uploadDocxRes = await fetch(`/api/sessions/${currentSessionId}/files`, {
          method: "POST",
          body: docxFormData,
        });

        const uploadDocxData = await uploadDocxRes.json();
        if (!uploadDocxRes.ok || !uploadDocxData.success) {
          throw new Error(uploadDocxData.error || "Failed to upload Word report");
        }

        // Inspect document non-destructively
        const inspectRes = await fetch(`/api/sessions/${currentSessionId}/inspect-doc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: uploadDocxData.data.id }),
        });

        const inspectData = await inspectRes.json();
        if (inspectRes.ok && inspectData.success) {
          docxInspectionData = inspectData.data.inspection;
        }
      }

      // 3. Upload PuTTY log if staged
      let detectedPromptHost: string | null = null;
      if (stagedLog) {
        const logFormData = new FormData();
        logFormData.append("file", stagedLog);
        logFormData.append("type", "PUTTY_LOG");

        const uploadLogRes = await fetch(`/api/sessions/${currentSessionId}/files`, {
          method: "POST",
          body: logFormData,
        });

        const uploadLogData = await uploadLogRes.json();
        if (!uploadLogRes.ok || !uploadLogData.success) {
          throw new Error(uploadLogData.error || "Failed to upload PuTTY log");
        }

        // Parse log to detect prompt hostname
        const parseRes = await fetch(`/api/sessions/${currentSessionId}/parse-log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: uploadLogData.data.id }),
        });

        const parseData = await parseRes.json();
        if (parseRes.ok && parseData.success) {
          detectedPromptHost = parseData.data.segmentedLog?.detectedHostname || null;
        }
      }

      // 4. Reconcile metadata
      const reconciled = metadataReconciler.reconcile(
        docxInspectionData?.metadata || null,
        detectedPromptHost
      );

      setMetadata(reconciled);
      if (reconciled.customer) setEditCustomer(reconciled.customer);
      if (reconciled.model) setEditModel(reconciled.model);
      if (reconciled.devices.length > 0) setEditHostname(reconciled.devices[0].hostname);

      // If customer was extracted and differs from current session, update session
      if (reconciled.customer && currentSessionId) {
        await fetch(`/api/sessions/${currentSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer: reconciled.customer }),
        });
      }

      // Refresh session devices from backend if newly registered
      try {
        const sessionRes = await fetch(`/api/sessions/${currentSessionId}`);
        const sessionData = await sessionRes.json();
        if (sessionRes.ok && sessionData.success && sessionData.data?.devices) {
          setSessionDevices(sessionData.data.devices);
        }
      } catch {
        // Non-blocking fallback
      }

      setUploadSuccess("Files uploaded and verified. Metadata extracted successfully.");
      await refreshRecovery();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Error processing uploaded files");
    } finally {
      setUploading(false);
    }
  };

  // Phase 4: Single-Action Automated Pipeline Execution
  const handleGenerateReport = async () => {
    setIsProcessing(true);
    setPipelineError(null);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      // 1. Ensure session exists
      const currentSessionId = await ensureSession();

      // 2. Upload any staged files
      if (stagedDocx) {
        const docxFormData = new FormData();
        docxFormData.append("file", stagedDocx);
        docxFormData.append("type", "WORD_REPORT");
        const docxRes = await fetch(`/api/sessions/${currentSessionId}/files`, {
          method: "POST",
          body: docxFormData,
        });
        const docxData = await docxRes.json();
        if (!docxRes.ok || !docxData.success) {
          throw new Error(docxData.error || "Failed to upload Word report");
        }
        setStagedDocx(null);
      }

      if (stagedLog) {
        const logFormData = new FormData();
        logFormData.append("file", stagedLog);
        logFormData.append("type", "PUTTY_LOG");
        const logRes = await fetch(`/api/sessions/${currentSessionId}/files`, {
          method: "POST",
          body: logFormData,
        });
        const logData = await logRes.json();
        if (!logRes.ok || !logData.success) {
          throw new Error(logData.error || "Failed to upload PuTTY log");
        }
        setStagedLog(null);
      }

      // 3. Trigger automated processing pipeline
      const procRes = await fetch(`/api/sessions/${currentSessionId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const procData = await procRes.json();
      if (!procRes.ok || !procData.success) {
        throw new Error(procData.error || "Automated PM processing pipeline failed");
      }

      setPipelineResult(procData.data);
      await refreshRecovery();

      // Refresh session devices from backend
      try {
        const sessRes = await fetch(`/api/sessions/${currentSessionId}`);
        const sessData = await sessRes.json();
        if (sessRes.ok && sessData.success && sessData.data?.devices) {
          setSessionDevices(sessData.data.devices);
        }
      } catch {
        // non-blocking
      }
    } catch (err: unknown) {
      setPipelineError(err instanceof Error ? err.message : "PM processing execution failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-trigger processing when engineer confirms ambiguous log mapping
  const handleConfirmDeviceMapping = async (fileId: string, deviceId: string) => {
    if (!sessionId) return;
    setIsProcessing(true);
    setPipelineError(null);
    try {
      const procRes = await fetch(`/api/sessions/${sessionId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceConfirmations: [{ fileId, deviceId }],
        }),
      });
      const procData = await procRes.json();
      if (!procRes.ok || !procData.success) {
        throw new Error(procData.error || "Failed to confirm device mapping");
      }
      setPipelineResult(procData.data);
    } catch (err: unknown) {
      setPipelineError(err instanceof Error ? err.message : "Failed to confirm mapping");
    } finally {
      setIsProcessing(false);
    }
  };

  // Save manual edits to detected report information
  const handleSaveInfo = async () => {
    if (!sessionId) return;

    try {
      if (editCustomer.trim()) {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer: editCustomer.trim() }),
        });
      }

      if (editHostname.trim()) {
        await fetch(`/api/sessions/${sessionId}/devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hostname: editHostname.trim(),
            model: editModel.trim() || undefined,
            role: "Primary",
          }),
        });
      }

      // Update local metadata view
      if (metadata) {
        setMetadata({
          ...metadata,
          customer: editCustomer.trim() || metadata.customer,
          model: editModel.trim() || metadata.model,
          devices: editHostname.trim()
            ? [
                {
                  hostname: editHostname.trim(),
                  model: editModel.trim() || undefined,
                  role: "Primary",
                  source: "BOTH",
                },
              ]
            : metadata.devices,
          missingFields: [],
        });
      }

      setIsEditingInfo(false);
    } catch (err) {
      console.error("Failed to update information", err);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-6 space-y-6 w-full">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              PM Report Generator
            </h1>
            <span className="rounded-md bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-300 border border-blue-500/30">
              FortiGate Active
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Upload your PuTTY session log and CTC Word report to automatically extract metadata and prepare findings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {sessionId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startNewSession}
              className="gap-1.5 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-8"
              title="Clear active workspace to start a new session (existing saved sessions are preserved)"
            >
              <RotateCcw className="h-3.5 w-3.5 text-blue-400" />
              <span>New Session</span>
            </Button>
          )}

          <label className="text-xs font-medium text-slate-400">Vendor Adapter:</label>
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="rounded-lg border border-slate-700 bg-[#070b14] px-3 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="fortigate">Fortinet FortiGate (QMS-P09-F01)</option>
            <option value="paloalto" disabled>Palo Alto Networks (Future)</option>
            <option value="checkpoint" disabled>Check Point Quantum (Future)</option>
          </select>
        </div>
      </div>

      {/* CLI Command Reference Section (Phase 2) */}
      <CliCommandSection vendor={vendor} />

      {/* Attached Evidence Files (if session already has files in SQLite - Phase 8) */}
      {recoveryData?.files && (recoveryData.files.docxReport || recoveryData.files.puttyLogs.length > 0) && (
        <AttachedFilesCard
          files={recoveryData.files}
          onUploadAdditional={() => {
            docxInputRef.current?.click();
          }}
        />
      )}

      {/* Upload & Staging Area */}
      <Card className="border-slate-800 bg-[#070b14]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <Upload className="h-4 w-4 text-blue-400" />
            Upload PM Evidence Files
          </CardTitle>
          <CardDescription className="text-slate-300">
            Select or drag and drop your authentic PuTTY session log (`.txt` / `.log`) and existing CTC Word report (`.docx`).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Drag & Drop Target */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-500/10"
                : "border-slate-700/80 bg-[#0c1222] hover:border-slate-600"
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 mb-3 border border-blue-500/20">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-white">
              Drag &amp; drop files here, or choose from your computer
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports PuTTY terminal logs (`.txt`, `.log`) and CTC Word templates (`.docx`)
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input
                ref={docxInputRef}
                type="file"
                accept=".docx"
                onChange={handleDocxChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => docxInputRef.current?.click()}
                className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700"
              >
                <FileText className="h-4 w-4 text-blue-400" />
                <span>Select Word Report (.docx)</span>
              </Button>

              <input
                ref={logInputRef}
                type="file"
                accept=".txt,.log"
                onChange={handleLogChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logInputRef.current?.click()}
                className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700"
              >
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Select PuTTY Log (.txt)</span>
              </Button>
            </div>
          </div>

          {/* Staged Files Preview */}
          {(stagedDocx || stagedLog) && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold text-slate-300">Staged Files for Processing:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stagedDocx && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0c1222]">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-medium text-white truncate">{stagedDocx.name}</p>
                        <p className="text-[11px] text-slate-400">{formatBytes(stagedDocx.size)} · Word Report</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStagedDocx(null)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {stagedLog && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0c1222]">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-medium text-white truncate">{stagedLog.name}</p>
                        <p className="text-[11px] text-slate-400">{formatBytes(stagedLog.size)} · PuTTY Session Log</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStagedLog(null)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end pt-2">
                <Button
                  type="button"
                  onClick={handleUploadAndInspect}
                  disabled={uploading}
                  className="gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-900/30"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Inspecting Files...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Upload &amp; Detect Report Info</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Feedback Banners */}
          {uploadSuccess && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {uploadError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{uploadError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detected Report Information Card (Extracted from uploaded Word report & PuTTY log) */}
      {metadata && (
        <Card className="border-slate-800 bg-[#0c1222] shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Detected Report Information
              </CardTitle>
              <CardDescription className="text-slate-300">
                Extracted directly from your uploaded CTC Word report and PuTTY session log.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditingInfo(!isEditingInfo)}
              className="gap-1.5 border-slate-700 bg-slate-800 text-slate-200 hover:text-white"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{isEditingInfo ? "Close Editor" : "Edit Info"}</span>
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Ambiguity Warning Banner if detected */}
            {metadata.isAmbiguous && metadata.ambiguityReason && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-300">Device Mapping Attention Required</p>
                  <p className="mt-0.5">{metadata.ambiguityReason}</p>
                </div>
              </div>
            )}

            {isEditingInfo ? (
              /* Inline Edit Mode */
              <div className="space-y-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-200">
                      Customer / Organization <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={editCustomer}
                      onChange={(e) => setEditCustomer(e.target.value)}
                      placeholder="e.g. AEON Credit Services"
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-200">Hardware Model</label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="e.g. FortiGate 200F"
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-200">
                      Primary Hostname <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={editHostname}
                      onChange={(e) => setEditHostname(e.target.value)}
                      placeholder="e.g. HQ_T2_FG200F_Primary"
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingInfo(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveInfo}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-medium"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-800 bg-[#070b14] p-3.5">
                  <p className="text-[11px] font-medium text-slate-400">Customer</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {metadata.customer || (
                      <span className="text-amber-400 text-xs">Unspecified (Click Edit)</span>
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070b14] p-3.5">
                  <p className="text-[11px] font-medium text-slate-400">Vendor Engine</p>
                  <p className="mt-1 text-sm font-semibold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    FortiGate (v1.1)
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070b14] p-3.5">
                  <p className="text-[11px] font-medium text-slate-400">Hardware Model</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {metadata.model || (
                      <span className="text-amber-400 text-xs">Not detected</span>
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070b14] p-3.5">
                  <p className="text-[11px] font-medium text-slate-400">Devices Detected</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {metadata.devices.length > 0 ? (
                      metadata.devices.map((d, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200 font-mono border border-slate-700"
                        >
                          {d.hostname}
                          <span className="ml-1 text-[10px] text-slate-400">({d.role})</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-amber-400 text-xs">No devices detected</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {sessionId && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
                <span>
                  Active Session: <span className="font-mono text-slate-300">{sessionId}</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Reviews and evidence changes auto-saved to SQLite
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* GUI Screenshots & Manual Evidence */}
      <GuiScreenshotUploader
        sessionId={sessionId}
        devices={sessionDevices}
        vendor={vendor}
        onEnsureSession={ensureSession}
      />

      {/* Generate PM Report Single-Action Execution Panel */}
      <Card className="border-slate-800 bg-[#070b14] shadow-md">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <h3 className="text-base font-semibold text-white">Automated PM Report Generation</h3>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300 bg-emerald-950/40 text-[10px] font-mono"
                >
                  QMS-P09-F01 v1.1
                </Badge>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Executes complete pipeline in one action: inspects CTC Word tables, segments PuTTY commands,
                deterministically evaluates 21 PM rules, and atomically renders terminal screenshot evidence.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Button
                size="lg"
                onClick={handleGenerateReport}
                disabled={isProcessing || (!stagedDocx && !stagedLog && !sessionId)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 h-11 transition-colors cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>Processing PM Report...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                    <span>Generate PM Report</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Processing Error Banner */}
          {pipelineError && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{pipelineError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Summary Card (Phase 4 Results & Review Entrypoint) */}
      {pipelineResult && (
        <PipelineSummaryCard
          result={pipelineResult}
          onRetry={handleGenerateReport}
          onConfirmDeviceMapping={handleConfirmDeviceMapping}
        />
      )}

      {/* Reconstructed Pipeline Card (Adjustment 2: authoritative restored state without fabrication) */}
      {!pipelineResult && recoveryData?.pipelineState.hasRun && (
        <ReconstructedPipelineCard
          pipelineState={recoveryData.pipelineState}
          onRerun={handleGenerateReport}
          isProcessing={isProcessing}
        />
      )}

      {/* Inline Engineer Findings Review (Phase 5) */}
      {sessionId && (pipelineResult || hasReviewData) && (
        <InlineReviewSection
          sessionId={sessionId}
          onReviewUpdated={() => {
            setHasReviewData(true);
            refreshRecovery();
          }}
        />
      )}

      {/* Word Report Export & Download Section (Phase 7) */}
      {sessionId && (pipelineResult || hasReviewData) && (
        <ReportDownloadSection
          sessionId={sessionId}
          onExportComplete={() => refreshRecovery()}
        />
      )}


      {/* Compact Collapsible Recent Reports Section (Issue 9) */}
      <div className="pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => setShowRecent(!showRecent)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {showRecent ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <span>Recent PM Reports ({recentSessions.length})</span>
        </button>

        {showRecent && (
          <div className="mt-4 space-y-3">
            {recentSessions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No prior PM reports recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#070b14]">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 hover:bg-slate-900/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">
                          {session.customer}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {session.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(session.pmDate)}
                        </span>
                        {session.devices.length > 0 && (
                          <span className="flex items-center gap-1 font-mono">
                            <Server className="h-3 w-3" />
                            {session.devices.map((d) => d.hostname).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          loadSession(session.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs h-8"
                      >
                        <span>Resume on Generator</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>

                      <Link href={`/sessions/${session.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs h-8"
                          title="Open multi-tab session overview workspace"
                        >
                          <span>Workspace</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
