"use client";

import { useState } from "react";
import {
  Terminal,
  Monitor,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MinusCircle,
  Clock,
  HelpCircle,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VendorCheckItemDefinition, VendorCommandDefinition } from "@/vendors/types";

export interface ChecklistResultItem {
  id?: string;
  checkId: string;
  checkName: string;
  sectionName?: string | null;
  targetAppendix?: string | null;
  collectionState: string;
  status: string; // PASS, FAIL, WARNING, NA, REVIEW, PENDING
  currentValue?: string | null;
  expectedValue?: string | null;
  remarks?: string | null;
  reviewRequired?: boolean;
}

interface ChecklistTableProps {
  items: VendorCheckItemDefinition[];
  commands: VendorCommandDefinition[];
  resultsMap?: Record<string, ChecklistResultItem>;
  selectedDeviceHostname?: string;
}

export function ChecklistTable({
  items,
  commands,
  resultsMap = {},
  selectedDeviceHostname,
}: ChecklistTableProps) {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedSourceType, setSelectedSourceType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const groups = ["ALL", ...Array.from(new Set(items.map((i) => i.group)))];

  const filteredItems = items.filter((item) => {
    const result = resultsMap[item.id];
    const status = result?.status || "PENDING";

    const matchesSource =
      selectedSourceType === "ALL" || item.sourceType === selectedSourceType;
    const matchesGroup =
      selectedGroup === "ALL" || item.group === selectedGroup;
    const matchesStatus =
      selectedStatus === "ALL" || status === selectedStatus;
    const matchesSearch =
      searchQuery === "" ||
      item.taskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.itemNumber && item.itemNumber.includes(searchQuery)) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (result?.remarks && result.remarks.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSource && matchesGroup && matchesStatus && matchesSearch;
  });

  const commandMap = new Map<string, VendorCommandDefinition>();
  for (const cmd of commands) {
    commandMap.set(cmd.id, cmd);
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "PASS":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            PASS
          </span>
        );
      case "FAIL":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 border border-rose-500/40 px-2.5 py-1 text-xs font-bold text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            FAIL
          </span>
        );
      case "WARNING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            WARNING
          </span>
        );
      case "NA":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-800/80 border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
            <MinusCircle className="h-3.5 w-3.5 text-slate-400" />
            N/A
          </span>
        );
      case "REVIEW":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/15 border border-purple-500/30 px-2.5 py-1 text-xs font-semibold text-purple-300">
            <HelpCircle className="h-3.5 w-3.5 text-purple-400" />
            REVIEW
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            PENDING
          </span>
        );
    }
  };

  const getSourceBadge = (type: "CLI" | "GUI_MANUAL" | "EXTERNAL_REFERENCE") => {
    switch (type) {
      case "CLI":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-400">
            <Terminal className="h-3 w-3" />
            CLI Output
          </span>
        );
      case "GUI_MANUAL":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-400">
            <Monitor className="h-3 w-3" />
            GUI / Manual
          </span>
        );
      case "EXTERNAL_REFERENCE":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            <ExternalLink className="h-3 w-3" />
            Portal Reference
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtering Bar */}
      <div className="flex flex-col gap-3 bg-[#070b14] border border-slate-800 rounded-xl p-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Source Type & Status Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Source Type Pills */}
            <div className="flex items-center gap-1 bg-[#040812] p-1 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setSelectedSourceType("ALL")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  selectedSourceType === "ALL"
                    ? "bg-slate-800 text-white font-semibold shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedSourceType("CLI")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  selectedSourceType === "CLI"
                    ? "bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40 shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Terminal className="h-3 w-3" />
                CLI ({items.filter((i) => i.sourceType === "CLI").length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedSourceType("GUI_MANUAL")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  selectedSourceType === "GUI_MANUAL"
                    ? "bg-purple-600/30 text-purple-300 font-semibold border border-purple-500/40 shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Monitor className="h-3 w-3" />
                GUI / Manual ({items.filter((i) => i.sourceType === "GUI_MANUAL").length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedSourceType("EXTERNAL_REFERENCE")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  selectedSourceType === "EXTERNAL_REFERENCE"
                    ? "bg-amber-600/30 text-amber-300 font-semibold border border-amber-500/40 shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <ExternalLink className="h-3 w-3" />
                External ({items.filter((i) => i.sourceType === "EXTERNAL_REFERENCE").length})
              </button>
            </div>

            {/* Group Filter Dropdown */}
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="rounded-lg border border-slate-700 bg-[#040812] px-3 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-blue-500"
            >
              {groups.map((group) => (
                <option key={group} value={group} className="bg-[#0c1222] text-white">
                  {group === "ALL" ? "All Report Sections" : group}
                </option>
              ))}
            </select>
          </div>

          {/* Keyword Search */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search task, check ID, section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Status Filter Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60 text-xs">
          <span className="text-[11px] font-medium text-slate-500 mr-1">
            Status Filter:
          </span>
          {[
            { id: "ALL", label: "All Statuses" },
            { id: "PASS", label: "PASS" },
            { id: "FAIL", label: "FAIL" },
            { id: "WARNING", label: "WARNING" },
            { id: "NA", label: "N/A" },
            { id: "REVIEW", label: "REVIEW" },
            { id: "PENDING", label: "PENDING" },
          ].map((st) => {
            const count =
              st.id === "ALL"
                ? items.length
                : items.filter((i) => (resultsMap[i.id]?.status || "PENDING") === st.id).length;
            const isSelected = selectedStatus === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  isSelected
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-slate-950 border border-slate-800/80 text-slate-400 hover:text-slate-200"
                }`}
              >
                {st.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {filteredItems.map((item) => {
          const isExpanded = expandedId === item.id;
          const result = resultsMap[item.id];
          const mappedCommands = item.commands
            .map((cmdId) => commandMap.get(cmdId))
            .filter((c): c is VendorCommandDefinition => Boolean(c));

          return (
            <div
              key={item.id}
              className={`rounded-xl border transition-all overflow-hidden shadow-sm ${
                result?.status === "FAIL"
                  ? "border-rose-500/40 bg-[#17070b] hover:border-rose-500/60"
                  : result?.status === "WARNING"
                  ? "border-amber-500/40 bg-[#160f04] hover:border-amber-500/60"
                  : result?.status === "PASS"
                  ? "border-slate-800 bg-[#0c1222] hover:border-slate-700"
                  : "border-slate-800 bg-[#0c1222] hover:bg-[#0f172a] hover:border-slate-700"
              }`}
            >
              {/* Row Header */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center justify-center shrink-0 w-11 h-11 rounded-lg bg-[#070b14] border border-slate-700 font-mono text-xs font-bold text-blue-400">
                    {item.itemNumber || "•"}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-white">
                        {item.taskName}
                      </span>
                      {getSourceBadge(item.sourceType)}
                      <span className="text-[10px] font-mono text-slate-500">
                        {item.id}
                      </span>
                      {getStatusBadge(result?.status)}
                      {result?.reviewRequired && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          Review Req.
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Evaluated Value & Findings Ribbon */}
                    {result && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                        {result.currentValue && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-200">
                            <span className="text-slate-500">Observed:</span>{" "}
                            <span className="font-semibold text-emerald-400">
                              {result.currentValue}
                            </span>
                          </span>
                        )}
                        {result.remarks && (
                          <span className="text-[11px] text-slate-300 italic">
                            &ldquo;{result.remarks}&rdquo;
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
                      <span className="rounded bg-slate-800/80 px-2 py-0.5 text-slate-300 font-medium">
                        Section: {item.targetSection}
                      </span>
                      {(item.evidenceRequired || item.targetAppendix || item.sourceType === "CLI") && (
                        <span className="rounded bg-violet-950/70 px-2 py-0.5 text-violet-200 border border-violet-500/30">
                          Evidence required: {item.sourceType === "GUI_MANUAL" ? "GUI/manual" : item.sourceType === "EXTERNAL_REFERENCE" ? "external reference" : "CLI"}
                        </span>
                      )}
                      {item.targetAppendix && (
                        <span className="rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 font-mono text-[10px]">
                          {item.targetAppendix}
                        </span>
                      )}
                      {item.guideSource && (
                        <span className="rounded bg-slate-950/70 px-2 py-0.5 text-[10px] text-slate-300 border border-slate-800">
                          Guide source: {item.guideSource.document}, row {item.guideSource.tableRow}{item.guideSource.page ? `, page ${item.guideSource.page}` : ""}
                        </span>
                      )}
                      {item.thresholdDescription && (
                        <span className="text-emerald-400/90 font-mono text-[10px]">
                          Target: {item.thresholdDescription}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <span>{isExpanded ? "Hide Details" : "View Instructions"}</span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable Details Drawer */}
              {isExpanded && (
                <div className="border-t border-slate-800 bg-slate-950/70 p-4 space-y-3.5 text-xs">
                  {/* Evaluation Result Details */}
                  {result && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                          Deterministic Rule Evaluation Findings
                        </span>
                        {getStatusBadge(result.status)}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block">Current Extracted Value:</span>
                          <span className="text-white font-semibold">{result.currentValue || "N/A"}</span>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block">Expected Threshold:</span>
                          <span className="text-slate-300">{result.expectedValue || item.thresholdDescription || "N/A"}</span>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block">Collection State:</span>
                          <span className="text-blue-300">{result.collectionState}</span>
                        </div>
                      </div>
                      {result.remarks && (
                        <div className="text-xs text-slate-300 pt-1 font-sans">
                          <span className="text-slate-500 font-medium">Remarks: </span>
                          {result.remarks}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collection Instructions */}
                  {(item.collectionInstructions || item.evaluationPolicy) && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-1.5">
                      <h5 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <Sliders className="h-3.5 w-3.5 text-blue-400" />
                        Evidence &amp; Evaluation Guidance
                      </h5>
                      {item.collectionInstructions && <p className="text-xs text-slate-300 leading-relaxed font-sans">{item.collectionInstructions}</p>}
                      {item.evaluationPolicy && <p className="text-xs text-slate-300 leading-relaxed font-sans"><span className="font-semibold text-slate-200">Evaluation: </span>{item.evaluationPolicy}</p>}
                    </div>
                  )}

                  {/* Associated CLI Commands */}
                  {mappedCommands.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Approved Command ({mappedCommands.length}):
                      </span>
                      <div className="space-y-1.5">
                        {mappedCommands.map((cmd) => {
                          const isCopied = copiedCmd === `${item.id}-${cmd.id}`;
                          return (
                            <div
                              key={cmd.id}
                              className="rounded-lg border border-slate-800/80 bg-slate-950 p-2 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs font-mono">
                                <div className="flex items-center gap-2 overflow-hidden">
                                <Terminal className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span className="text-emerald-400 font-semibold truncate select-all">
                                  {cmd.command}
                                </span>
                                {cmd.isReadOnly ? (
                                  <Badge variant="success" className="text-[9px] py-0">Read-Only</Badge>
                                ) : (
                                  <Badge variant="warning" className="text-[9px] py-0">Engineer-Controlled</Badge>
                                )}
                                {cmd.contextVerification === "VERIFY_REQUIRED" && (
                                  <Badge variant="warning" className="text-[9px] py-0">Verify CLI mode</Badge>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(cmd.command, `${item.id}-${cmd.id}`)
                                }
                                className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                                  isCopied
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                                }`}
                                title="Copy command"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-slate-400" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              </div>
                              {(cmd.executionContext || cmd.notes) && (
                              <p className="ml-6 text-[11px] text-amber-200">
                                {cmd.executionContext ? `Execution context: ${cmd.executionContext}. ` : ""}{cmd.notes}
                              </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Status Options Preview */}
                  {item.expectedStatusOptions && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-slate-500 font-medium">
                        Allowed Report Statuses:
                      </span>
                      <div className="flex items-center gap-1">
                        {item.expectedStatusOptions.map((opt) => (
                          <span
                            key={opt}
                            className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 font-mono"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center text-xs text-slate-500">
            No checklist items match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

