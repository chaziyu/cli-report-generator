"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, X, Check, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewCheckItem } from "@/core/review";

interface JustificationDialogProps {
  item: ReviewCheckItem | null;
  targetStatus: string;
  onConfirm: (reviewNotes: string) => void;
  onClose: () => void;
}

const PRESET_JUSTIFICATIONS = [
  "Hardware model does not contain physical log disk (diskless architecture)",
  "Standalone deployment - HA cluster synchronization not applicable",
  "Customer acknowledged high utilization during parallel maintenance backup window",
  "License contract renewal in progress with vendor; verified current contract active",
  "Manually verified through customer FortiGate Web GUI management interface",
  "Non-impacting anomaly acknowledged by CTC lead security engineer",
];

export function JustificationDialog({
  item,
  targetStatus,
  onConfirm,
  onClose,
}: JustificationDialogProps) {
  const [notes, setNotes] = useState(item?.decision.reviewNotes || "");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  if (!item) return null;

  const handleSelectPreset = (preset: string) => {
    setSelectedPreset(preset);
    setNotes(preset);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    onConfirm(notes.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative flex flex-col w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Engineer Exception &amp; Justification
              </h3>
              <p className="text-xs text-slate-400">
                Audited justification required for QMS-P09-F01 compliance
              </p>
            </div>
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

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target check context banner */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">
                {item.itemNumber} {item.taskName}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Target Status:</span>
                <Badge
                  variant={
                    targetStatus === "PASS"
                      ? "success"
                      : targetStatus === "FAIL"
                      ? "destructive"
                      : targetStatus === "WARNING"
                      ? "warning"
                      : "secondary"
                  }
                  className="font-mono text-[10px]"
                >
                  {targetStatus}
                </Badge>
              </div>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
              {item.proposedEvaluation.currentValue && (
                <p>
                  <span className="text-slate-500">Current Reading:</span>{" "}
                  <span className="font-mono text-slate-300">
                    {item.proposedEvaluation.currentValue}
                  </span>
                </p>
              )}
              {item.proposedEvaluation.proposedRemarks && (
                <p>
                  <span className="text-slate-500">Automated Finding:</span>{" "}
                  <span className="text-slate-300">
                    {item.proposedEvaluation.proposedRemarks}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
              Standard CTC Presets:
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_JUSTIFICATIONS.map((preset) => {
                const isSelected = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex items-start gap-2 p-2 rounded-lg text-left text-xs transition-colors cursor-pointer border ${
                      isSelected
                        ? "bg-blue-600/10 border-blue-500/40 text-blue-300"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-blue-400 bg-blue-500 text-white"
                          : "border-slate-600"
                      }`}
                    >
                      {isSelected && <Check className="h-2 w-2" />}
                    </span>
                    <span className="leading-snug">{preset}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Justification Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Audit Justification / Review Notes: <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter detailed reason for approving this status/override..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
            />
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              This justification is recorded in SQLite ReviewDecision and audit log.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!notes.trim()}
              className="bg-amber-600 hover:bg-amber-500 text-white font-medium"
            >
              Confirm Justification &amp; Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
