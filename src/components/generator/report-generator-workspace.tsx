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
  Trash2,
  Loader2,
  AlertTriangle,
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

export interface StagedLogFile {
  id: string;
  file: File;
  roleHint: "Primary" | "Secondary" | "Standalone" | "Auto";
}

export function detectRoleHint(filename: string, index: number): "Primary" | "Secondary" | "Standalone" | "Auto" {
  const lower = filename.toLowerCase();
  if (lower.includes("pri") || lower.includes("master") || lower.includes("active") || lower.includes("node1") || lower.includes("fw1")) {
    return "Primary";
  }
  if (lower.includes("sec") || lower.includes("slave") || lower.includes("standby") || lower.includes("node2") || lower.includes("fw2")) {
    return "Secondary";
  }
  if (index === 0) return "Primary";
  if (index === 1) return "Secondary";
  return "Auto";
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

  // Staged files (local state before upload - supporting multi-log HA workflows)
  const [stagedDocx, setStagedDocx] = useState<File | null>(null);
  const [stagedLogs, setStagedLogs] = useState<StagedLogFile[]>([]);

  // Active Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [vendor, setVendor] = useState("fortigate");
  const [supportedVendors, setSupportedVendors] = useState<Array<{ id: string; displayName: string }>>([]);
  const [vendorLoadError, setVendorLoadError] = useState<string | null>(null);
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

  // Session Deletion state
  const [sessionToDelete, setSessionToDelete] = useState<RecentSessionItem | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setRecentSessions(initialSessions);
  }, [initialSessions]);

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
      setStagedLogs([]);
      setUploadError(null);
      setUploadSuccess(null);
      setPipelineError(null);
    }
  }, [recoveryData]);

  const addStagedLogs = (files: File[]) => {
    setStagedLogs((prev) => {
      const existingKeys = new Set(prev.map((l) => `${l.file.name}-${l.file.size}`));
      const newItems: StagedLogFile[] = [];
      let totalCount = prev.length;

      for (const f of files) {
        const key = `${f.name}-${f.size}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          newItems.push({
            id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file: f,
            roleHint: detectRoleHint(f.name, totalCount),
          });
          totalCount++;
        }
      }
      return [...prev, ...newItems];
    });
  };

  const removeStagedLog = (id: string) => {
    setStagedLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const updateStagedLogRole = (id: string, role: "Primary" | "Secondary" | "Standalone" | "Auto") => {
    setStagedLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, roleHint: role } : l))
    );
  };

  // File input refs
  const docxInputRef = useRef<HTMLInputElement>(null);
  const logInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/vendors")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Failed to load supported vendors");
        if (mounted) setSupportedVendors(data.data.map((item: { id: string; displayName: string }) => ({ id: item.id, displayName: item.displayName })));
      })
      .catch((error) => {
        if (mounted) setVendorLoadError(error instanceof Error ? error.message : "Failed to load supported vendors");
      });
    return () => { mounted = false; };
  }, []);

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
    const logFiles: File[] = [];
    for (const f of files) {
      if (f.name.toLowerCase().endsWith(".docx")) {
        if (vendor === "fortigate") setStagedDocx(f);
        else setUploadError("Word export is unavailable for this vendor until an approved CTC report layout is verified.");
      } else if (
        f.name.toLowerCase().endsWith(".txt") ||
        f.name.toLowerCase().endsWith(".log")
      ) {
        logFiles.push(f);
      }
    }
    if (logFiles.length > 0) {
      addStagedLogs(logFiles);
    }
  };

  const handleDocxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (vendor !== "fortigate") {
      setUploadError("Word export is unavailable for this vendor until an approved CTC report layout is verified.");
      e.target.value = "";
      return;
    }
    if (e.target.files && e.target.files[0]) {
      setStagedDocx(e.target.files[0]);
    }
  };

  const handleVendorChange = (nextVendor: string) => {
    setVendor(nextVendor);
    if (nextVendor !== "fortigate" && stagedDocx) {
      setStagedDocx(null);
      setUploadError("The staged Word report was cleared because this vendor has no verified CTC layout.");
    }
  };

  const handleLogChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addStagedLogs(Array.from(e.target.files));
    }
    e.target.value = "";
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

  // Upload staged files and extract metadata automatically (supporting multi-log HA pairs)
  const handleUploadAndInspect = async () => {
    if (!stagedDocx && stagedLogs.length === 0) {
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

      // 3. Upload and parse all staged PuTTY logs (Primary + Secondary HA workflow)
      const detectedHosts: Array<{ hostname: string; role: string }> = [];

      for (const logItem of stagedLogs) {
        const logFormData = new FormData();
        logFormData.append("file", logItem.file);
        logFormData.append("type", "PUTTY_LOG");

        const uploadLogRes = await fetch(`/api/sessions/${currentSessionId}/files`, {
          method: "POST",
          body: logFormData,
        });

        const uploadLogData = await uploadLogRes.json();
        if (!uploadLogRes.ok || !uploadLogData.success) {
          throw new Error(uploadLogData.error || `Failed to upload PuTTY log "${logItem.file.name}"`);
        }

        // Parse log to detect prompt hostname
        const parseRes = await fetch(`/api/sessions/${currentSessionId}/parse-log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: uploadLogData.data.id }),
        });

        const parseData = await parseRes.json();
        if (parseRes.ok && parseData.success) {
          const detectedPromptHost = parseData.data.segmentedLog?.detectedHostname || null;
          if (detectedPromptHost) {
            detectedHosts.push({
              hostname: detectedPromptHost,
              role:
                logItem.roleHint !== "Auto"
                  ? logItem.roleHint
                  : detectedHosts.length === 0
                  ? "Primary"
                  : "Secondary",
            });
          }
        }
      }

      // 4. Reconcile metadata
      const currentMetadata = docxInspectionData?.metadata || null;
      const reconciled = metadataReconciler.reconcile(
        currentMetadata,
        detectedHosts.length > 0 ? detectedHosts[0].hostname : null
      );

      // If multiple distinct hosts detected, include secondary devices
      if (detectedHosts.length > 1) {
        for (let i = 1; i < detectedHosts.length; i++) {
          const h = detectedHosts[i];
          const exists = reconciled.devices.some(
            (d) => d.hostname.toLowerCase() === h.hostname.toLowerCase()
          );
          if (!exists) {
            reconciled.devices.push({
              hostname: h.hostname,
              model: reconciled.model || undefined,
              role: h.role,
              source: "CLI",
            });
          }
        }
      }

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

      // Register newly discovered devices with backend
      for (const dev of reconciled.devices) {
        const alreadyRegistered = sessionDevices.some(
          (d) => d.hostname.toLowerCase() === dev.hostname.toLowerCase()
        );
        if (!alreadyRegistered) {
          try {
            await fetch(`/api/sessions/${currentSessionId}/devices`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                hostname: dev.hostname,
                model: dev.model || undefined,
                serialNumber: dev.serialNumber || undefined,
                role: dev.role,
              }),
            });
          } catch {
            // ignore duplicate
          }
        }
      }

      // Refresh session devices from backend
      try {
        const sessionRes = await fetch(`/api/sessions/${currentSessionId}`);
        const sessionData = await sessionRes.json();
        if (sessionRes.ok && sessionData.success && sessionData.data?.devices) {
          setSessionDevices(sessionData.data.devices);
        }
      } catch {
        // Non-blocking fallback
      }

      const logMsg =
        stagedLogs.length > 0
          ? ` (${stagedLogs.length} PuTTY log${stagedLogs.length !== 1 ? "s" : ""})`
          : "";
      setUploadSuccess(`Files uploaded and verified${logMsg}. Metadata extracted successfully.`);
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

      if (stagedLogs.length > 0) {
        for (const logItem of stagedLogs) {
          const logFormData = new FormData();
          logFormData.append("file", logItem.file);
          logFormData.append("type", "PUTTY_LOG");
          const logRes = await fetch(`/api/sessions/${currentSessionId}/files`, {
            method: "POST",
            body: logFormData,
          });
          const logData = await logRes.json();
          if (!logRes.ok || !logData.success) {
            throw new Error(logData.error || `Failed to upload PuTTY log "${logItem.file.name}"`);
          }
        }
        setStagedLogs([]);
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

      // Refresh recent sessions list
      try {
        const listRes = await fetch("/api/sessions");
        const listData = await listRes.json();
        if (listRes.ok && listData.success && Array.isArray(listData.data)) {
          setRecentSessions(
            listData.data.map((s: any) => ({
              ...s,
              pmDate: typeof s.pmDate === "string" ? s.pmDate : new Date(s.pmDate).toISOString(),
              createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date(s.createdAt).toISOString(),
            }))
          );
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

  // Handle deleting a past PM session
  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;

    setIsDeletingSession(true);
    setDeleteSessionError(null);

    try {
      const res = await fetch(`/api/sessions/${sessionToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete PM session");
      }

      const deletedCustomer = sessionToDelete.customer;
      const deletedId = sessionToDelete.id;

      // Immediately remove from recent sessions in UI
      setRecentSessions((prev) => prev.filter((s) => s.id !== deletedId));

      // If the currently loaded session was deleted, reset workspace
      if (sessionId === deletedId) {
        startNewSession();
      }

      setSessionToDelete(null);
      setDeleteSuccessMessage(`PM session for "${deletedCustomer}" was deleted successfully.`);
      setTimeout(() => setDeleteSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setDeleteSessionError(
        err instanceof Error ? err.message : "Failed to delete PM session"
      );
    } finally {
      setIsDeletingSession(false);
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
              {supportedVendors.find((item) => item.id === vendor)?.displayName || "Loading vendor adapters"} Guide
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Follow the selected vendor guide, collect PuTTY logs, and review evidence. Word export is available only for verified CTC layouts.
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
            onChange={(e) => handleVendorChange(e.target.value)}
            disabled={supportedVendors.length === 0 || Boolean(sessionId)}
            className="rounded-lg border border-slate-700 bg-[#070b14] px-3 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-blue-500"
          >
            {supportedVendors.map((item) => (
              <option key={item.id} value={item.id}>{item.displayName}</option>
            ))}
          </select>
        </div>
        {vendorLoadError && <p className="text-xs text-rose-300">{vendorLoadError}</p>}
      </div>

      {/* CLI Command Reference Section (Phase 2) */}
      <CliCommandSection vendor={vendor} />

      {/* Attached Evidence Files (if session already has files in SQLite - Phase 8) */}
      {recoveryData?.files && (recoveryData.files.docxReport || recoveryData.files.puttyLogs.length > 0) && (
        <AttachedFilesCard
          files={recoveryData.files}
          onUploadAdditional={vendor === "fortigate" ? () => docxInputRef.current?.click() : undefined}
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
              Supports PuTTY terminal logs (`.txt`, `.log`){vendor === "fortigate" ? " and the verified CTC Word template (.docx)" : ""}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input
                ref={docxInputRef}
                type="file"
                accept=".docx"
                onChange={handleDocxChange}
                disabled={vendor !== "fortigate"}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => docxInputRef.current?.click()}
                disabled={vendor !== "fortigate"}
                className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700"
              >
                <FileText className="h-4 w-4 text-blue-400" />
                <span>{vendor === "fortigate" ? "Select Word Report (.docx)" : "Word export unavailable"}</span>
              </Button>

              <input
                ref={logInputRef}
                type="file"
                accept=".txt,.log"
                multiple
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
                <span>Select PuTTY Log(s) (.txt)</span>
              </Button>
            </div>
          </div>

          {/* Staged Files Preview */}
          {(stagedDocx || stagedLogs.length > 0) && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-300">
                  Staged Files for Processing ({Boolean(stagedDocx) ? 1 : 0} Word doc, {stagedLogs.length} PuTTY log{stagedLogs.length !== 1 ? "s" : ""}):
                </h4>
                {stagedLogs.length > 1 && (
                  <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 bg-indigo-950/40 text-[10px]">
                    HA Multi-Log Workflow
                  </Badge>
                )}
              </div>
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
                      title="Remove Word report"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {stagedLogs.map((logItem) => (
                  <div
                    key={logItem.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0c1222]"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-white truncate">{logItem.file.name}</p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                              logItem.roleHint === "Primary"
                                ? "bg-blue-950/80 text-blue-300 border border-blue-500/40"
                                : logItem.roleHint === "Secondary"
                                ? "bg-purple-950/80 text-purple-300 border border-purple-500/40"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {logItem.roleHint}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{formatBytes(logItem.file.size)} · PuTTY Session Log</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        value={logItem.roleHint}
                        onChange={(e) =>
                          updateStagedLogRole(
                            logItem.id,
                            e.target.value as "Primary" | "Secondary" | "Standalone" | "Auto"
                          )
                        }
                        className="text-[10px] bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
                        title="Set firewall role hint"
                      >
                        <option value="Primary">Primary</option>
                        <option value="Secondary">Secondary</option>
                        <option value="Standalone">Standalone</option>
                        <option value="Auto">Auto</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeStagedLog(logItem.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="Remove staged log"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
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
              {vendor !== "fortigate" && (
                <p className="mt-3 text-center text-xs text-amber-200">
                  Continue with CLI and GUI evidence. No approved CTC Word report layout is verified for this vendor.
                </p>
              )}
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
                    {supportedVendors.find((item) => item.id === vendor)?.displayName || vendor}{vendor === "fortigate" ? " (QMS-P09-F01 v1.1)" : " guide"}
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
        key={vendor}
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
                <h3 className="text-base font-semibold text-white">{vendor === "fortigate" ? "Automated PM Report Generation" : "PM Evidence Processing"}</h3>
                {vendor === "fortigate" ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-950/40 text-[10px] font-mono">QMS-P09-F01 v1.1</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-200 bg-amber-950/30 text-[10px]">CLI-only guide workflow</Badge>
                )}
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Processes the selected vendor checklist, segments PuTTY commands, evaluates supported findings,
                and renders terminal evidence. Unverified items remain in engineer review.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Button
                size="lg"
                onClick={handleGenerateReport}
                disabled={isProcessing || (!stagedDocx && stagedLogs.length === 0 && !sessionId)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 h-11 transition-colors cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>Processing PM Session...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                    <span>{vendor === "fortigate" ? "Generate PM Report" : "Process PM Session"}</span>
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
            {deleteSuccessMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{deleteSuccessMessage}</span>
              </div>
            )}

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

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <Button
                        size="sm"
                        onClick={() => {
                          loadSession(session.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 cursor-pointer"
                      >
                        <span>Resume on Generator</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>

                      <Link href={`/sessions/${session.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs h-8 cursor-pointer"
                          title="Open multi-tab session overview workspace"
                        >
                          <span>Workspace</span>
                        </Button>
                      </Link>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDeleteSessionError(null);
                          setSessionToDelete(session);
                        }}
                        className="gap-1.5 border-rose-900/40 bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 hover:text-rose-200 text-xs h-8 cursor-pointer"
                        title="Delete this past PM session"
                        aria-label={`Delete PM session for ${session.customer}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {sessionToDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-pm-title"
          >
            <div
              className="relative flex flex-col w-full max-w-lg rounded-2xl border border-slate-800 bg-[#070b14] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 id="delete-pm-title" className="text-sm font-semibold text-white">
                      Delete Past PM Report
                    </h3>
                    <p className="text-xs text-slate-400">
                      Permanent deletion of past maintenance records
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => !isDeletingSession && setSessionToDelete(null)}
                  disabled={isDeletingSession}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-200">
                  Are you sure you want to delete the PM report record for{" "}
                  <span className="font-semibold text-white">{sessionToDelete.customer}</span>?
                </p>

                {/* Session Meta Summary Box */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Customer</span>
                    <span className="font-medium text-slate-200">{sessionToDelete.customer}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">PM Date</span>
                    <span className="font-medium text-slate-200">{formatDate(sessionToDelete.pmDate)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Status</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {sessionToDelete.status}
                    </Badge>
                  </div>
                  {sessionToDelete.devices.length > 0 && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Target Devices</span>
                      <span className="font-mono text-slate-300">
                        {sessionToDelete.devices.map((d) => d.hostname).join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Retained Items</span>
                    <span className="text-slate-300">
                      {sessionToDelete._count.uploadedFiles} uploaded file(s) ·{" "}
                      {sessionToDelete._count.generatedReports} generated report(s)
                    </span>
                  </div>
                </div>

                {/* Warning Alert */}
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <p>
                    This action is permanent and cannot be undone. All PuTTY session logs,
                    evaluated PM checklist findings, evidence screenshots, and exported Word reports
                    for this session will be permanently deleted.
                  </p>
                </div>

                {/* Error Banner */}
                {deleteSessionError && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{deleteSessionError}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-950/60 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSessionToDelete(null)}
                  disabled={isDeletingSession}
                  className="border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteSession}
                  disabled={isDeletingSession}
                  className="gap-1.5 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                >
                  {isDeletingSession ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete PM Session</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
