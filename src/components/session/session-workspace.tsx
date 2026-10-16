"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Server,
  FileText,
  Upload,
  Shield,
  CheckCircle2,
  FileCheck,
  Plus,
  HardDrive,
  Copy,
  Check,
  AlertCircle,
  Terminal,
  ListChecks,
  FileImage,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate, formatBytes } from "@/lib/utils";
import { ChecklistWorkspace } from "@/components/checklist";
import { LogImporterWorkspace } from "@/components/log-importer";
import { EvidenceWorkspace } from "@/components/evidence";

interface Device {
  id: string;
  hostname: string;
  model: string | null;
  serialNumber: string | null;
  role: string | null;
  haStatus: string | null;
  createdAt: string | Date;
}

interface UploadedFile {
  id: string;
  type: string;
  originalFilename: string;
  storedFilename: string;
  storagePath: string;
  hashSha256: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string | Date;
}

export interface GeneratedReportSummary {
  id: string;
  sessionId: string;
  originalReportId: string | null;
  fileReference: string;
  version: number;
  generationStatus: string;
  summary: string | null;
  createdAt: string | Date;
}

export interface SessionDetail {
  id: string;
  customer: string;
  vendor: string;
  engineerName: string | null;
  pmDate: string | Date;
  status: string;
  notes: string | null;
  createdAt: string | Date;
  devices: Device[];
  uploadedFiles: UploadedFile[];
  generatedReports?: GeneratedReportSummary[];
}

export function SessionWorkspace({
  session: initialSession,
}: {
  session: SessionDetail;
}) {
  const [session, setSession] = useState<SessionDetail>(initialSession);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // New Device Form state
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newHostname, setNewHostname] = useState("");
  const [newModel, setNewModel] = useState("FortiGate 200F");
  const [newSerial, setNewSerial] = useState("");
  const [newRole, setNewRole] = useState("Secondary");
  const [addingDevice, setAddingDevice] = useState(false);

  // Copy hash state
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Active view: "overview" (Phase 1), "checklist" (Phase 2), "logs" (Phase 3), or "evidence" (Phase 6)
  const [activeView, setActiveView] = useState<"overview" | "checklist" | "logs" | "evidence">("overview");

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const refreshSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${session.id}`);
      const data = await res.json();
      if (data.success) {
        setSession(data.data);
      }
    } catch (err) {
      console.error("Failed to refresh session", err);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fileType: "PUTTY_LOG" | "WORD_REPORT" | "GUI_SCREENSHOT"
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("type", fileType);

      const res = await fetch(`/api/sessions/${session.id}/files`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to upload file");
      }

      setUploadSuccess(
        `Successfully uploaded and securely hashed "${files[0].name}" (SHA-256 computed).`
      );
      await refreshSession();
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error ? err.message : "Error uploading file"
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHostname.trim()) return;

    try {
      setAddingDevice(true);
      const res = await fetch(`/api/sessions/${session.id}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: newHostname.trim(),
          model: newModel.trim() || undefined,
          serialNumber: newSerial.trim() || undefined,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add device");
      }

      setShowAddDevice(false);
      setNewHostname("");
      setNewSerial("");
      await refreshSession();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error adding device");
    } finally {
      setAddingDevice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Workflow Navigation Banner */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveView("overview")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
            activeView === "overview"
              ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850"
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          <span>1. Foundation & Scope</span>
        </button>
        <span className="text-slate-600">→</span>
        <button
          type="button"
          onClick={() => setActiveView("checklist")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
            activeView === "checklist"
              ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
              : "bg-slate-900 border border-slate-800 text-blue-400 hover:text-blue-300 hover:bg-slate-850"
          }`}
        >
          <ListChecks className="h-3.5 w-3.5 text-blue-400" />
          <span>2. FortiGate CLI Checklist</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30">
            Phase 2
          </span>
        </button>
        <span className="text-slate-600">→</span>
        <button
          type="button"
          onClick={() => setActiveView("logs")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
            activeView === "logs"
              ? "bg-purple-600 text-white shadow-md shadow-purple-900/30"
              : "bg-slate-900 border border-slate-800 text-purple-400 hover:text-purple-300 hover:bg-slate-850"
          }`}
        >
          <Terminal className="h-3.5 w-3.5 text-purple-400" />
          <span>3. PuTTY Log Parser</span>
          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded border border-purple-500/30">
            Phase 3
          </span>
        </button>
        <span className="text-slate-600">→</span>
        <button
          type="button"
          onClick={() => setActiveView("evidence")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
            activeView === "evidence"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
              : "bg-slate-900 border border-slate-800 text-emerald-400 hover:text-emerald-300 hover:bg-slate-850"
          }`}
        >
          <FileImage className="h-3.5 w-3.5 text-emerald-400" />
          <span>4. Terminal Evidence</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
            Phase 6
          </span>
        </button>
        <Link
          href={`/sessions/${session.id}/review`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/30 border border-blue-500/40 text-blue-300 hover:text-white hover:bg-blue-800/40 transition-colors shadow-sm"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
          <span>5. Review &amp; Approvals</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30">
            Phase 8
          </span>
        </Link>
        <span className="text-slate-600">→</span>
        <Link
          href={`/sessions/${session.id}/review`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 hover:text-white hover:bg-emerald-800/40 transition-colors shadow-sm"
        >
          <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>6. Word Exporter</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
            Phase 9 Active
          </span>
        </Link>
      </div>

      {uploadSuccess && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Render Active View */}
      {activeView === "checklist" ? (
        <ChecklistWorkspace
          sessionId={session.id}
          devices={session.devices}
          customerName={session.customer}
          vendorName={session.vendor}
          onEvaluationComplete={refreshSession}
        />
      ) : activeView === "logs" ? (
        <LogImporterWorkspace
          sessionId={session.id}
          uploadedFiles={session.uploadedFiles}
          devices={session.devices}
          onLogParsed={refreshSession}
        />
      ) : activeView === "evidence" ? (
        <EvidenceWorkspace
          sessionId={session.id}
          devices={session.devices}
          customerName={session.customer}
          vendorName={session.vendor}
        />
      ) : (
        /* Main 2-column Grid (Overview & Ingestion) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 spans): Target Firewalls & File Storage */}
          <div className="lg:col-span-2 space-y-6">
          {/* Target Firewalls List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4 text-emerald-400" />
                  Target Firewalls ({session.devices.length})
                </CardTitle>
                <CardDescription>
                  Multi-device support: each firewall has distinct command executions and checklist evaluation states.
                </CardDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDevice(!showAddDevice)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{showAddDevice ? "Close" : "Add Device"}</span>
              </Button>
            </CardHeader>

            <CardContent className="space-y-3">
              {showAddDevice && (
                <form
                  onSubmit={handleAddDevice}
                  className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 mb-4 space-y-3"
                >
                  <h4 className="text-xs font-semibold text-blue-300">
                    Add Firewall Device to Session
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Hostname (e.g. FG-SLV01)"
                      value={newHostname}
                      onChange={(e) => setNewHostname(e.target.value)}
                      className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Model (e.g. FortiGate 200F)"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Serial Number"
                      value={newSerial}
                      onChange={(e) => setNewSerial(e.target.value)}
                      className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Primary">Primary</option>
                      <option value="Secondary">Secondary</option>
                      <option value="Standalone">Standalone</option>
                      <option value="DR">DR Site</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddDevice(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={addingDevice}
                      className="bg-blue-600 hover:bg-blue-500"
                    >
                      {addingDevice ? "Adding..." : "Save Device"}
                    </Button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950/40">
                {session.devices.map((device, idx) => (
                  <div
                    key={device.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 hover:bg-slate-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-200 font-mono">
                            {device.hostname}
                          </span>
                          {device.role && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {device.role}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                          <span>Model: {device.model || "Unknown"}</span>
                          {device.serialNumber && (
                            <span>• S/N: {device.serialNumber}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveView("checklist")}
                        className="rounded bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-blue-400 border border-slate-800 hover:border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Terminal className="h-3 w-3" />
                        <span>CLI Checklist (21 Items)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Local File Storage & Preservation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-purple-400" />
                Local File Ingestion & Cryptographic Preservation
              </CardTitle>
              <CardDescription>
                Uploaded files are saved to the local disk and immutable SHA-256 hashes are recorded for verification.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Upload Dropzones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Upload PuTTY log */}
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center hover:border-blue-500/50 transition-colors">
                  <FileText className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">
                    PuTTY Session Log (.txt)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 mb-3">
                    Authentic command logs captured with PuTTY logging
                  </p>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/20 transition-colors">
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? "Ingesting..." : "Select PuTTY Log"}
                    </span>
                    <input
                      type="file"
                      accept=".txt,.log"
                      disabled={uploading}
                      onChange={(e) => handleFileUpload(e, "PUTTY_LOG")}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Upload CTC Word Report */}
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center hover:border-purple-500/50 transition-colors">
                  <FileCheck className="mx-auto h-8 w-8 text-purple-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">
                    CTC Word Report (.docx)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 mb-3">
                    Existing QMS-P09-F01 v1.1 Word template or previous report
                  </p>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600/10 border border-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/20 transition-colors">
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? "Ingesting..." : "Select Word Report"}
                    </span>
                    <input
                      type="file"
                      accept=".docx"
                      disabled={uploading}
                      onChange={(e) => handleFileUpload(e, "WORD_REPORT")}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Uploaded Files Table */}
              <div className="pt-2">
                <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                  <span>Preserved Files ({session.uploadedFiles.length})</span>
                  <span className="text-[10px] text-slate-500">
                    Storage: local filesystem
                  </span>
                </h4>

                {session.uploadedFiles.length === 0 ? (
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-4 text-center text-xs text-slate-500">
                    No files uploaded yet. Upload a PuTTY session log and an existing Word report to begin.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/80 text-slate-400 font-medium border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5">Original File</th>
                          <th className="p-2.5">Size</th>
                          <th className="p-2.5">SHA-256 Checksum</th>
                          <th className="p-2.5">Uploaded</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-slate-300">
                        {session.uploadedFiles.map((file) => (
                          <tr key={file.id} className="hover:bg-slate-900/30">
                            <td className="p-2.5">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    file.type === "PUTTY_LOG"
                                      ? "default"
                                      : file.type === "WORD_REPORT"
                                      ? "success"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {file.type.replace("_", " ")}
                                </Badge>
                                {file.type === "PUTTY_LOG" && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveView("logs")}
                                    className="text-[10px] text-purple-400 hover:text-purple-300 underline font-medium"
                                  >
                                    Parse Log →
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="p-2.5 font-medium text-slate-200">
                              {file.originalFilename}
                            </td>
                            <td className="p-2.5 text-slate-400 font-mono">
                              {formatBytes(file.sizeBytes)}
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                                <span className="truncate max-w-[140px] sm:max-w-[200px]" title={file.hashSha256}>
                                  {file.hashSha256}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyHash(file.hashSha256)}
                                  className="text-slate-500 hover:text-slate-300"
                                  title="Copy SHA-256"
                                >
                                  {copiedHash === file.hashSha256 ? (
                                    <Check className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="p-2.5 text-slate-500 whitespace-nowrap">
                              {formatDate(file.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Generated Word Reports (Phase 9) */}
          <Card className="border-emerald-500/30 bg-emerald-950/5">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-emerald-400" />
                  Generated Word Reports ({session.generatedReports?.length || 0})
                </CardTitle>
                <CardDescription>
                  Production-ready DOCX reports with updated checklist findings, CTC blue typography, and embedded CLI evidence images.
                </CardDescription>
              </div>

              <Link
                href={`/sessions/${session.id}/review`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span>Review &amp; Export</span>
              </Link>
            </CardHeader>

            <CardContent>
              {(!session.generatedReports || session.generatedReports.length === 0) ? (
                <div className="rounded-lg border border-dashed border-slate-800/80 bg-slate-950/30 p-6 text-center text-xs text-slate-500 space-y-2">
                  <p className="text-slate-400 font-medium">No Word reports exported yet for this session.</p>
                  <p className="text-[11px] text-slate-500">
                    Approve checklist findings in the Review workspace, then click &quot;Export Word Report (Phase 9)&quot; to generate an updated .docx package.
                  </p>
                  <Link
                    href={`/sessions/${session.id}/review`}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-semibold pt-1"
                  >
                    Go to Engineer Review →
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 font-medium border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Version</th>
                        <th className="p-2.5">Filename</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Generated</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-slate-300">
                      {session.generatedReports.map((report) => {
                        const filename = report.fileReference.split("/").pop() || report.fileReference;
                        return (
                          <tr key={report.id} className="hover:bg-slate-900/30">
                            <td className="p-2.5">
                              <Badge variant="outline" className="font-mono text-emerald-300 border-emerald-500/40 bg-emerald-950/30">
                                v{report.version}
                              </Badge>
                            </td>
                            <td className="p-2.5 font-medium text-slate-200">
                              <div className="flex flex-col">
                                <span className="font-mono text-[11px] text-slate-200">{filename}</span>
                                {report.summary && (
                                  <span className="text-[10px] text-slate-500 truncate max-w-sm">
                                    {report.summary}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2.5">
                              <Badge
                                variant={report.generationStatus === "SUCCESS" ? "success" : "secondary"}
                                className="text-[10px]"
                              >
                                {report.generationStatus}
                              </Badge>
                            </td>
                            <td className="p-2.5 text-slate-500 whitespace-nowrap">
                              {formatDate(report.createdAt)}
                            </td>
                            <td className="p-2.5 text-right">
                              <a
                                href={`/api/sessions/${session.id}/export/${report.id}`}
                                download
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors"
                              >
                                <Download className="h-3 w-3" />
                                <span>Download</span>
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 span): Session Metadata & Phase Status */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-400" />
                Session Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500">Customer</span>
                <p className="font-semibold text-slate-200 text-sm">
                  {session.customer}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Firewall Vendor</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize text-slate-200">
                    {session.vendor}
                  </Badge>
                  <span className="text-slate-500">FortiOS 6.4-7.6+</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Lead Engineer</span>
                <p className="text-slate-200 font-medium">
                  {session.engineerName || "Unassigned"}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">PM Scheduled Date</span>
                <p className="text-slate-200 font-medium">
                  {formatDate(session.pmDate)}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Current Status</span>
                <div>
                  <Badge variant="secondary">{session.status}</Badge>
                </div>
              </div>

              {session.notes && (
                <div className="space-y-1 pt-2 border-t border-slate-800">
                  <span className="text-slate-500">Scope Notes</span>
                  <p className="text-slate-400 leading-relaxed">
                    {session.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Phases Verification Card */}
          <Card className="border-blue-500/20 bg-blue-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-blue-300 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Phases 1-8 Active &amp; Verified
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>SQLite DB with Prisma ORM</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>21 FortiGate PM tasks defined</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                <span>PuTTY Log Normalizer &amp; Segmenter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                <span>Deterministic Rule Engine (Phase 5)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Sharp SVG CLI Evidence (Phase 6)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                <span>CTC Word DOCX Inspector (Phase 7)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span>Review &amp; Approval Hub (Phase 8 Active)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span>ReviewDecision SQLite Persistence</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Word Report Editor &amp; Exporter (Phase 9 Active)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>OOXML Target Preservation &amp; Validation</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
