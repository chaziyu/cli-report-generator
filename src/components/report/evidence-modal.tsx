"use client";

import { useState, useEffect } from "react";
import {
  X,
  ExternalLink,
  ShieldAlert,
  FileText,
  CheckCircle2,
  Terminal,
  FileImage,
  AlertTriangle,
  RotateCcw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Server,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewEvidenceSummary } from "@/core/review";

export interface EvidenceModalProps {
  evidence?: ReviewEvidenceSummary | null;
  evidenceList?: ReviewEvidenceSummary[];
  taskName: string;
  checkId?: string;
  sessionId?: string;
  devices?: Array<{ id: string; hostname: string; role?: string | null }>;
  availableTasks?: Array<{ id: string; taskName: string; targetAppendix?: string | null }>;
  initialIndex?: number;
  onClose: () => void;
  onEvidenceUpdated?: () => void;
}

const DEFAULT_PM_TASKS = [
  { id: "fg-mgmt-gui", taskName: "Accessibility of FortiGate via GUI", targetAppendix: "Appendix 9 - Web GUI Access" },
  { id: "fg-sys-backup", taskName: "Backup Configurations", targetAppendix: "Appendix 16 - Backup Configuration" },
  { id: "fg-hw-disk", taskName: "Hard disk space (If any)", targetAppendix: "Appendix 1 - Hard Disk Space" },
  { id: "fg-hw-cpu", taskName: "CPU Usage", targetAppendix: "Appendix 1 - CPU Usage" },
  { id: "fg-hw-mem", taskName: "Memory Usage", targetAppendix: "Appendix 2 - Memory Usage" },
  { id: "fg-hw-interface", taskName: "Interface Monitoring", targetAppendix: "Appendix 3 - Interface" },
  { id: "fg-lic-forticare", taskName: "FortiCare Support Contract", targetAppendix: "Appendix 4 - License Info" },
  { id: "fg-lic-utm", taskName: "UTM Contract", targetAppendix: "Appendix 4 - License Info" },
  { id: "fg-fw-version", taskName: "Firmware Version", targetAppendix: "Appendix 5 - Firmware Version" },
  { id: "fg-vpn-tunnel", taskName: "VPN Status", targetAppendix: "Appendix 6 - VPN Tunnels" },
  { id: "fg-net-routing", taskName: "Routing Table & Reachability", targetAppendix: "Appendix 7 - Routing Table" },
  { id: "fg-sys-uptime", taskName: "Firewall System Uptime", targetAppendix: "Appendix 8 - Firewall System Uptime" },
  { id: "fg-sec-signatures", taskName: "FortiGuard Signatures", targetAppendix: "Appendix 11 - Signatures" },
  { id: "fg-sys-ntp", taskName: "Date and Time Synchronization (NTP)", targetAppendix: "Appendix 12 - NTP Status" },
  { id: "fg-sys-ha", taskName: "High Availability (HA) Status", targetAppendix: "Appendix 13 - HA Status" },
  { id: "fg-sys-log", taskName: "Event Log Monitoring", targetAppendix: "Appendix 14 - Event Log" },
  { id: "fg-sys-faz", taskName: "FortiAnalyzer / Log Manager", targetAppendix: "Appendix 15 - Log Manager Setting" },
];

export function EvidenceModal({
  evidence,
  evidenceList,
  taskName,
  checkId,
  sessionId,
  devices = [],
  availableTasks = DEFAULT_PM_TASKS,
  initialIndex = 0,
  onClose,
  onEvidenceUpdated,
}: EvidenceModalProps) {
  // Aggregate items from evidenceList or single evidence fallback
  const items: ReviewEvidenceSummary[] = evidenceList && evidenceList.length > 0
    ? evidenceList
    : evidence ? [evidence] : [];

  const [currentIndex, setCurrentIndex] = useState(
    initialIndex >= 0 && initialIndex < items.length ? initialIndex : 0
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);

  // Mapping state for active GUI item
  const activeItem: ReviewEvidenceSummary | undefined = items[currentIndex];
  const isCli = activeItem?.sourceType === "CLI";

  const [selectedTask, setSelectedTask] = useState<string>(
    activeItem?.checkId || checkId || ""
  );
  const [selectedDevice, setSelectedDevice] = useState<string>(
    activeItem?.deviceId || (devices[0]?.id || "")
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Scoped keyboard shortcuts: Escape closes modal, Arrow keys navigate gallery (Adjustment 4)
  // Strictly preserve native Ctrl+C / Cmd+C text selection copying.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing inside an input, textarea, or select
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT");

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (!isInput && items.length > 1) {
        if (e.key === "ArrowLeft" && currentIndex > 0) {
          e.preventDefault();
          const nextIdx = currentIndex - 1;
          const nextItem = items[nextIdx];
          if (nextItem) {
            setSelectedTask(nextItem.checkId || checkId || "");
            setSelectedDevice(nextItem.deviceId || (devices[0]?.id || ""));
          }
          setCurrentIndex(nextIdx);
          setImageLoaded(false);
          setImageError(false);
          setShowRawOutput(false);
          setActionMessage(null);
        } else if (e.key === "ArrowRight" && currentIndex < items.length - 1) {
          e.preventDefault();
          const nextIdx = currentIndex + 1;
          const nextItem = items[nextIdx];
          if (nextItem) {
            setSelectedTask(nextItem.checkId || checkId || "");
            setSelectedDevice(nextItem.deviceId || (devices[0]?.id || ""));
          }
          setCurrentIndex(nextIdx);
          setImageLoaded(false);
          setImageError(false);
          setShowRawOutput(false);
          setActionMessage(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, items, checkId, devices, onClose]);

  if (!activeItem) return null;

  const handleCopyRaw = () => {
    if (activeItem.rawOutputSnippet) {
      navigator.clipboard.writeText(activeItem.rawOutputSnippet);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    }
  };

  const handleApplyMapping = async () => {
    if (!sessionId || isCli) return;
    setIsUpdating(true);
    setActionMessage(null);

    const taskDef = availableTasks.find((t) => t.id === selectedTask);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/evidence/${activeItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId: selectedTask || null,
          deviceId: selectedDevice || null,
          appendixMapping: taskDef?.targetAppendix || activeItem.appendixMapping,
          title: taskDef?.taskName || activeItem.title,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update evidence mapping");
      }

      setActionMessage({
        type: "success",
        text: "Evidence reassigned. Affected findings marked for re-review.",
      });

      if (onEvidenceUpdated) {
        onEvidenceUpdated();
      }
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error updating evidence mapping",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleExclusion = async (targetExclude: boolean) => {
    if (!sessionId || isCli) return;
    setIsUpdating(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/evidence/${activeItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetExclude ? "EXCLUDE" : "RESTORE",
          isExcluded: targetExclude,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update exclusion status");
      }

      setActionMessage({
        type: "success",
        text: targetExclude
          ? "Evidence excluded from report. Affected findings marked for re-review."
          : "Evidence restored to report. Affected findings marked for re-review.",
      });

      if (onEvidenceUpdated) {
        onEvidenceUpdated();
      }
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error updating exclusion status",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative flex flex-col max-h-[92vh] w-full max-w-5xl rounded-2xl border border-slate-700 bg-[#070b14] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Multi-Evidence Gallery Tab Bar */}
        {items.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto bg-[#040711] px-4 py-2 border-b border-slate-800 scrollbar-none">
            <span className="text-[11px] font-semibold text-slate-400 mr-2 shrink-0">
              Evidence Assets ({items.length}):
            </span>
            {items.map((it, idx) => {
              const isSelected = idx === currentIndex;
              const isItemCli = it.sourceType === "CLI";
              return (
                <button
                  key={it.id}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setImageLoaded(false);
                    setImageError(false);
                    setShowRawOutput(false);
                    setActionMessage(null);
                    setSelectedTask(it.checkId || checkId || "");
                    setSelectedDevice(it.deviceId || (devices[0]?.id || ""));
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all shrink-0 ${
                    isSelected
                      ? isItemCli
                        ? "bg-blue-600/30 border border-blue-500 text-blue-200"
                        : "bg-purple-600/30 border border-purple-500 text-purple-200"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {isItemCli ? (
                    <Terminal className="h-3.5 w-3.5 text-blue-400" />
                  ) : (
                    <FileImage className="h-3.5 w-3.5 text-purple-400" />
                  )}
                  <span>
                    {isItemCli
                      ? `CLI Page ${it.pageNumber}/${it.totalPages}`
                      : it.originalFilename || `GUI #${idx + 1}`}
                  </span>
                  {it.isExcluded && (
                    <span className="ml-1 rounded bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[9px] px-1 py-0.2">
                      Excluded
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800 bg-[#090e1a] px-6 py-4 gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isCli ? (
                <Badge className="bg-blue-950/80 text-blue-300 border-blue-500/40 text-xs flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Authentic CLI Terminal Evidence
                </Badge>
              ) : (
                <Badge className="bg-purple-950/80 text-purple-300 border-purple-500/40 text-xs flex items-center gap-1.5">
                  <FileImage className="h-3.5 w-3.5" />
                  Uploaded GUI Screenshot
                </Badge>
              )}

              {activeItem.appendixMapping && (
                <Badge variant="outline" className="text-xs font-mono text-slate-300 border-slate-700 bg-slate-800/60">
                  {activeItem.appendixMapping}
                </Badge>
              )}

              {activeItem.isRedacted && (
                <Badge variant="warning" className="text-xs flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Sanitized (Secrets Redacted)
                </Badge>
              )}

              {activeItem.isExcluded && (
                <Badge variant="destructive" className="text-xs flex items-center gap-1 bg-rose-950/80 text-rose-300 border-rose-500/40">
                  <EyeOff className="h-3 w-3" />
                  Excluded from Word Report
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>
                Task: <strong className="text-slate-200">{taskName}</strong>
              </span>
              <span>
                Device: <strong className="text-slate-200">{activeItem.deviceHostname || "FortiGate"}</strong>
              </span>
              {isCli && activeItem.totalPages > 1 && (
                <span className="font-mono text-slate-400">
                  (Page {activeItem.pageNumber} of {activeItem.totalPages})
                </span>
              )}
              {!isCli && activeItem.originalFilename && (
                <span className="font-mono text-slate-300 truncate max-w-xs" title={activeItem.originalFilename}>
                  File: {activeItem.originalFilename}
                </span>
              )}
              {!isCli && activeItem.hashSha256 && (
                <span className="font-mono text-[11px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800" title={`SHA-256: ${activeItem.hashSha256}`}>
                  SHA-256: {activeItem.hashSha256.slice(0, 10)}...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isCli && activeItem.rawOutputSnippet && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRawOutput(!showRawOutput)}
                className="h-8 text-xs text-blue-300 border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/40 gap-1.5"
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>{showRawOutput ? "Show PNG" : "View CLI Output"}</span>
              </Button>
            )}

            <a
              href={activeItem.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open Raw Image</span>
            </a>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Banner Alert for Action Messages */}
        {actionMessage && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
              actionMessage.type === "success"
                ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/30"
                : "bg-rose-950/80 text-rose-300 border-rose-500/30"
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Display Area: Either Terminal PNG / GUI Screenshot or Raw CLI Text */}
        <div className="relative flex-1 overflow-auto bg-[#03060f] p-6 flex flex-col items-center justify-center min-h-[380px]">
          {showRawOutput && activeItem.rawOutputSnippet ? (
            <div className="w-full h-full max-h-[500px] flex flex-col rounded-lg border border-slate-800 bg-[#050811] shadow-xl overflow-hidden">
              <div className="flex items-center justify-between bg-slate-900/90 px-4 py-2 border-b border-slate-800 text-xs text-slate-300">
                <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  &gt; {activeItem.command || "Source PuTTY Command Output"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyRaw}
                  className="h-6 text-[11px] gap-1 text-slate-300 hover:text-white"
                >
                  {copiedRaw ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Raw Output</span>
                    </>
                  )}
                </Button>
              </div>
              <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre select-text">
                {activeItem.rawOutputSnippet}
              </pre>
            </div>
          ) : (
            <>
              {!imageLoaded && !imageError && (
                <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <span className="text-xs">Loading authentic evidence preview...</span>
                </div>
              )}

              {imageError && (
                <div className="flex flex-col items-center justify-center gap-2 text-rose-400 p-8 text-center py-16">
                  <FileText className="h-10 w-10 text-rose-500" />
                  <p className="text-sm font-semibold">Evidence Image Unavailable</p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    The evidence image could not be loaded from storage. Check if processing completed successfully.
                  </p>
                </div>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeItem.imageUrl}
                alt={activeItem.caption || activeItem.title}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`max-w-full rounded-lg border border-slate-800 shadow-2xl transition-opacity duration-300 max-h-[520px] object-contain ${
                  imageLoaded ? "opacity-100" : "opacity-0 absolute"
                }`}
              />
            </>
          )}
        </div>

        {/* Modal Footer & Mapping Controls */}
        <div className="border-t border-slate-800 bg-[#090e1a] px-6 py-3.5 space-y-3">
          {isCli ? (
            // CLI Deterministic Provenance Notice (Issue 2)
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Deterministic PuTTY CLI Evidence:</strong> Reassigned via PuTTY log parsing and verified command execution. Associations are immutable.
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                Close
              </Button>
            </div>
          ) : (
            // GUI Screenshot Mapping & Exclusion Controls (Issue 1, 2, 3)
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-purple-400" />
                  GUI Screenshot Mapping &amp; Report Inclusion Controls
                </span>

                <div className="flex items-center gap-2">
                  {activeItem.isExcluded ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleExclusion(false)}
                      disabled={isUpdating}
                      className="h-7 text-xs text-emerald-300 border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restore to Report</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleExclusion(true)}
                      disabled={isUpdating}
                      className="h-7 text-xs text-rose-300 border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/50 gap-1.5"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      <span>Exclude from Report</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
                    Close
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-[#050811] p-3 rounded-lg border border-slate-800 text-xs">
                {/* Target Task Selector */}
                <div className="sm:col-span-5 space-y-1">
                  <label className="text-[11px] font-medium text-slate-400 block">
                    Target PM Task:
                  </label>
                  <select
                    value={selectedTask}
                    onChange={(e) => setSelectedTask(e.target.value)}
                    disabled={isUpdating}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">-- Unassigned --</option>
                    {availableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.targetAppendix ? `${t.targetAppendix}: ` : ""}{t.taskName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Device Selector */}
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-medium text-slate-400 block">
                    Firewall Device:
                  </label>
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    disabled={isUpdating}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.hostname} ({d.role || "Standalone"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Apply Button */}
                <div className="sm:col-span-3 flex items-end pt-5">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApplyMapping}
                    disabled={
                      isUpdating ||
                      (selectedTask === (activeItem.checkId || "") &&
                        selectedDevice === (activeItem.deviceId || ""))
                    }
                    className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-500 text-white gap-1.5"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Apply Mapping</span>
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                * Note: Reassigning task, device, or exclusion invalidates affected checklist approvals and triggers mandatory engineer re-review.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
