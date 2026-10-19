"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Image as ImageIcon,
  Upload,
  Check,
  X,
  Trash2,
  Maximize2,
  AlertCircle,
  HelpCircle,
  Layers,
  Server,
  RefreshCw,
  FileImage,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import type { VendorCheckItemDefinition } from "@/vendors/types";

export interface GuiScreenshotItem {
  id: string; // UploadedFile id
  filename: string;
  sizeBytes: number;
  mimeType: string;
  hashSha256: string;
  storagePath: string;
  deviceId?: string | null;
  checkId?: string | null;
  appendixMapping?: string | null;
  title?: string;
  isExcluded?: boolean;
  previewUrl: string;
  createdAt: string | Date;
}

interface GuiScreenshotUploaderProps {
  sessionId: string | null;
  devices: Array<{
    id: string;
    hostname: string;
    role: string | null;
  }>;
  vendor?: string;
  onEnsureSession: () => Promise<string>;
}

// Available PM tasks for screenshot assignment (Issue 3 & 4)
const DEFAULT_GUI_TASKS = [
  {
    label: "Unassigned",
    value: "",
    appendix: "",
  },
  {
    label: "GUI Accessibility (Appendix 9)",
    value: "Appendix 9 - Web GUI Access",
    taskName: "Accessibility of FortiGate via GUI",
    checkId: "fg-mgmt-gui",
  },
  {
    label: "Backup Configuration (Appendix 16)",
    value: "Appendix 16 - Backup Configuration",
    taskName: "Backup Configurations",
    checkId: "fg-sys-backup",
  },
];

const OTHER_APPENDIX_OPTIONS = [
  { label: "Appendix 1 - Hard Disk Space", value: "Appendix 1: Hard Disk Space" },
  { label: "Appendix 1 - CPU Usage", value: "Appendix 1 - CPU Usage" },
  { label: "Appendix 2 - Memory Usage", value: "Appendix 2 - Memory Usage" },
  { label: "Appendix 3 - Interface Monitoring", value: "Appendix 3 - Interface" },
  { label: "Appendix 4 - License Info", value: "Appendix 4 - License Info" },
  { label: "Appendix 5 - Firmware Version", value: "Appendix 5 - Firmware Version" },
  { label: "Appendix 6 - VPN Tunnels", value: "Appendix 6 - VPN Tunnels" },
  { label: "Appendix 7 - Routing Table", value: "Appendix 7 - Routing Table" },
  { label: "Appendix 8 - System Uptime", value: "Appendix 8 - Firewall System Uptime" },
  { label: "Appendix 10 - CLI Management Access", value: "Appendix 10 - CLI Access (SSH)" },
  { label: "Appendix 11 - Signatures", value: "Appendix 11 - Signatures" },
  { label: "Appendix 12 - NTP Status", value: "Appendix 12 - NTP Status" },
  { label: "Appendix 13 - HA Status", value: "Appendix 13 - HA Status" },
  { label: "Appendix 14 - Event Log", value: "Appendix 14 - Event Log" },
  { label: "Appendix 15 - Log Manager Setting", value: "Appendix 15 - Log Manager Setting" },
];

export function GuiScreenshotUploader({
  sessionId,
  devices,
  vendor = "fortigate",
  onEnsureSession,
}: GuiScreenshotUploaderProps) {
  const [screenshots, setScreenshots] = useState<GuiScreenshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Focus / Active state for Ctrl+V sequential paste
  const [isPasteZoneActive, setIsPasteZoneActive] = useState(false);

  // Explicit task-first mapping state for upcoming uploads/pastes (Adjustment 3)
  const [selectedTaskPreset, setSelectedTaskPreset] = useState<string>("");
  const [selectedDevicePreset, setSelectedDevicePreset] = useState<string>(
    devices[0]?.id || ""
  );
  const [guideChecklist, setGuideChecklist] = useState<{
    vendor: string;
    items: VendorCheckItemDefinition[];
  } | null>(null);

  const guideTaskOptions = vendor === "fortigate"
    ? DEFAULT_GUI_TASKS.filter((task) => task.value !== "")
    : guideChecklist?.vendor === vendor
      ? guideChecklist.items
          .filter((item) => item.sourceType !== "CLI")
          .map((item) => ({
            label: `${item.taskName} (${item.sourceType === "EXTERNAL_REFERENCE" ? "External reference" : "GUI/manual"})`,
            value: item.id,
            taskName: item.taskName,
            checkId: item.id,
          }))
      : [];

  useEffect(() => {
    if (vendor === "fortigate") return;
    let mounted = true;
    fetch(`/api/vendors/${vendor}/checklist`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to load vendor checklist");
        if (mounted) setGuideChecklist({ vendor, items: data.data.items || [] });
      })
      .catch((err) => console.error("Failed to load vendor screenshot tasks:", err));
    return () => { mounted = false; };
  }, [vendor]);

  // Lightbox preview modal state
  const [previewImage, setPreviewImage] = useState<GuiScreenshotItem | null>(null);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteContainerRef = useRef<HTMLDivElement>(null);

  // Load existing GUI screenshots for session
  const loadExistingScreenshots = useCallback(async () => {
    if (!sessionId) {
      setScreenshots([]);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/sessions/${sessionId}/files`);
      const data = await res.json();
      if (res.ok && data.success) {
        const guiFiles = (data.data || []).filter(
          (f: any) => f.type === "GUI_SCREENSHOT" && f.evidence && !f.evidence.isExcluded
        );

        setScreenshots(
          guiFiles.map((f: any) => ({
            id: f.id,
            filename: f.originalFilename,
            sizeBytes: f.sizeBytes,
            mimeType: f.mimeType,
            hashSha256: f.hashSha256,
            storagePath: f.storagePath,
            deviceId: f.deviceId,
            checkId: f.evidence?.checkId || null,
            appendixMapping: f.evidence?.appendixMapping || "",
            title: f.evidence?.title || f.originalFilename,
            isExcluded: f.evidence?.isExcluded || false,
            previewUrl: f.evidence
              ? `/api/sessions/${sessionId}/evidence/${f.evidence.id}`
              : "",
            createdAt: f.createdAt,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load screenshots:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadExistingScreenshots();
  }, [loadExistingScreenshots]);

  // Upload an image File (from paste, drag-and-drop, or file select)
  const uploadImageFile = async (
    file: File,
    customAppendix?: string,
    customCheckId?: string,
    customDeviceId?: string
  ) => {
    try {
      setUploading(true);
      setError(null);
      setSuccessMsg(null);

      const selectedTask = guideTaskOptions.find((task) => task.value === selectedTaskPreset);
      const targetAppendix = vendor === "fortigate"
        ? customAppendix !== undefined ? customAppendix : selectedTaskPreset
        : "";
      const targetCheckId = customCheckId !== undefined
        ? customCheckId
        : (selectedTask?.checkId || "");
      const targetDeviceId = customDeviceId !== undefined
        ? customDeviceId
        : (selectedDevicePreset || (devices[0]?.id || ""));

      // Ensure session exists
      const targetSessionId = sessionId || (await onEnsureSession());

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "GUI_SCREENSHOT");
      if (targetAppendix) {
        formData.append("appendixMapping", targetAppendix);
      }
      if (targetCheckId) {
        formData.append("checkId", targetCheckId);
      }
      if (targetDeviceId) {
        formData.append("deviceId", targetDeviceId);
      } else if (devices.length > 0) {
        formData.append("deviceId", devices[0].id);
      }

      const res = await fetch(`/api/sessions/${targetSessionId}/files`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to upload screenshot");
      }

      const uploaded = data.data;
      const newItem: GuiScreenshotItem = {
        id: uploaded.id,
        filename: uploaded.originalFilename,
        sizeBytes: uploaded.sizeBytes,
        mimeType: uploaded.mimeType,
        hashSha256: uploaded.hashSha256,
        storagePath: uploaded.storagePath,
        deviceId: uploaded.deviceId,
        checkId: uploaded.evidence?.checkId || (targetCheckId || null),
        appendixMapping: vendor === "fortigate"
          ? uploaded.evidence?.appendixMapping || (targetAppendix || null)
          : null,
        title: uploaded.evidence?.title || uploaded.originalFilename,
        isExcluded: false,
        previewUrl: uploaded.evidence
          ? `/api/sessions/${targetSessionId}/evidence/${uploaded.evidence.id}`
          : URL.createObjectURL(file),
        createdAt: uploaded.createdAt,
      };

      setScreenshots((prev) => [newItem, ...prev]);
      setSuccessMsg(`Pasted and verified "${file.name}" (SHA-256 computed).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error uploading screenshot");
    } finally {
      setUploading(false);
    }
  };

  // Focused paste handler: captures Ctrl+V when paste zone is focused/active
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      // If user is currently focused on an input or textarea outside this zone, don't intercept
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
        !pasteContainerRef.current?.contains(activeEl)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      let foundImage = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          foundImage = true;
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const timestamp = new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace(/\..+/, "");
            const filename = `screenshot_${timestamp}.png`;
            const file = new File([blob], filename, { type: blob.type || "image/png" });
            await uploadImageFile(file);
          }
        }
      }

      if (!foundImage && isPasteZoneActive) {
        // Only notify if user explicitly interacted with paste zone and pasted non-image
        setError("No image data found on clipboard. Please copy a screenshot first.");
      }
    },
    [isPasteZoneActive, sessionId, devices, selectedTaskPreset, selectedDevicePreset, vendor, guideChecklist, onEnsureSession]
  );

  useEffect(() => {
    const container = pasteContainerRef.current;
    if (!container) return;

    const onGlobalPaste = (e: ClipboardEvent) => {
      if (isPasteZoneActive) {
        handlePaste(e);
      }
    };

    window.addEventListener("paste", onGlobalPaste);
    return () => {
      window.removeEventListener("paste", onGlobalPaste);
    };
  }, [isPasteZoneActive, handlePaste]);

  // Drag and drop handlers
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsPasteZoneActive(true);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );

    if (files.length === 0) {
      setError("Please drop valid PNG or JPEG image files.");
      return;
    }

    for (const f of files) {
      await uploadImageFile(f);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    for (const f of files) {
      await uploadImageFile(f);
    }
    e.target.value = "";
  };

  // Reassign to a verified FortiGate appendix or a guide checklist task.
  const handleReassignTask = async (
    screenshotId: string,
    newTask: string
  ) => {
    if (!sessionId) return;

    const matchedTask = guideTaskOptions.find((task) => task.value === newTask);
    const checkId = matchedTask?.checkId || "";
    const title = matchedTask?.taskName || "";
    const update = {
      fileId: screenshotId,
      checkId,
      title: title || undefined,
      ...(vendor === "fortigate" ? { appendixMapping: newTask } : {}),
    };

    try {
      const res = await fetch(`/api/sessions/${sessionId}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setScreenshots((prev) =>
          prev.map((s) =>
            s.id === screenshotId
              ? {
                  ...s,
                  appendixMapping: vendor === "fortigate" ? newTask : null,
                  checkId,
                  title: title || s.title,
                }
              : s
          )
        );
      }
    } catch (err) {
      console.error("Failed to reassign appendix:", err);
    }
  };

  // Reassign device on the fly
  const handleReassignDevice = async (
    screenshotId: string,
    newDeviceId: string
  ) => {
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: screenshotId,
          deviceId: newDeviceId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setScreenshots((prev) =>
          prev.map((s) =>
            s.id === screenshotId ? { ...s, deviceId: newDeviceId } : s
          )
        );
      }
    } catch (err) {
      console.error("Failed to reassign device:", err);
    }
  };

  // Safe removal: "Remove from Report" (Issue 2)
  const handleRemoveFromReport = async (screenshotId: string) => {
    if (!sessionId) return;

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/files?fileId=${screenshotId}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json();
      if (res.ok && data.success) {
        setScreenshots((prev) => prev.filter((s) => s.id !== screenshotId));
        setSuccessMsg(
          "Screenshot excluded from report. Original file preserved in audit storage."
        );
      }
    } catch (err) {
      console.error("Failed to remove screenshot from report:", err);
    }
  };

  return (
    <Card className="border-slate-800 bg-[#070b14] shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <FileImage className="h-4 w-4 text-purple-400" />
              <span>GUI Screenshots &amp; Manual Evidence</span>
              <Badge variant="outline" className="text-[10px] font-mono py-0 ml-1">
                {screenshots.length} Staged
              </Badge>
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Paste screenshots via <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-mono text-[10px]">Ctrl+V</kbd> or drag and drop PNG/JPEG images for GUI accessibility and backup confirmation.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Explicit Task-First Pre-Assignment Controls (Adjustment 3) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-slate-800 bg-[#0c1222] p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-300 font-medium text-xs">
              Target Task for New Screenshots:
            </span>
            <select
              value={selectedTaskPreset}
              onChange={(e) => setSelectedTaskPreset(e.target.value)}
              className="rounded border border-slate-700 bg-[#070b14] px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-medium"
            >
              <option value="">Unassigned (Engineer will map after upload)</option>
              <optgroup label={vendor === "fortigate" ? "Default GUI Tasks" : "Guide Tasks"}>
                {guideTaskOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
              {vendor === "fortigate" && (
                <optgroup label="Other Appendices">
                  {OTHER_APPENDIX_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {devices.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs">Target Firewall:</span>
              <select
                value={selectedDevicePreset || devices[0]?.id}
                onChange={(e) => setSelectedDevicePreset(e.target.value)}
                className="rounded border border-slate-700 bg-[#070b14] px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname} ({d.role || "Device"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Interactive Paste & Drop Zone */}
        <div
          ref={pasteContainerRef}
          tabIndex={0}
          onClick={() => setIsPasteZoneActive(true)}
          onFocus={() => setIsPasteZoneActive(true)}
          onBlur={() => setIsPasteZoneActive(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer focus:outline-none ${
            isPasteZoneActive
              ? "border-purple-500/80 bg-purple-950/20"
              : "border-slate-700/80 bg-[#0c1222] hover:border-slate-600"
          }`}
        >
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 text-purple-400 mb-2 border border-purple-500/20">
            <ImageIcon className="h-5 w-5" />
          </div>

          <p className="text-sm font-semibold text-white">
            {isPasteZoneActive
              ? "Paste Zone Active — Press Ctrl+V to paste screenshot"
              : "Click here and press Ctrl+V, or drag & drop images"}
          </p>

          <p className="text-xs text-slate-400 mt-1">
            Supports authentic PNG and JPEG screenshots from customer GUI sessions
          </p>

          <div className="mt-3 flex items-center justify-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="gap-1.5 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Choose Image Files</span>
            </Button>
          </div>

          {uploading && (
            <div className="absolute inset-0 bg-[#070b14]/80 backdrop-blur-xs flex items-center justify-center rounded-xl gap-2 text-xs text-purple-300">
              <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
              <span>Validating &amp; preserving screenshot...</span>
            </div>
          )}
        </div>

        {/* Feedback Messages */}
        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Staged Screenshots Grid */}
        {screenshots.length > 0 && (
          <div className="space-y-3 pt-1">
            <h4 className="text-xs font-semibold text-slate-300">
              Staged Screenshots ({screenshots.length})
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {screenshots.map((s) => (
                <div
                  key={s.id}
                  className="flex gap-3 p-3 rounded-lg border border-slate-800 bg-[#0c1222] hover:border-slate-700 transition-colors"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => setPreviewImage(s)}
                    className="relative h-20 w-28 shrink-0 rounded-md overflow-hidden bg-slate-950 border border-slate-800 cursor-pointer group"
                  >
                    {s.previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={s.previewUrl}
                        alt={s.filename}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-600">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="h-4 w-4 text-white" />
                    </div>
                  </div>

                  {/* Metadata & Controls */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate">
                        <p className="text-xs font-medium text-white truncate" title={s.filename}>
                          {s.filename}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {formatBytes(s.sizeBytes)} · SHA-256 Verified
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromReport(s.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        title="Remove from report"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Task / Appendix Selector (Adjustment 3: visibly unassigned until mapped) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                          Assigned PM Task:
                        </label>
                        {(!s.appendixMapping || !s.checkId) && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                            <AlertCircle className="h-2.5 w-2.5 text-amber-400" />
                            Unassigned Task
                          </span>
                        )}
                      </div>
                      <select
                        value={vendor === "fortigate" ? s.appendixMapping || "" : s.checkId || ""}
                        onChange={(e) => handleReassignTask(s.id, e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs focus:outline-none ${
                          !s.appendixMapping
                            ? "border-amber-500/60 bg-[#070b14] text-amber-300 font-medium"
                            : "border-slate-700 bg-[#070b14] text-slate-200 focus:border-purple-500"
                        }`}
                      >
                        <option value="">-- Unassigned (Select PM Task) --</option>
                        <optgroup label={vendor === "fortigate" ? "Default GUI Tasks" : "Guide Tasks"}>
                          {guideTaskOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                        {vendor === "fortigate" && (
                          <optgroup label="Other Appendices">
                            {OTHER_APPENDIX_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* Multi-Device Target Selector if applicable */}
                    {devices.length > 1 && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[10px] text-slate-500">Firewall:</span>
                        <select
                          value={s.deviceId || devices[0].id}
                          onChange={(e) => handleReassignDevice(s.id, e.target.value)}
                          className="rounded border border-slate-700 bg-[#070b14] px-1.5 py-0.5 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-purple-500"
                        >
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.hostname} ({d.role || "Device"})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Full Resolution Lightbox Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-[#070b14] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-[#0c1222]">
              <div className="truncate">
                <p className="text-xs font-semibold text-white truncate">
                  {previewImage.filename}
                </p>
                <p className="text-[11px] text-purple-300 font-mono">
                  {previewImage.appendixMapping || "Unassigned"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage.previewUrl}
                alt={previewImage.filename}
                className="max-h-[75vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
