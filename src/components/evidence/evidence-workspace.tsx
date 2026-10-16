"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileImage,
  Sparkles,
  RotateCw,
  Search,
  Filter,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Server,
  Maximize2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EvidenceCard, EvidenceItem } from "./evidence-card";

interface DeviceOption {
  id: string;
  hostname: string;
  model?: string | null;
  role?: string | null;
}

interface EvidenceWorkspaceProps {
  sessionId: string;
  devices: DeviceOption[];
  customerName?: string;
  vendorName?: string;
}

export function EvidenceWorkspace({
  sessionId,
  devices,
  customerName,
  vendorName = "Fortinet FortiGate",
}: EvidenceWorkspaceProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);

  const fetchEvidence = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        selectedDeviceId === "ALL"
          ? `/api/sessions/${sessionId}/evidence`
          : `/api/sessions/${sessionId}/evidence?deviceId=${selectedDeviceId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data?.evidences) {
        setEvidenceList(json.data.evidences);
      }
    } catch (err) {
      console.error("Failed to load evidence items:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedDeviceId]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId === "ALL" ? undefined : selectedDeviceId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate evidence images");
      }

      setSuccessMessage(
        `Successfully generated ${json.data.totalImagesGenerated} evidence terminal image(s) for the CTC report.`
      );
      await fetchEvidence();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to generate evidence"
      );
    } finally {
      setGenerating(false);
    }
  };

  const filteredEvidence = evidenceList.filter((item) => {
    const matchesDevice =
      selectedDeviceId === "ALL" || item.deviceId === selectedDeviceId;
    const matchesSearch =
      searchQuery === "" ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.appendixMapping &&
        item.appendixMapping.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.command && item.command.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.deviceHostname.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDevice && matchesSearch;
  });

  // Overview metrics
  const totalImages = evidenceList.length;
  const multiPageCount = evidenceList.filter((e) => e.totalPages > 1).length;
  const redactedCount = evidenceList.filter((e) => e.isRedacted).length;
  const uniqueAppendices = new Set(
    evidenceList.map((e) => e.appendixMapping).filter(Boolean)
  ).size;

  // Modal navigation
  const currentIndex = previewItem
    ? filteredEvidence.findIndex((e) => e.id === previewItem.id)
    : -1;

  const handleNextPreview = () => {
    if (currentIndex >= 0 && currentIndex < filteredEvidence.length - 1) {
      setPreviewItem(filteredEvidence[currentIndex + 1]);
    }
  };

  const handlePrevPreview = () => {
    if (currentIndex > 0) {
      setPreviewItem(filteredEvidence[currentIndex - 1]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Ribbon */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FileImage className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              CLI Evidence Terminal Image Generator
              <Badge variant="outline" className="text-[10px] text-slate-400">
                Phase 6
              </Badge>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Renders authentic PuTTY command executions into appendix-ready terminal PNG screenshots with credential redaction.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Button
            onClick={handleGenerateAll}
            disabled={generating}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-500/20"
          >
            {generating ? (
              <>
                <RotateCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Rendering PNGs...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
                Generate All Evidence Images
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <FileImage className="h-3.5 w-3.5 text-emerald-400" />
            Total Images
          </span>
          <p className="text-2xl font-bold font-mono text-white">
            {totalImages}
          </p>
          <span className="text-[10px] text-slate-500">
            Ready for Word insertion
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
          <span className="text-[11px] font-medium text-blue-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-400" />
            Appendices Covered
          </span>
          <p className="text-2xl font-bold font-mono text-blue-300">
            {uniqueAppendices}
          </p>
          <span className="text-[10px] text-slate-500">
            CTC QMS-P09-F01 target
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
          <span className="text-[11px] font-medium text-purple-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            Multi-Page Outputs
          </span>
          <p className="text-2xl font-bold font-mono text-purple-300">
            {multiPageCount}
          </p>
          <span className="text-[10px] text-slate-500">
            Cleanly paginated
          </span>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3.5 space-y-1">
          <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Redacted Secrets
          </span>
          <p className="text-2xl font-bold font-mono text-amber-300">
            {redactedCount}
          </p>
          <span className="text-[10px] text-amber-500/80">
            Zero credential leak
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {devices.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Firewalls ({devices.length})</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname} {d.role ? `(${d.role})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="w-full sm:w-72">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search appendix, command, host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Grid of Evidence Cards */}
      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
          <RotateCw className="h-6 w-6 animate-spin text-blue-400" />
          <span>Loading evidence gallery...</span>
        </div>
      ) : filteredEvidence.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvidence.map((ev) => (
            <EvidenceCard
              key={ev.id}
              evidence={ev}
              onPreview={(item) => setPreviewItem(item)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center text-xs text-slate-400 space-y-3">
          <div className="p-3 w-12 h-12 mx-auto rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-400">
            <FileImage className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-200">
              No evidence images generated yet
            </h4>
            <p className="text-slate-500 max-w-md mx-auto text-xs leading-relaxed">
              Once PuTTY logs have been parsed into command executions, click &ldquo;Generate All Evidence Images&rdquo; above to automatically render high-resolution PNG terminal screenshots for each CTC report appendix.
            </p>
          </div>
          <Button
            onClick={handleGenerateAll}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
            Generate Evidence Now
          </Button>
        </div>
      )}

      {/* Fullscreen Interactive Zoom Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {previewItem.appendixMapping}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {previewItem.title}
                  </span>
                  {previewItem.totalPages > 1 && (
                    <span className="text-xs text-slate-400 font-mono">
                      (Page {previewItem.pageNumber} of {previewItem.totalPages})
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                  Host: {previewItem.deviceHostname} · Command: {previewItem.command}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewItem.imageUrl}
                  download={`${previewItem.appendixMapping || "evidence"}-page-${previewItem.pageNumber}.png`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PNG</span>
                </a>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Image Area */}
            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewItem.imageUrl}
                alt={previewItem.caption || previewItem.title}
                className="max-h-[70vh] w-auto rounded-lg border border-slate-800 shadow-xl"
              />
            </div>

            {/* Modal Footer Controls */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {previewItem.sourceLabel}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPreview}
                  disabled={currentIndex <= 0}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Previous
                </Button>
                <span className="text-xs font-mono text-slate-400">
                  {currentIndex + 1} / {filteredEvidence.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPreview}
                  disabled={currentIndex >= filteredEvidence.length - 1}
                  className="h-8 text-xs"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
