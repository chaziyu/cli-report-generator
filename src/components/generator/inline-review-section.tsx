"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  RotateCw,
  Search,
  CheckCheck,
  FileCheck,
  Server,
  User,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReviewTable } from "@/components/report/review-table";
import { EvidenceModal } from "@/components/report/evidence-modal";
import { JustificationDialog } from "@/components/report/justification-dialog";
import {
  ReviewCheckItem,
  ReviewEvidenceSummary,
  ReviewSessionSummary,
  reviewService,
} from "@/core/review";

interface DeviceOption {
  id: string;
  hostname: string;
  model?: string | null;
  role?: string | null;
}

interface InlineReviewSectionProps {
  sessionId: string;
  initialEngineerName?: string | null;
  onReviewUpdated?: () => void;
}

export function InlineReviewSection({
  sessionId,
  initialEngineerName,
  onReviewUpdated,
}: InlineReviewSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review state
  const [items, setItems] = useState<ReviewCheckItem[]>([]);
  const [summary, setSummary] = useState<ReviewSessionSummary | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [engineerName, setEngineerName] = useState(initialEngineerName || "");
  const [hasOriginalDoc, setHasOriginalDoc] = useState(false);
  const [targetDevice, setTargetDevice] = useState<DeviceOption | null>(null);
  const [allDevices, setAllDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // Filters: Default to NEEDS_ATTENTION for prioritized review workflow
  const [filterMode, setFilterMode] = useState<"NEEDS_ATTENTION" | "ALL" | "APPROVED" | "DIFFS_ONLY">("NEEDS_ATTENTION");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [selectedEvidence, setSelectedEvidence] = useState<{
    evidence: ReviewEvidenceSummary;
    taskName: string;
    item?: ReviewCheckItem;
  } | null>(null);
  const [justificationTarget, setJustificationTarget] = useState<{
    item: ReviewCheckItem;
    targetStatus: string;
  } | null>(null);

  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Fetch review findings
  const fetchReviewData = useCallback(
    async (devId?: string) => {
      try {
        setLoading(true);
        setError(null);
        const url = devId
          ? `/api/sessions/${sessionId}/review?deviceId=${devId}`
          : `/api/sessions/${sessionId}/review`;
        const res = await fetch(url);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load review findings");
        }

        const data = json.data;
        setItems(data.items || []);
        setSummary(data.summary || null);
        setCustomerName(data.customer || "");
        if (data.engineerName && !engineerName) {
          setEngineerName(data.engineerName);
        }
        setHasOriginalDoc(data.hasOriginalDocument || false);
        setTargetDevice(data.targetDevice || null);
        setAllDevices(data.allDevices || []);
        if (!selectedDeviceId && data.targetDevice?.id) {
          setSelectedDeviceId(data.targetDevice.id);
        }
      } catch (err) {
        console.error("Failed to load review findings:", err);
        setError(err instanceof Error ? err.message : "Error loading review findings");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, selectedDeviceId, engineerName]
  );

  useEffect(() => {
    fetchReviewData(selectedDeviceId || undefined);
  }, [sessionId, selectedDeviceId, fetchReviewData]);

  // Ensure reviewer name is recorded before approving/modifying
  const ensureReviewerName = async (): Promise<string> => {
    let name = engineerName.trim();
    if (!name) {
      const prompted = window.prompt("Enter engineer name for audit sign-off:", "Lead Security Engineer");
      name = prompted?.trim() || "Lead Security Engineer";
      setEngineerName(name);
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engineerName: name }),
        });
      } catch (err) {
        console.warn("Could not persist engineer name to session:", err);
      }
    }
    return name;
  };

  // Record single decision
  const handleRecordDecision = async (
    checkId: string,
    decision: "APPROVED" | "MODIFIED" | "REJECTED",
    finalStatus?: string,
    finalRemarks?: string,
    reviewNotes?: string
  ) => {
    try {
      setError(null);
      setSuccessMessage(null);
      const reviewer = await ensureReviewerName();

      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId || targetDevice?.id,
          reviewer,
          action: "SINGLE",
          decision: {
            checkId,
            decision,
            finalStatus,
            finalRemarks,
            reviewNotes,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to record decision");
      }

      setSuccessMessage(json.data?.message || "Decision successfully recorded.");
      await fetchReviewData(selectedDeviceId || undefined);
      if (onReviewUpdated) onReviewUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    }
  };

  // 1-Click Approve finding
  const handleApprove = (item: ReviewCheckItem) => {
    const normEval = reviewService.normalizeStatus(item.proposedEvaluation.status);
    if ((normEval === "FAIL" || normEval === "WARNING" || item.requiresJustification) && !item.decision.reviewNotes) {
      setJustificationTarget({
        item,
        targetStatus:
          item.proposedEvaluation.status !== "PENDING"
            ? item.proposedEvaluation.status
            : item.originalDocument.status || "PASS",
      });
      return;
    }

    handleRecordDecision(
      item.checkId,
      "APPROVED",
      item.proposedEvaluation.status !== "PENDING"
        ? item.proposedEvaluation.status
        : item.originalDocument.status || "PASS",
      item.proposedEvaluation.proposedRemarks ?? item.originalDocument.remarks ?? ""
    );
  };

  // Status override
  const handleOverrideStatus = (item: ReviewCheckItem, newStatus: string) => {
    const normEval = reviewService.normalizeStatus(item.proposedEvaluation.status);
    const normTarget = reviewService.normalizeStatus(newStatus);
    const isOverridingFailWarnToPass = (normEval === "FAIL" || normEval === "WARNING") && normTarget === "PASS";
    const isOverridingToNa = normTarget === "NA" && normEval !== "NA";
    const isFailWarnRequiresJustification = (normEval === "FAIL" || normEval === "WARNING") && !item.decision.reviewNotes;

    if (isOverridingFailWarnToPass || isOverridingToNa || isFailWarnRequiresJustification) {
      setJustificationTarget({ item, targetStatus: newStatus });
      return;
    }

    handleRecordDecision(
      item.checkId,
      "MODIFIED",
      newStatus,
      item.decision.finalRemarks ||
        item.proposedEvaluation.proposedRemarks ||
        item.originalDocument.remarks ||
        "",
      item.decision.reviewNotes || undefined
    );
  };

  // Remarks update
  const handleUpdateRemarks = (item: ReviewCheckItem, newRemarks: string) => {
    handleRecordDecision(
      item.checkId,
      "MODIFIED",
      item.decision.finalStatus || item.proposedEvaluation.status || "PASS",
      newRemarks,
      item.decision.reviewNotes || undefined
    );
  };

  // Reject automated proposal (retain original Word values without automated replacement)
  const handleReject = (item: ReviewCheckItem) => {
    handleRecordDecision(
      item.checkId,
      "REJECTED",
      undefined,
      undefined,
      "Engineer rejected automated proposal. Retaining original Word report values."
    );
  };

  // Justification confirmation
  const handleConfirmJustification = (reviewNotes: string) => {
    if (!justificationTarget) return;
    const { item, targetStatus } = justificationTarget;

    handleRecordDecision(
      item.checkId,
      "MODIFIED",
      targetStatus,
      item.decision.finalRemarks ||
        item.proposedEvaluation.proposedRemarks ||
        item.originalDocument.remarks ||
        "",
      reviewNotes
    );
    setJustificationTarget(null);
  };

  // Safe Batch Approval: Strictly approves clean passing checks
  const handleBatchApprovePassing = async () => {
    try {
      setBatchActionLoading(true);
      setError(null);
      setSuccessMessage(null);
      const reviewer = await ensureReviewerName();

      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId || targetDevice?.id,
          reviewer,
          action: "APPROVE_PASSING",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Batch approval failed");
      }

      setSuccessMessage(json.data?.message || "Batch approval complete.");
      await fetchReviewData(selectedDeviceId || undefined);
      if (onReviewUpdated) onReviewUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run batch approval");
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Filtered Items computation
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.taskName.toLowerCase().includes(q) ||
          item.itemNumber.includes(q) ||
          item.sectionName.toLowerCase().includes(q) ||
          (item.proposedEvaluation.currentValue &&
            item.proposedEvaluation.currentValue.toLowerCase().includes(q)) ||
          (item.decision.finalRemarks && item.decision.finalRemarks.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Filter Mode
      if (filterMode === "NEEDS_ATTENTION") {
        return reviewService.isNeedsAttentionItem(item);
      }
      if (filterMode === "APPROVED") {
        return item.decision.decision === "APPROVED" || item.decision.decision === "MODIFIED";
      }
      if (filterMode === "DIFFS_ONLY") {
        return item.isDiffFromOriginal;
      }

      return true; // "ALL"
    });
  }, [items, filterMode, searchQuery]);

  return (
    <div id="inline-review-section" className="space-y-4 pt-2 scroll-mt-6">
      <Card className="border-slate-800 bg-[#070b14] shadow-md overflow-hidden">
        <CardHeader className="border-b border-slate-800 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base flex items-center gap-2 text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Checklist Findings &amp; Engineer Review</span>
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300 bg-emerald-950/40 text-[10px] font-mono"
                >
                  QMS-P09-F01 v1.1
                </Badge>
                {hasOriginalDoc && (
                  <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-[10px]">
                    Word Template Linked
                  </Badge>
                )}
              </div>
              <CardDescription className="text-slate-300 text-xs">
                Review findings inline, resolve exceptions, and approve changes before exporting to the CTC Word report.
              </CardDescription>
            </div>

            {/* Device Selector & Reviewer Name Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {allDevices.length > 1 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0c1222] px-2.5 py-1 text-xs">
                  <Server className="h-3.5 w-3.5 text-blue-400" />
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
                  >
                    {allDevices.map((d) => (
                      <option key={d.id} value={d.id} className="bg-[#070b14] text-white">
                        {d.hostname} {d.role ? `(${d.role})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0c1222] px-2.5 py-1 text-xs">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Reviewer Name"
                  value={engineerName}
                  onChange={(e) => setEngineerName(e.target.value)}
                  className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-36"
                  title="Engineer identity attached to all approved decisions"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchReviewData(selectedDeviceId || undefined)}
                disabled={loading}
                className="h-7 text-xs border-slate-700 text-slate-300 hover:text-white"
              >
                <RotateCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Notifications */}
          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick KPI & Action Ribbon */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c1222] border border-slate-800 rounded-xl p-3">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={filterMode === "NEEDS_ATTENTION" ? "primary" : "outline"}
                size="sm"
                onClick={() => setFilterMode("NEEDS_ATTENTION")}
                className={`h-7 text-xs font-semibold gap-1.5 ${
                  filterMode === "NEEDS_ATTENTION"
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : "border-slate-700 text-slate-300 hover:text-white"
                }`}
              >
                <AlertTriangle className="h-3 w-3 text-amber-300" />
                <span>Needs Attention</span>
                <span className="rounded-full bg-black/30 px-1.5 py-0.2 text-[10px]">
                  {summary?.needsAttentionCount ?? 0}
                </span>
              </Button>

              <Button
                variant={filterMode === "ALL" ? "primary" : "outline"}
                size="sm"
                onClick={() => setFilterMode("ALL")}
                className={`h-7 text-xs font-semibold ${
                  filterMode === "ALL"
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "border-slate-700 text-slate-300 hover:text-white"
                }`}
              >
                <span>All Checks</span>
                <span className="ml-1 text-[10px] text-slate-400">({summary?.total ?? items.length})</span>
              </Button>

              <Button
                variant={filterMode === "APPROVED" ? "primary" : "outline"}
                size="sm"
                onClick={() => setFilterMode("APPROVED")}
                className={`h-7 text-xs ${
                  filterMode === "APPROVED"
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    : "border-slate-700 text-slate-300 hover:text-white"
                }`}
              >
                <span>Approved</span>
                <span className="ml-1 text-[10px] text-slate-400">
                  ({(summary?.approved || 0) + (summary?.modified || 0)})
                </span>
              </Button>

              <Button
                variant={filterMode === "DIFFS_ONLY" ? "primary" : "outline"}
                size="sm"
                onClick={() => setFilterMode("DIFFS_ONLY")}
                className={`h-7 text-xs ${
                  filterMode === "DIFFS_ONLY"
                    ? "bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                    : "border-slate-700 text-slate-300 hover:text-white"
                }`}
              >
                <Sparkles className="h-3 w-3 text-purple-300 mr-1" />
                <span>Diffs</span>
                <span className="ml-1 text-[10px] text-slate-400">({summary?.diffsCount ?? 0})</span>
              </Button>
            </div>

            {/* Batch Approve Passing Action */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                size="sm"
                onClick={handleBatchApprovePassing}
                disabled={batchActionLoading || loading || (summary?.eligibleForBatchCount ?? 0) === 0}
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5 shadow-md shadow-emerald-950/40"
                title="Strictly approves deterministic passing checks with complete evidence and resolved device"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>
                  Approve Clean Passing ({summary?.eligibleForBatchCount ?? 0})
                </span>
              </Button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search checklist tasks, telemetry readings, or remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#040812] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Table Container */}
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-[#090e1a]/40 p-8 text-center space-y-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mx-auto" />
              <p className="text-xs text-slate-400">Loading checklist findings...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#090e1a]/40 p-8 text-center space-y-2">
              {filterMode === "NEEDS_ATTENTION" ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-emerald-300">
                    No checks require attention for this device!
                  </p>
                  <p className="text-[11px] text-slate-400">
                    All findings have either passed cleanly or been reviewed and approved.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilterMode("ALL")}
                    className="text-xs mt-2 border-slate-700"
                  >
                    View All {items.length} Checks
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-400">No checklist items match the current search or filter.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterMode("ALL");
                    }}
                    className="text-xs text-blue-400"
                  >
                    Reset Filter
                  </Button>
                </>
              )}
            </div>
          ) : (
            <ReviewTable
              items={filteredItems}
              hasOriginalDoc={hasOriginalDoc}
              compact={true}
              onApprove={handleApprove}
              onOverrideStatus={handleOverrideStatus}
              onUpdateRemarks={handleUpdateRemarks}
              onReject={handleReject}
              onRequestJustification={(item, targetStatus) =>
                setJustificationTarget({ item, targetStatus })
              }
              onViewEvidence={(evidence, taskName, item) =>
                setSelectedEvidence({ evidence, taskName, item })
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Evidence Viewer Modal */}
      {selectedEvidence && (
        <EvidenceModal
          evidence={selectedEvidence.evidence}
          evidenceList={selectedEvidence.item?.evidence || [selectedEvidence.evidence]}
          taskName={selectedEvidence.taskName}
          checkId={selectedEvidence.item?.checkId}
          sessionId={sessionId}
          devices={allDevices}
          onClose={() => setSelectedEvidence(null)}
          onEvidenceUpdated={() => fetchReviewData(selectedDeviceId || undefined)}
        />
      )}

      {/* Justification & Exception Dialog */}
      {justificationTarget && (
        <JustificationDialog
          item={justificationTarget.item}
          targetStatus={justificationTarget.targetStatus}
          onConfirm={handleConfirmJustification}
          onClose={() => setJustificationTarget(null)}
        />
      )}
    </div>
  );
}
