"use client";

import { useState } from "react";
import {
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  FileCode,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VendorCommandDefinition } from "@/vendors/types";
import { generateFortiGateCollectionScript } from "@/vendors/fortigate/commands";

interface CommandCollectorProps {
  commands: VendorCommandDefinition[];
  vendorId?: string;
  vendorName?: string;
}

export function CommandCollector({ commands, vendorId = "fortigate", vendorName = "Fortinet FortiGate" }: CommandCollectorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptPreview, setShowScriptPreview] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const groups = ["ALL", ...Array.from(new Set(commands.map((c) => c.group)))];

  const filteredCommands = commands.filter((cmd) => {
    const matchesGroup =
      selectedGroup === "ALL" ||
      cmd.group.toLowerCase() === selectedGroup.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.group.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const fullScript = vendorId === "fortigate" ? generateFortiGateCollectionScript(commands) : "";

  const handleCopyCommand = (cmd: VendorCommandDefinition) => {
    navigator.clipboard.writeText(cmd.command);
    setCopiedId(cmd.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(fullScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Collection Instructions and Script Copy */}
      <div className="rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-purple-950/30 p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 border border-blue-500/30 px-2.5 py-0.5 text-xs font-semibold text-blue-300">
                <Terminal className="h-3 w-3 text-blue-400" />
                {vendorId === "fortigate" ? "PuTTY Collection Script" : "Individual PuTTY Commands"}
              </span>
              {commands.some((cmd) => !cmd.isReadOnly || cmd.engineerControlled || cmd.contextVerification === "VERIFY_REQUIRED") ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
                  <ShieldCheck className="h-3 w-3" />
                  Engineer checks required
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  Guide commands
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-white">
              {vendorName} PM CLI Commands
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Customer personnel run each guide command in PuTTY with session logging enabled (
              <span className="text-blue-300 font-mono">Session &gt; Logging &gt; All session output</span>
              ). Review execution-context notes and engineer-controlled commands before running them.
            </p>
          </div>

          {vendorId === "fortigate" && <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowScriptPreview(!showScriptPreview)}
              className="gap-1.5 border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs"
            >
              <FileCode className="h-3.5 w-3.5 text-slate-400" />
              <span>{showScriptPreview ? "Hide Script" : "Preview Script"}</span>
              {showScriptPreview ? (
                <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              )}
            </Button>

            <Button
              size="sm"
              onClick={handleCopyScript}
              className="gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-900/30 text-xs"
            >
              {copiedScript ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="text-emerald-200">Script Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy All ({commands.length}) Commands</span>
                </>
              )}
            </Button>
          </div>}
        </div>

        {/* Script Preview Drawer */}
        {vendorId === "fortigate" && showScriptPreview && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-[11px] text-blue-300">
                fortigate-pm-collection.txt
              </span>
              <span className="text-[11px]">
                Ready to paste into PuTTY after authentication
              </span>
            </div>
            <pre className="rounded-lg bg-slate-950/90 border border-slate-800 p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed">
              {fullScript}
            </pre>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {groups.map((group) => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedGroup === group
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {group}
              {group !== "ALL" && (
                <span className="ml-1.5 text-[10px] opacity-70 font-mono">
                  ({commands.filter((c) => c.group === group).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search command or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Command Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCommands.map((cmd) => {
          const isCopied = copiedId === cmd.id;
          return (
            <Card
              key={cmd.id}
              className="border-slate-800 bg-slate-900/50 hover:border-slate-700/80 transition-all flex flex-col justify-between"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-[10px]">
                      {cmd.group}
                    </Badge>
                    {cmd.isReadOnly ? (
                      <Badge variant="success" className="text-[10px]">Read-Only</Badge>
                    ) : (
                      <Badge variant="warning" className="text-[10px]">Engineer-Controlled</Badge>
                    )}
                    {cmd.requiresContext && (
                      <Badge variant="warning" className="text-[10px]">
                        Context Required
                      </Badge>
                    )}
                    {cmd.contextVerification === "VERIFY_REQUIRED" && (
                      <Badge variant="warning" className="text-[10px]">Verify CLI mode</Badge>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {cmd.id}
                  </span>
                </div>

                {/* Command Snippet & Copy Action */}
                <div className="rounded-lg bg-slate-950 border border-slate-800/80 p-2.5 flex items-center justify-between gap-2 mt-1">
                  <code className="text-xs font-mono font-semibold text-emerald-400 select-all break-all">
                    {cmd.command}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyCommand(cmd)}
                    className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
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

                <CardDescription className="text-xs text-slate-300 mt-2">
                  {cmd.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pt-0 text-xs">
                {/* Expected Outputs */}
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                    Expected Parsed Metrics:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {cmd.expectedOutputs.map((out) => (
                      <span
                        key={out}
                        className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700/60"
                      >
                        {out}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Report Mapping & Appendix */}
                <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Report Section:</span>
                    <span className="text-slate-300 font-medium">
                      {cmd.targetSection}
                    </span>
                  </div>
                  {cmd.targetAppendix && (
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Evidence:</span>
                      <span className="text-blue-300 font-mono text-[10px]">
                        {cmd.targetAppendix}
                      </span>
                    </div>
                  )}
                </div>

                {cmd.notes && (
                  <div className="rounded bg-slate-950/60 border border-slate-800 p-2 text-[11px] text-slate-400 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <span>{cmd.notes}</span>
                  </div>
                )}
                {cmd.executionContext && (
                  <div className="rounded bg-slate-950/60 border border-slate-800 p-2 text-[11px] text-slate-300">
                    Execution context: {cmd.executionContext}
                    {cmd.contextVerification === "VERIFY_REQUIRED" && " — verify on the target version before use."}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredCommands.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center text-xs text-slate-500">
          No commands matched your filter criteria.
        </div>
      )}
    </div>
  );
}
