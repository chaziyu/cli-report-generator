"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  FileText,
  FileImage,
  Check,
  X,
  Edit2,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewCheckItem, ReviewEvidenceSummary } from "@/core/review";

interface ReviewTableProps {
  items: ReviewCheckItem[];
  hasOriginalDoc: boolean;
  compact?: boolean;
  onApprove: (item: ReviewCheckItem) => void;
  onOverrideStatus: (item: ReviewCheckItem, newStatus: string) => void;
  onUpdateRemarks: (item: ReviewCheckItem, newRemarks: string) => void;
  onReject: (item: ReviewCheckItem) => void;
  onRequestJustification: (item: ReviewCheckItem, targetStatus: string) => void;
  onViewEvidence: (evidence: ReviewEvidenceSummary, taskName: string, item?: ReviewCheckItem) => void;
}

export function ReviewTable({
  items,
  hasOriginalDoc,
  compact = false,
  onApprove,
  onOverrideStatus,
  onUpdateRemarks,
  onReject,
  onRequestJustification,
  onViewEvidence,
}: ReviewTableProps) {
  const [editingRemarksCheckId, setEditingRemarksCheckId] = useState<string | null>(null);
  const [tempRemarks, setTempRemarks] = useState<string>("");
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [expandedAdvancedCheckId, setExpandedAdvancedCheckId] = useState<string | null>(null);

  const startEditRemarks = (item: ReviewCheckItem) => {
    setEditingRemarksCheckId(item.checkId);
    setTempRemarks(item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || "");
  };

  const saveEditRemarks = (item: ReviewCheckItem) => {
    onUpdateRemarks(item, tempRemarks.trim());
    setEditingRemarksCheckId(null);
  };

  const getStatusBadge = (status?: string | null) => {
    switch (status?.toUpperCase()) {
      case "PASS":
        return (
          <Badge variant="success" className="font-mono text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" />
            PASS
          </Badge>
        );
      case "FAIL":
        return (
          <Badge variant="destructive" className="font-mono text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            FAIL
          </Badge>
        );
      case "WARNING":
      case "WARN":
        return (
          <Badge variant="warning" className="font-mono text-[10px] gap-1">
            <AlertCircle className="h-3 w-3" />
            WARNING
          </Badge>
        );
      case "NA":
      case "N/A":
        return (
          <Badge variant="secondary" className="font-mono text-[10px] bg-slate-800 text-slate-300">
            N/A
          </Badge>
        );
      case "REVIEW":
        return (
          <Badge variant="outline" className="font-mono text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10">
            REVIEW
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="font-mono text-[10px] text-slate-500 border-slate-700">
            {status || "PENDING"}
          </Badge>
        );
    }
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            <Check className="h-3 w-3" />
            Approved
          </span>
        );
      case "MODIFIED":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
            <Edit2 className="h-3 w-3" />
            Modified
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
            <X className="h-3 w-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-400">
            Pending Review
          </span>
        );
    }
  };

  if (compact) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070b14] shadow-md">
        <table className="w-full text-left text-xs border-collapse min-w-[650px]">
          <thead className="bg-[#0c1222] text-slate-200 font-semibold border-b border-slate-800 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="py-3 px-4">Check</th>
              <th className="py-3 px-3 hidden md:table-cell">Value</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 hidden sm:table-cell">Evidence</th>
              <th className="py-3 px-3 hidden lg:table-cell">Remarks</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/70 text-slate-300">
            {items.map((item) => {
              const isEditing = editingRemarksCheckId === item.checkId;
              const isExpanded = expandedCheckId === item.checkId;
              const isAdvancedOpen = expandedAdvancedCheckId === item.checkId;
              const hasEv = item.evidence && item.evidence.length > 0;
              const isApproved = item.decision.decision === "APPROVED";
              const isModified = item.decision.decision === "MODIFIED";
              const isRejected = item.decision.decision === "REJECTED";

              return (
                <tr key={item.checkId} className="group">
                  <td colSpan={6} className="p-0">
                    <div
                      className={`flex items-center justify-between py-3 px-4 cursor-pointer transition-colors hover:bg-slate-900/50 ${
                        isApproved
                          ? "bg-emerald-950/10"
                          : isModified
                          ? "bg-blue-950/10"
                          : isRejected
                          ? "bg-rose-950/10 opacity-75"
                          : ""
                      }`}
                      onClick={() => setExpandedCheckId(isExpanded ? null : item.checkId)}
                    >
                      {/* Check Column */}
                      <div className="flex-1 min-w-0 pr-4 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-400">
                            {item.itemNumber}
                          </span>
                          <span className="font-semibold text-slate-200 truncate">
                            {item.taskName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                            {item.sectionName}
                          </span>
                          {item.reReviewRequired && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] px-1.5 py-0.2 font-medium">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Re-review Required
                            </span>
                          )}
                          {item.isDiffFromOriginal && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded">
                              Diff
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Value Column (hidden on narrow) */}
                      <div className="hidden md:flex items-center w-28 shrink-0 px-2">
                        {item.proposedEvaluation.currentValue ? (
                          <span className="font-mono text-xs font-semibold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 truncate max-w-[100px]">
                            {item.proposedEvaluation.currentValue}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </div>

                      {/* Status Column */}
                      <div className="w-24 shrink-0 px-2">
                        {getStatusBadge(item.decision.finalStatus || item.proposedEvaluation.status)}
                      </div>

                      {/* Evidence Column (hidden on narrow) */}
                      <div className="hidden sm:flex items-center w-36 shrink-0 px-2 gap-1">
                        {hasEv ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewEvidence(item.evidence[0], item.taskName, item);
                            }}
                            className="h-6 text-[10px] px-2 gap-1.5 text-slate-200 border-slate-700 bg-slate-900/90 hover:bg-slate-800"
                          >
                            {item.evidenceHealth?.cliCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-blue-300 font-mono">
                                <Terminal className="h-2.5 w-2.5" />
                                {item.evidenceHealth.cliCount}
                              </span>
                            )}
                            {item.evidenceHealth?.guiCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-purple-300 font-mono">
                                <FileImage className="h-2.5 w-2.5" />
                                {item.evidenceHealth.guiCount}
                              </span>
                            )}
                            {item.evidenceHealth?.excludedCount > 0 && (
                              <span className="text-[9px] text-slate-500">
                                (+{item.evidenceHealth.excludedCount})
                              </span>
                            )}
                          </Button>
                        ) : item.requiresEvidence ? (
                          <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                            <AlertTriangle className="h-3 w-3" />
                            Missing
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">N/A</span>
                        )}

                        {item.evidenceHealth?.status === "TRUNCATED" && (
                          <span className="text-[9px] text-rose-300 bg-rose-950/80 px-1 py-0.2 rounded border border-rose-500/40" title={item.evidenceHealth.message || "Truncated command output"}>
                            Cut-off
                          </span>
                        )}
                        {item.evidenceHealth?.status === "CONFLICTING" && (
                          <span className="text-[9px] text-rose-300 bg-rose-950/80 px-1 py-0.2 rounded border border-rose-500/40" title={item.evidenceHealth.message || "Conflicting device mapping"}>
                            Conflict
                          </span>
                        )}
                      </div>

                      {/* Remarks Column (hidden on narrow) */}
                      <div className="hidden lg:flex items-center flex-1 min-w-0 px-2">
                        <p
                          className="text-xs text-slate-300 truncate max-w-xs"
                          title={item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || ""}
                        >
                          {item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || (
                            <span className="text-slate-500 italic">No remark</span>
                          )}
                        </p>
                      </div>

                      {/* Action Column */}
                      <div className="flex items-center justify-end gap-2 shrink-0 pl-2">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                            <Check className="h-3 w-3" />
                            Approved
                          </span>
                        ) : item.isEligibleForBatchPass || (!item.requiresJustification && item.proposedEvaluation.status === "PASS") ? (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onApprove(item);
                            }}
                            className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                        ) : null}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCheckId(isExpanded ? null : item.checkId);
                          }}
                          className="h-7 px-2 text-xs text-slate-300 hover:text-white"
                        >
                          <span>{isExpanded ? "Close" : "Review / Edit"}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 ml-1" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 ml-1" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Details Container */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 bg-[#050811] p-4 sm:p-5 space-y-4">
                        {/* Re-Review Alert if needed */}
                        {item.reReviewRequired && (
                          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>
                              <strong>Re-review Required:</strong> Underlying evidence changed between runs. Prior approval has been superseded. Please confirm findings to approve.
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* 1. PuTTY CLI Telemetry */}
                          <div className="rounded-lg border border-slate-800 bg-[#080d1a] p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                                <Terminal className="h-3.5 w-3.5 text-blue-400" />
                                PuTTY CLI Findings
                              </span>
                              {getStatusBadge(item.proposedEvaluation.status)}
                            </div>

                            {item.proposedEvaluation.currentValue && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-400">Extracted:</span>
                                <span className="font-mono text-emerald-300 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                                  {item.proposedEvaluation.currentValue}
                                </span>
                              </div>
                            )}

                            {item.thresholdDescription && (
                              <p className="text-[11px] text-slate-400 italic">
                                Threshold: {item.thresholdDescription}
                              </p>
                            )}

                            {item.proposedEvaluation.sourceCommand && (
                              <p className="text-[10px] text-slate-500 font-mono truncate" title={item.proposedEvaluation.sourceCommand}>
                                CMD: {item.proposedEvaluation.sourceCommand}
                              </p>
                            )}

                            {hasEv ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onViewEvidence(item.evidence[0], item.taskName, item)}
                                className="w-full text-xs h-7 text-emerald-300 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 gap-1.5"
                              >
                                <FileImage className="h-3.5 w-3.5" />
                                <span>Inspect Evidence ({item.evidence.length})</span>
                              </Button>
                            ) : item.requiresEvidence ? (
                              <div className="text-[11px] text-amber-400 flex items-center gap-1 font-mono pt-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Evidence missing for {item.targetAppendix || item.taskName}
                              </div>
                            ) : null}
                          </div>

                          {/* 2. Original Word Document */}
                          <div className="rounded-lg border border-slate-800 bg-[#090e1a] p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                Original Word Report
                              </span>
                              {item.originalDocument.foundInDocument ? (
                                getStatusBadge(item.originalDocument.status)
                              ) : (
                                <span className="text-[11px] text-slate-500 italic">Not in template</span>
                              )}
                            </div>

                            <div className="space-y-1">
                              <span className="text-[11px] text-slate-400">Template Remarks:</span>
                              <p className="text-xs text-slate-300 bg-[#040711] p-2 rounded border border-slate-800/80 min-h-[48px] max-h-24 overflow-y-auto">
                                {item.originalDocument.remarks || (
                                  <span className="text-slate-500 italic">No remarks in template</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* 3. Remarks Editor */}
                          <div className="rounded-lg border border-slate-800 bg-[#080d1a] p-3.5 space-y-2 md:col-span-2 lg:col-span-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-200">Final Report Remarks</span>
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => startEditRemarks(item)}
                                  className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium"
                                >
                                  Edit Remark
                                </button>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  rows={2}
                                  value={tempRemarks}
                                  onChange={(e) => setTempRemarks(e.target.value)}
                                  className="w-full rounded-md border border-blue-500 bg-[#040711] p-2 text-xs text-white focus:outline-none"
                                />
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingRemarksCheckId(null)}
                                    className="h-6 text-[10px] px-2"
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => saveEditRemarks(item)}
                                    className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-500 text-white"
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-200 bg-[#040711] p-2 rounded border border-slate-800/80 min-h-[48px]">
                                {item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || (
                                  <span className="text-slate-500 italic">No final remarks entered</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Audit Justification Banner if recorded */}
                        {item.decision.reviewNotes && (
                          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-300 flex items-start gap-2">
                            <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-amber-200">Audit Justification Recorded:</span>
                              <p className="mt-0.5 italic">{item.decision.reviewNotes}</p>
                            </div>
                          </div>
                        )}

                        {/* Primary Action Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Primary Action 1: Approve */}
                            <Button
                              size="sm"
                              onClick={() => {
                                if (item.requiresJustification && !item.decision.reviewNotes) {
                                  onRequestJustification(item, item.proposedEvaluation.status || "PASS");
                                } else {
                                  onApprove(item);
                                }
                              }}
                              className={`h-8 px-3 text-xs font-semibold ${
                                isApproved
                                  ? "bg-emerald-600 text-white"
                                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              <span>{isApproved ? "Approved ✓" : "Approve Finding"}</span>
                            </Button>

                            {/* Primary Action 2: Reject Proposal */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onReject(item)}
                              className={`h-8 px-2.5 text-xs ${
                                isRejected
                                  ? "text-rose-400 bg-rose-500/10 border border-rose-500/30"
                                  : "text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                              }`}
                              title="Reject automated finding; retains original Word values until an approved replacement exists"
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              <span>Reject Automated Proposal</span>
                            </Button>
                          </div>

                          {/* Exceptional Overrides & Advanced Menu Toggle */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setExpandedAdvancedCheckId(
                                isAdvancedOpen ? null : item.checkId
                              )
                            }
                            className="h-8 text-xs text-slate-300 border-slate-700 bg-slate-800/80 hover:bg-slate-700 gap-1.5 self-end sm:self-auto"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400" />
                            <span>{isAdvancedOpen ? "Hide Advanced" : "Advanced / Status Overrides"}</span>
                            {isAdvancedOpen ? (
                              <ChevronUp className="h-3.5 w-3.5 ml-0.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
                            )}
                          </Button>
                        </div>

                        {/* Advanced Controls & Exceptional Overrides Panel */}
                        {isAdvancedOpen && (
                          <div className="rounded-lg border border-slate-800 bg-[#030610] p-3.5 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-300">
                                  Manual Status Override:
                                </span>
                                <select
                                  value={
                                    item.decision.finalStatus ||
                                    item.proposedEvaluation.status ||
                                    "PENDING"
                                  }
                                  onChange={(e) => {
                                    const newStatus = e.target.value;
                                    if (
                                      (newStatus === "FAIL" ||
                                        newStatus === "WARNING" ||
                                        newStatus === "NA") &&
                                      !item.decision.reviewNotes
                                    ) {
                                      onRequestJustification(item, newStatus);
                                    } else {
                                      onOverrideStatus(item, newStatus);
                                    }
                                  }}
                                  className="rounded border border-slate-700 bg-[#070b14] px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
                                >
                                  <option value="PASS">PASS (Healthy)</option>
                                  <option value="FAIL">FAIL (Unhealthy)</option>
                                  <option value="WARNING">WARNING (Attention)</option>
                                  <option value="NA">N/A (Not Applicable)</option>
                                  <option value="REVIEW">REVIEW (Manual Check)</option>
                                </select>
                              </div>

                              <div className="flex items-center gap-2">
                                {item.decision.finalStatus !== "NA" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRequestJustification(item, "NA")}
                                    className="h-7 text-xs text-slate-300 border-slate-700 hover:text-white"
                                  >
                                    Mark as N/A with Justification
                                  </Button>
                                )}

                                {item.requiresJustification && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      onRequestJustification(
                                        item,
                                        item.decision.finalStatus ||
                                          item.proposedEvaluation.status ||
                                          "PASS"
                                      )
                                    }
                                    className="h-7 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                                  >
                                    <AlertTriangle className="h-3 w-3 mr-1 text-amber-400" />
                                    Justify Exception
                                  </Button>
                                )}
                              </div>
                            </div>

                            {item.decision.reviewer && (
                              <p className="text-[10px] text-slate-500 font-mono">
                                Last recorded by {item.decision.reviewer} on {item.decision.decidedAt || "recent session"}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070b14] shadow-xl">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-[#0c1222] text-slate-200 font-semibold border-b border-slate-800 sticky top-0 z-10 backdrop-blur-md">
          <tr>
            <th className="py-3.5 px-4 w-[22%]">Check Task &amp; Scope</th>
            <th className="py-3.5 px-4 w-[24%] border-l border-slate-800/80 bg-[#090e1a]">
              <div className="flex items-center justify-between">
                <span>Original Word Report</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {hasOriginalDoc ? "QMS-P09-F01 v1.1" : "No Doc Uploaded"}
                </span>
              </div>
            </th>
            <th className="py-3.5 px-4 w-[28%] border-l border-slate-800/80 bg-[#070d1a]">
              <div className="flex items-center justify-between">
                <span>Proposed Evaluation Findings</span>
                <span className="text-[10px] text-blue-400 font-normal">PuTTY CLI Telemetry</span>
              </div>
            </th>
            <th className="py-3.5 px-4 w-[26%] border-l border-slate-800/80">
              Engineer Decision &amp; Overrides
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-800/70 text-slate-300">
          {items.map((item) => {
            const isEditing = editingRemarksCheckId === item.checkId;
            const isExpanded = expandedCheckId === item.checkId;
            const hasEv = item.evidence && item.evidence.length > 0;
            const isApproved = item.decision.decision === "APPROVED";
            const isModified = item.decision.decision === "MODIFIED";
            const isRejected = item.decision.decision === "REJECTED";

            return (
              <tr
                key={item.checkId}
                className={`transition-colors hover:bg-slate-900/40 ${
                  isApproved
                    ? "bg-emerald-950/10"
                    : isModified
                    ? "bg-blue-950/10"
                    : isRejected
                    ? "bg-rose-950/10 opacity-75"
                    : ""
                }`}
              >
                {/* Column 1: Check Task & Scope */}
                <td className="py-4 px-4 align-top space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-400">
                      {item.itemNumber}
                    </span>
                    <span className="font-semibold text-slate-200">
                      {item.taskName}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
                      {item.sectionName}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.sourceType}
                    </Badge>
                    {item.targetAppendix && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.targetAppendix.split("-")[0].trim()}
                      </span>
                    )}
                  </div>

                  {item.thresholdDescription && (
                    <p className="text-[11px] text-slate-500 italic">
                      Rule: {item.thresholdDescription}
                    </p>
                  )}

                  {/* Diff indicator tag */}
                  {item.isDiffFromOriginal && (
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                        Proposal updates report
                      </span>
                    </div>
                  )}
                </td>

                {/* Column 2: Original Word Report */}
                <td className="py-4 px-4 align-top border-l border-slate-800/80 bg-[#090e1a]/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Status:</span>
                    {item.originalDocument.foundInDocument ? (
                      getStatusBadge(item.originalDocument.status)
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Not in template</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium">Original Remarks:</span>
                    <p className="text-xs text-slate-200 leading-relaxed bg-[#050811] p-2.5 rounded-lg border border-slate-800 min-h-[44px]">
                      {item.originalDocument.remarks || (
                        <span className="text-slate-400 italic">Empty / no remark in Word doc</span>
                      )}
                    </p>
                  </div>

                  {/* Checkbox representation if found in Word cell */}
                  {item.originalDocument.checkboxOptions.length > 0 && (
                    <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400">
                      <span>Doc checkboxes:</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        {item.originalDocument.checkboxOptions.map((opt, i) => (
                          <span
                            key={i}
                            className={`px-1.5 py-0.2 rounded border ${
                              opt.isChecked
                                ? "bg-blue-500/20 border-blue-500/40 text-blue-300 font-bold"
                                : "bg-slate-900 border-slate-800 text-slate-500"
                            }`}
                          >
                            [{opt.isChecked ? "✓" : " "}] {opt.label || opt.status}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </td>

                {/* Column 3: Proposed Evaluation Findings */}
                <td className="py-4 px-4 align-top border-l border-slate-800/80 bg-[#070d1a]/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Finding:</span>
                    {getStatusBadge(item.proposedEvaluation.status)}
                  </div>

                  {/* Extracted Reading */}
                  {item.proposedEvaluation.currentValue && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-300 text-[11px] font-medium">Telemetry:</span>
                      <span className="font-mono text-emerald-300 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                        {item.proposedEvaluation.currentValue}
                      </span>
                    </div>
                  )}

                  {/* Proposed Remarks */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">Proposed Remark:</span>
                      {item.proposedEvaluation.proposedRemarks && !isEditing && (
                        <button
                          type="button"
                          onClick={() => onUpdateRemarks(item, item.proposedEvaluation.proposedRemarks!)}
                          className="text-[10px] text-blue-400 hover:text-blue-300 underline font-medium"
                          title="Copy proposed remarks to final decision"
                        >
                          Use This Remark
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed bg-[#050811] p-2.5 rounded-lg border border-slate-800 min-h-[44px]">
                      {item.proposedEvaluation.proposedRemarks || (
                        <span className="text-slate-400 italic">No automated remark generated</span>
                      )}
                    </p>
                  </div>

                  {/* Source Command & Terminal Evidence Preview */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/50">
                    {item.proposedEvaluation.sourceCommand && (
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 truncate max-w-[170px]" title={item.proposedEvaluation.sourceCommand}>
                        <Terminal className="h-3 w-3 text-slate-400 shrink-0" />
                        {item.proposedEvaluation.sourceCommand}
                      </span>
                    )}

                    {hasEv ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewEvidence(item.evidence[0], item.taskName, item)}
                        className="h-6 text-[10px] px-2 gap-1 text-emerald-400 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15"
                      >
                        <FileImage className="h-3 w-3" />
                        <span>View Evidence ({item.evidence.length})</span>
                      </Button>
                    ) : item.requiresEvidence ? (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                        <AlertTriangle className="h-3 w-3" />
                        Evidence Missing
                      </span>
                    ) : null}
                  </div>
                </td>

                {/* Column 4: Engineer Decision & Overrides */}
                <td className="py-4 px-4 align-top border-l border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-medium">Decision:</span>
                      {getDecisionBadge(item.decision.decision)}
                    </div>

                    {item.decision.reviewer && (
                      <span className="text-[10px] text-slate-500 truncate max-w-[100px]" title={item.decision.reviewer}>
                        by {item.decision.reviewer}
                      </span>
                    )}
                  </div>

                  {/* Status Override Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-16 shrink-0">Final Status:</span>
                    <select
                      value={item.decision.finalStatus || item.proposedEvaluation.status || "PENDING"}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        if (
                          (newStatus === "FAIL" || newStatus === "WARNING" || newStatus === "NA") &&
                          !item.decision.reviewNotes
                        ) {
                          onRequestJustification(item, newStatus);
                        } else {
                          onOverrideStatus(item, newStatus);
                        }
                      }}
                      className="flex-1 rounded-md border border-slate-700 bg-[#060b16] px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="PASS" className="bg-[#0c1222] text-white">PASS (Healthy)</option>
                      <option value="FAIL" className="bg-[#0c1222] text-white">FAIL (Unhealthy)</option>
                      <option value="WARNING" className="bg-[#0c1222] text-white">WARNING (Attention)</option>
                      <option value="NA" className="bg-[#0c1222] text-white">N/A (Not Applicable)</option>
                      <option value="REVIEW" className="bg-[#0c1222] text-white">REVIEW (Manual check)</option>
                    </select>
                  </div>

                  {/* Editable Remarks */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">Final Report Remarks:</span>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => startEditRemarks(item)}
                          className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                        >
                          <Edit2 className="h-2.5 w-2.5" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={tempRemarks}
                          onChange={(e) => setTempRemarks(e.target.value)}
                          className="w-full rounded-md border border-blue-500 bg-[#060b16] p-2 text-xs text-white focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingRemarksCheckId(null)}
                            className="h-6 text-[10px] px-2"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEditRemarks(item)}
                            className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-500"
                          >
                            Save Remarks
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 min-h-[38px]">
                        {item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || (
                          <span className="text-slate-500 italic">No final remarks entered</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Justification / Review Notes display if present */}
                  {item.decision.reviewNotes && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[11px] text-amber-300 space-y-0.5">
                      <span className="font-semibold flex items-center gap-1 text-[10px] text-amber-400">
                        <ShieldCheck className="h-3 w-3" />
                        Audit Justification:
                      </span>
                      <p className="italic leading-snug">{item.decision.reviewNotes}</p>
                    </div>
                  )}

                  {/* Quick Decision Actions Bar */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {/* 1-Click Approve Button */}
                    <Button
                      size="sm"
                      onClick={() => {
                        if (item.requiresJustification && !item.decision.reviewNotes) {
                          onRequestJustification(item, item.proposedEvaluation.status || "PASS");
                        } else {
                          onApprove(item);
                        }
                      }}
                      className={`h-7 px-2.5 text-xs font-semibold ${
                        isApproved
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      <span>{isApproved ? "Approved" : "Approve"}</span>
                    </Button>

                    {/* Justify / Exception Button */}
                    {item.requiresJustification && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRequestJustification(item, item.decision.finalStatus || item.proposedEvaluation.status || "PASS")}
                        className="h-7 px-2 text-[11px] text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      >
                        <AlertTriangle className="h-3 w-3 mr-1 text-amber-400" />
                        <span>Justify</span>
                      </Button>
                    )}

                    {/* Quick N/A with Justification shortcut */}
                    {item.decision.finalStatus !== "NA" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRequestJustification(item, "NA")}
                        className="h-7 px-2 text-[11px] text-slate-400 hover:text-slate-200"
                        title="Mark check as N/A with audit justification"
                      >
                        Mark N/A
                      </Button>
                    )}

                    {/* Reject Button (Reverts proposed changes) */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReject(item)}
                      className={`h-7 px-2 text-[11px] ${
                        isRejected
                          ? "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                          : "text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                      }`}
                      title="Reject proposed changes and keep original Word report values"
                    >
                      <X className="h-3 w-3 mr-0.5" />
                      <span>Reject</span>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
