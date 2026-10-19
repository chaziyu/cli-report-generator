"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Server,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Sparkles,
  RotateCw,
  Search,
  Filter,
  CheckCheck,
  Edit2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  FileText,
  User,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewTable } from "./review-table";
import { EvidenceModal } from "./evidence-modal";
import { JustificationDialog } from "./justification-dialog";
import { ReportExportModal } from "./report-export-modal";
import {
  reviewService,
  ReviewCheckItem,
  ReviewEvidenceSummary,
  ReviewSessionSummary,
} from "@/core/review";

interface DeviceOption {
  id: string;
  hostname: string;
  model?: string | null;
  role?: string | null;
}

interface ReviewWorkspaceProps {
  sessionId: string;
}

export function ReviewWorkspace({ sessionId }: ReviewWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review state
  const [items, setItems] = useState<ReviewCheckItem[]>([]);
  const [summary, setSummary] = useState<ReviewSessionSummary | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [engineerName, setEngineerName] = useState("");
  const [hasOriginalDoc, setHasOriginalDoc] = useState(false);
  const [originalDocFilename, setOriginalDocFilename] = useState<string | null>(null);
  const [targetDevice, setTargetDevice] = useState<DeviceOption | null>(null);
  const [allDevices, setAllDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sectionFilter, setSectionFilter] = useState<string>("ALL");
  const [showDiffsOnly, setShowDiffsOnly] = useState(false);

  // Modals state
  const [selectedEvidence, setSelectedEvidence] = useState<{
    evidence: ReviewEvidenceSummary;
    taskName: string;
  } | null>(null);
  const [justificationTarget, setJustificationTarget] = useState<{
    item: ReviewCheckItem;
    targetStatus: string;
  } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Batch action in progress
  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Fetch review data from API
  const fetchReviewData = useCallback(async (devId?: string) => {
    try {
      setLoading(true);
      setError(null);
      const url = devId
        ? `/api/sessions/${sessionId}/review?deviceId=${devId}`
        : `/api/sessions/${sessionId}/review`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load review data");
      }

      const data = json.data;
      setItems(data.items);
      setSummary(data.summary);
      setCustomerName(data.customer);
      setVendorName(data.vendor);
      setEngineerName(data.engineerName || "");
      setHasOriginalDoc(data.hasOriginalDocument);
      setOriginalDocFilename(data.originalDocumentFilename);
      setTargetDevice(data.targetDevice);
      setAllDevices(data.allDevices || []);
      if (!selectedDeviceId) {
        setSelectedDeviceId(data.targetDevice?.id || "");
      }
    } catch (err) {
      console.error("Failed to load review data:", err);
      setError(err instanceof Error ? err.message : "Error loading review data");
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedDeviceId]);

  useEffect(() => {
    fetchReviewData(selectedDeviceId || undefined);
  }, [sessionId, selectedDeviceId, fetchReviewData]);

  // Handle single decision
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

      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId || targetDevice?.id,
          reviewer: engineerName || "Lead Security Engineer",
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

      setSuccessMessage(json.data?.message || "Decision successfully recorded in database.");
      await fetchReviewData(selectedDeviceId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    }
  };

  // Quick 1-click Approve
  const handleApprove = (item: ReviewCheckItem) => {
    const normEval = reviewService.normalizeStatus(item.proposedEvaluation.status);
    if ((normEval === "FAIL" || normEval === "WARNING" || item.requiresJustification) && !item.decision.reviewNotes) {
      setJustificationTarget({
        item,
        targetStatus: item.proposedEvaluation.status !== "PENDING" ? item.proposedEvaluation.status : item.originalDocument.status || "PASS",
      });
      return;
    }

    handleRecordDecision(
      item.checkId,
      "APPROVED",
      item.proposedEvaluation.status !== "PENDING" ? item.proposedEvaluation.status : item.originalDocument.status || "PASS",
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
      item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || "",
      item.decision.reviewNotes || undefined
    );
  };

  // Update remarks
  const handleUpdateRemarks = (item: ReviewCheckItem, newRemarks: string) => {
    handleRecordDecision(
      item.checkId,
      "MODIFIED",
      item.decision.finalStatus || item.proposedEvaluation.status || item.originalDocument.status || "PASS",
      newRemarks,
      item.decision.reviewNotes || undefined
    );
  };

  // Reject proposal (keeps original Word document value)
  const handleReject = (item: ReviewCheckItem) => {
    handleRecordDecision(
      item.checkId,
      "REJECTED",
      undefined,
      undefined,
      "Engineer rejected automated proposal. Retaining original Word document values."
    );
  };

  // Justification dialog confirm
  const handleConfirmJustification = (reviewNotes: string) => {
    if (!justificationTarget) return;
    const { item, targetStatus } = justificationTarget;

    handleRecordDecision(
      item.checkId,
      "MODIFIED",
      targetStatus,
      item.decision.finalRemarks || item.proposedEvaluation.proposedRemarks || item.originalDocument.remarks || "",
      reviewNotes
    );
    setJustificationTarget(null);
  };

  // Batch Approve All Clean Checks
  const handleBatchApprovePassing = async () => {
    try {
      setBatchActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId || targetDevice?.id,
          reviewer: engineerName || "Lead Security Engineer",
          action: "APPROVE_PASSING",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Batch approval failed");
      }

      setSuccessMessage(json.data?.message || "Batch approved passing checks.");
      await fetchReviewData(selectedDeviceId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run batch approval");
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Batch Approve All (with default justification for any exceptions)
  const handleBatchApproveAll = async () => {
    const defaultJustification = window.prompt(
      "Enter default justification for any checks with warnings, failures, or missing evidence (or leave empty to skip them):",
      "Audited and approved by CTC lead security engineer for preventive maintenance report."
    );

    try {
      setBatchActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId || targetDevice?.id,
          reviewer: engineerName || "Lead Security Engineer",
          action: "APPROVE_ALL",
          defaultJustification: defaultJustification?.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Batch approval failed");
      }

      setSuccessMessage(json.data?.message || "Batch approval complete.");
      await fetchReviewData(selectedDeviceId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run batch approval");
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Filter items
  const sections = ["ALL", ...Array.from(new Set(items.map((i) => i.sectionName)))];

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchQuery === "" ||
      item.taskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemNumber.includes(searchQuery) ||
      (item.originalDocument.remarks && item.originalDocument.remarks.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.proposedEvaluation.proposedRemarks && item.proposedEvaluation.proposedRemarks.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.decision.finalRemarks && item.decision.finalRemarks.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSection = sectionFilter === "ALL" || item.sectionName === sectionFilter;

    let matchesStatus = true;
    if (statusFilter === "PENDING") matchesStatus = item.decision.decision === "PENDING";
    else if (statusFilter === "APPROVED") matchesStatus = item.decision.decision === "APPROVED";
    else if (statusFilter === "MODIFIED") matchesStatus = item.decision.decision === "MODIFIED";
    else if (statusFilter === "REJECTED") matchesStatus = item.decision.decision === "REJECTED";
    else if (statusFilter === "WARNINGS_FAILURES") {
      const evalStatus = item.proposedEvaluation.status.toUpperCase();
      matchesStatus = evalStatus === "FAIL" || evalStatus === "WARNING" || item.requiresJustification;
    }

    const matchesDiff = !showDiffsOnly || item.isDiffFromOriginal;

    return matchesSearch && matchesSection && matchesStatus && matchesDiff;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: Device Switcher & Reviewer Meta */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Phase 8 · Engineer Review &amp; Approval
            </span>
            <Badge variant="outline" className="text-[10px] text-slate-400">
              {vendorName === "fortigate" ? "QMS-P09-F01 v1.1" : "Vendor PM Guide"}
            </Badge>
            {hasOriginalDoc && (
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                <FileCheck className="h-3 w-3" />
                {originalDocFilename || "Word Report Attached"}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>{customerName || "Preventive Maintenance"}</span>
            <span className="text-slate-600 font-light">/</span>
            <span className="text-slate-300 font-mono text-base">
              {targetDevice?.hostname || "Firewall"}
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Compare original Word values vs. automated PuTTY CLI findings. Approved decisions persist in SQLite for report generation.
          </p>
        </div>

        {/* Device Switcher & Reviewer Input */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {allDevices.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Server className="h-4 w-4 text-emerald-400" />
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
              >
                {allDevices.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                    {d.hostname} {d.role ? `(${d.role})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <User className="h-4 w-4 text-blue-400" />
            <input
              type="text"
              placeholder="Lead Engineer Name"
              value={engineerName}
              onChange={(e) => setEngineerName(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-36 sm:w-44"
              title="Reviewer name recorded on each approval"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReviewData(selectedDeviceId || undefined)}
            disabled={loading}
            className="gap-1.5 text-xs text-slate-300 border-slate-700 hover:bg-slate-800"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Summary Cards Ribbon */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-400" />
              Total Checks
            </span>
            <p className="text-2xl font-bold font-mono text-white">
              {summary.total}
            </p>
            <span className="text-[10px] text-slate-500">
              PM Guide Items
            </span>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-[#031c13] p-3.5 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Approved
            </span>
            <p className="text-2xl font-bold font-mono text-emerald-300">
              {summary.approved}
            </p>
            <span className="text-[10px] text-emerald-400/90 font-medium">
              Ready for Word export
            </span>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-[#06142a] p-3.5 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-blue-400 flex items-center gap-1.5">
              <Edit2 className="h-3.5 w-3.5 text-blue-400" />
              Modified
            </span>
            <p className="text-2xl font-bold font-mono text-blue-300">
              {summary.modified}
            </p>
            <span className="text-[10px] text-blue-400/90 font-medium">
              Overridden / Remarks
            </span>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-[#1a080d] p-3.5 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-rose-400" />
              Rejected
            </span>
            <p className="text-2xl font-bold font-mono text-rose-300">
              {summary.rejected}
            </p>
            <span className="text-[10px] text-rose-400/90 font-medium">
              Keeps original doc
            </span>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-[#150a22] p-3.5 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-purple-400 flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-purple-400" />
              Pending
            </span>
            <p className="text-2xl font-bold font-mono text-purple-300">
              {summary.pending}
            </p>
            <span className="text-[10px] text-purple-400/90 font-medium">
              Awaiting sign-off
            </span>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-[#1a1104] p-3.5 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Warnings / Fail
            </span>
            <p className="text-2xl font-bold font-mono text-amber-300">
              {summary.warnings + summary.failures}
            </p>
            <span className="text-[10px] text-amber-400/90 font-medium">
              Justification needed
            </span>
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-[#0c1222] p-3.5 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-slate-200 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Report Diffs
            </span>
            <p className="text-2xl font-bold font-mono text-white">
              {summary.diffsCount}
            </p>
            <span className="text-[10px] text-slate-400 font-medium">
              Updated from Word doc
            </span>
          </div>
        </div>
      )}

      {/* Batch Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#070b14] border border-slate-800 rounded-xl p-3.5 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleBatchApprovePassing}
            disabled={batchActionLoading || loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-900/30 gap-1.5"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Approve All Passing Checks</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchApproveAll}
            disabled={batchActionLoading || loading}
            className="text-xs text-slate-200 border-slate-700 bg-[#0c1222] hover:bg-slate-800 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>Approve All (with Justification)</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-900/40 gap-1.5 ml-0 sm:ml-2"
          >
            <FileCheck className="h-4 w-4" />
            <span>Export Word Report (Phase 9)</span>
            {summary && summary.approved + summary.modified > 0 && (
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {summary.approved + summary.modified} approved
              </span>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 self-end sm:self-auto">
          <span>Target Report Phase:</span>
          <Link
            href={`/sessions/${sessionId}`}
            className="text-blue-400 hover:text-blue-300 underline font-medium"
          >
            Session Overview →
          </Link>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#070b14] border border-slate-800 rounded-xl p-3 shadow-md">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search task, item number, remarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-[#040812] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
          />
        </div>

        {/* Filter Pills & Section Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center rounded-lg border border-slate-700 bg-[#040812] p-0.5 text-[11px]">
            {[
              { id: "ALL", label: "All" },
              { id: "PENDING", label: "Pending" },
              { id: "APPROVED", label: "Approved" },
              { id: "MODIFIED", label: "Modified" },
              { id: "REJECTED", label: "Rejected" },
              { id: "WARNINGS_FAILURES", label: "Action Needed" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-slate-300 hover:text-white font-medium"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Section Dropdown */}
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-[#040812] px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {sections.map((sec) => (
              <option key={sec} value={sec} className="bg-[#0c1222] text-white">
                {sec === "ALL" ? "All Sections" : sec}
              </option>
            ))}
          </select>

          {/* Show Diffs Only Toggle */}
          <button
            type="button"
            onClick={() => setShowDiffsOnly(!showDiffsOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              showDiffsOnly
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold"
                : "border-slate-700 bg-[#040812] text-slate-300 hover:text-white"
            }`}
          >
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span>Diffs Only</span>
          </button>
        </div>
      </div>

      {/* Review Table */}
      {loading ? (
        <Card className="border-slate-800 bg-slate-950/40 p-12 text-center">
          <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm font-medium">Loading review and comparison data...</p>
          </div>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card className="border-dashed border-slate-800 bg-slate-950/40 p-12 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-300">No checklist items match current filters</p>
          <p className="text-xs text-slate-500">
            Try resetting search query or clearing status filters to view all 21 checklist items.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("ALL");
              setSectionFilter("ALL");
              setShowDiffsOnly(false);
            }}
            className="mt-2 text-xs"
          >
            Reset Filters
          </Button>
        </Card>
      ) : (
        <ReviewTable
          items={filteredItems}
          hasOriginalDoc={hasOriginalDoc}
          onApprove={handleApprove}
          onOverrideStatus={handleOverrideStatus}
          onUpdateRemarks={handleUpdateRemarks}
          onReject={handleReject}
          onRequestJustification={(item, targetStatus) =>
            setJustificationTarget({ item, targetStatus })
          }
          onViewEvidence={(evidence, taskName) =>
            setSelectedEvidence({ evidence, taskName })
          }
        />
      )}

      {/* Evidence Viewer Modal */}
      {selectedEvidence && (
        <EvidenceModal
          evidence={selectedEvidence.evidence}
          taskName={selectedEvidence.taskName}
          checkId={selectedEvidence.evidence.checkId || undefined}
          sessionId={sessionId}
          devices={allDevices}
          availableTasks={items.map((item) => ({
            id: item.checkId,
            taskName: item.taskName,
            targetAppendix: item.targetAppendix,
          }))}
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

      {/* Report Export Modal */}
      {showExportModal && (
        <ReportExportModal
          sessionId={sessionId}
          deviceId={selectedDeviceId || targetDevice?.id}
          customerName={customerName}
          deviceHostname={targetDevice?.hostname}
          approvedCount={(summary?.approved || 0) + (summary?.modified || 0)}
          totalChecks={summary?.total || items.length}
          hasOriginalDoc={hasOriginalDoc}
          originalDocFilename={originalDocFilename}
          onClose={() => setShowExportModal(false)}
          onExportSuccess={() => fetchReviewData(selectedDeviceId || undefined)}
        />
      )}
    </div>
  );
}
