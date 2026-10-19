"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ListChecks,
  Terminal,
  GitFork,
  ShieldCheck,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Play,
  RotateCw,
  Server,
  Layers,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChecklistTable, ChecklistResultItem } from "./checklist-table";
import { CommandCollector } from "./command-collector";
import { MappingMatrix } from "./mapping-matrix";
import { VendorCheckItemDefinition, VendorCommandDefinition } from "@/vendors/types";

interface DeviceOption {
  id: string;
  hostname: string;
  model?: string | null;
  role?: string | null;
  haStatus?: string | null;
}

interface ChecklistWorkspaceProps {
  sessionId?: string;
  vendorId?: string;
  devices?: DeviceOption[];
  initialItems?: VendorCheckItemDefinition[];
  initialCommands?: VendorCommandDefinition[];
  customerName?: string;
  vendorName?: string;
  onEvaluationComplete?: () => void;
}

export function ChecklistWorkspace({
  sessionId,
  vendorId = "fortigate",
  devices = [],
  initialItems,
  initialCommands,
  customerName,
  vendorName = "Fortinet FortiGate",
  onEvaluationComplete,
}: ChecklistWorkspaceProps) {
  const [items, setItems] = useState<VendorCheckItemDefinition[]>(initialItems || []);
  const [commands, setCommands] = useState<VendorCommandDefinition[]>(initialCommands || []);
  const [resolvedVendorName, setResolvedVendorName] = useState(vendorName);
  const [guideLoading, setGuideLoading] = useState(!initialItems || !initialCommands);
  const [activeTab, setActiveTab] = useState<"checklist" | "commands" | "matrix">(
    "checklist"
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    devices[0]?.id || ""
  );
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalSuccess, setEvalSuccess] = useState<string | null>(null);
  const [resultsMap, setResultsMap] = useState<Record<string, ChecklistResultItem>>({});

  useEffect(() => {
    let mounted = true;
    async function loadGuide() {
      if (initialItems && initialCommands) {
        setItems(initialItems);
        setCommands(initialCommands);
        setGuideLoading(false);
        return;
      }
      setGuideLoading(true);
      try {
        const [checklistResponse, commandResponse] = await Promise.all([
          fetch(`/api/vendors/${vendorId}/checklist`),
          fetch(`/api/vendors/${vendorId}/commands`),
        ]);
        const [checklistData, commandData] = await Promise.all([
          checklistResponse.json(),
          commandResponse.json(),
        ]);
        if (!checklistResponse.ok || !checklistData.success || !commandResponse.ok || !commandData.success) {
          throw new Error(checklistData.error || commandData.error || "Failed to load vendor guide");
        }
        if (mounted) {
          setItems(checklistData.data.items || []);
          setCommands(commandData.data.commands || []);
          setResolvedVendorName(commandData.data.displayName || vendorName);
        }
      } catch (error) {
        if (mounted) setEvalError(error instanceof Error ? error.message : "Failed to load vendor guide");
      } finally {
        if (mounted) setGuideLoading(false);
      }
    }
    void loadGuide();
    return () => { mounted = false; };
  }, [vendorId, initialItems, initialCommands, vendorName]);

  const currentDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];

  // Fetch evaluated checklist results from API
  const fetchResults = useCallback(async (devId?: string) => {
    if (!sessionId) return;
    const targetDevId = devId || selectedDeviceId;
    try {
      const url = targetDevId
        ? `/api/sessions/${sessionId}/evaluate?deviceId=${targetDevId}`
        : `/api/sessions/${sessionId}/evaluate`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data?.devices) {
        const dev = json.data.devices.find((d: { id: string }) => d.id === targetDevId) || json.data.devices[0];
        if (dev?.results) {
          const map: Record<string, ChecklistResultItem> = {};
          for (const r of dev.results) {
            map[r.checkId] = r;
          }
          setResultsMap(map);
        }
      }
    } catch (err) {
      console.error("Failed to fetch evaluation results:", err);
    }
  }, [sessionId, selectedDeviceId]);

  useEffect(() => {
    if (sessionId && selectedDeviceId) {
      fetchResults(selectedDeviceId);
    }
  }, [sessionId, selectedDeviceId, fetchResults]);

  // Trigger evaluation
  const handleEvaluate = async () => {
    if (!sessionId) return;
    setEvaluating(true);
    setEvalError(null);
    setEvalSuccess(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Evaluation failed");
      }

      setEvalSuccess(
        `Successfully evaluated checklist for ${json.data.devicesEvaluated} device(s).`
      );
      await fetchResults(selectedDeviceId);
      onEvaluationComplete?.();
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Failed to run evaluation");
    } finally {
      setEvaluating(false);
    }
  };

  // Metrics counts
  const resultsArray = Object.values(resultsMap);
  const hasEvaluated = resultsArray.length > 0;
  const passCount = resultsArray.filter((r) => r.status === "PASS").length;
  const failCount = resultsArray.filter((r) => r.status === "FAIL").length;
  const warnCount = resultsArray.filter((r) => r.status === "WARNING").length;
  const naCount = resultsArray.filter((r) => r.status === "NA").length;
  const reviewCount = resultsArray.filter((r) => r.status === "REVIEW").length;
  const pendingCount = items.length - passCount - failCount - warnCount - naCount - reviewCount;

  return (
    <div className="space-y-6">
      {/* Top Banner & Device Switcher */}
      {sessionId && devices.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#070b14] border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">Target Firewall:</span>
                {devices.length > 1 ? (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="rounded-md border border-slate-700 bg-[#0c1222] px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id} className="bg-[#0c1222]">
                        {d.hostname} {d.role ? `(${d.role})` : ""} {d.model ? `- ${d.model}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold text-sm text-white">
                    {currentDevice?.hostname || "Firewall"}
                  </span>
                )}
                {currentDevice?.model && (
                  <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 bg-slate-900/60">
                    {currentDevice.model}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Deterministic rule evaluation processes parsed PuTTY logs against CTC QMS-P09-F01 standards.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <Button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-900/40"
            >
              {evaluating ? (
                <>
                  <RotateCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Evaluating Rules...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
                  Evaluate Checklist Rules
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Notifications */}
      {evalSuccess && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{evalSuccess}</span>
        </div>
      )}

      {evalError && (
        <div className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{evalError}</span>
        </div>
      )}

      {guideLoading && (
        <div className="rounded-lg border border-slate-800 bg-[#0c1222] p-3 text-xs text-slate-300">
          Loading {vendorName} maintenance guide...
        </div>
      )}

      {/* Metrics & Overview Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-3.5 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5 text-blue-400" />
            Total Checks
          </span>
          <p className="text-2xl font-bold font-mono text-white">
            {items.length}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">
            CTC QMS-P09-F01
          </span>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-[#031c13] p-3.5 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Passed
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-300">
            {hasEvaluated ? passCount : "-"}
          </p>
          <span className="text-[10px] text-emerald-400/90 font-medium">
            Within threshold
          </span>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-[#1a080d] p-3.5 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            Failed
          </span>
          <p className="text-2xl font-bold font-mono text-rose-300">
            {hasEvaluated ? failCount : "-"}
          </p>
          <span className="text-[10px] text-rose-400/90 font-medium">
            Requires action
          </span>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-[#1a1104] p-3.5 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            Warnings
          </span>
          <p className="text-2xl font-bold font-mono text-amber-300">
            {hasEvaluated ? warnCount : "-"}
          </p>
          <span className="text-[10px] text-amber-400/90 font-medium">
            e.g. License &le;30d
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-3.5 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            N/A / Review
          </span>
          <p className="text-2xl font-bold font-mono text-slate-200">
            {hasEvaluated ? naCount + reviewCount : "-"}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">
            Diskless / Standalone
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-3.5 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            Pending / Logs
          </span>
          <p className="text-2xl font-bold font-mono text-slate-200">
            {hasEvaluated ? pendingCount : items.length}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">
            Awaiting log parse
          </span>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("checklist")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "checklist"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-300 hover:text-white hover:border-slate-700"
          }`}
        >
          <ListChecks className="h-4 w-4" />
          <span>PM Checklist &amp; Evaluation ({items.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("commands")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "commands"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-300 hover:text-white hover:border-slate-700"
          }`}
        >
          <Terminal className="h-4 w-4" />
          <span>Approved CLI Commands ({commands.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("matrix")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "matrix"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-300 hover:text-white hover:border-slate-700"
          }`}
        >
          <GitFork className="h-4 w-4" />
          <span>Command Mapping Matrix</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "checklist" && (
        <ChecklistTable
          items={items}
          commands={commands}
          resultsMap={resultsMap}
          selectedDeviceHostname={currentDevice?.hostname}
        />
      )}

      {activeTab === "commands" && (
        <CommandCollector commands={commands} vendorId={vendorId} vendorName={resolvedVendorName} />
      )}

      {activeTab === "matrix" && (
        <MappingMatrix commands={commands} items={items} />
      )}
    </div>
  );
}
