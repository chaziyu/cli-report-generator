"use client";

import { useState } from "react";
import {
  GitFork,
  Terminal,
  FileCheck2,
  CheckCircle2,
  ArrowRight,
  Shield,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VendorCommandDefinition, VendorCheckItemDefinition } from "@/vendors/types";

interface MappingMatrixProps {
  commands: VendorCommandDefinition[];
  items: VendorCheckItemDefinition[];
}

export function MappingMatrix({ commands, items }: MappingMatrixProps) {
  const [selectedCommandId, setSelectedCommandId] = useState<string>(commands[0]?.id || "");

  const itemMap = new Map<string, VendorCheckItemDefinition>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  const selectedCommand = commands.find((c) => c.id === selectedCommandId) || commands[0];

  // Find all items mapped to this command
  const mappedItems = items.filter((item) =>
    item.commands.includes(selectedCommand?.id || "")
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <GitFork className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">
              Command-to-Checklist Multi-Mapping Matrix
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              To minimize production firewall workload, CTC PM commands are designed
              such that one execution feeds multiple checklist requirements. For
              instance, running <code className="text-blue-300 font-mono">get system performance status</code> satisfies
              CPU Usage (1.2), Memory Usage (1.3), and System Uptime (6.1) simultaneously.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Command List */}
        <div className="lg:col-span-5 space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
            Select Approved CLI Command ({commands.length}):
          </span>

          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {commands.map((cmd) => {
              const isSelected = cmd.id === selectedCommand?.id;
              const feedsCount = items.filter((i) => i.commands.includes(cmd.id)).length;

              return (
                <button
                  key={cmd.id}
                  onClick={() => setSelectedCommandId(cmd.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? "border-blue-500/50 bg-blue-500/10 shadow-sm"
                      : "border-slate-800 bg-slate-900/50 hover:bg-slate-800/60 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-emerald-400 truncate">
                      {cmd.command}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        feedsCount > 1
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30 font-bold"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      Feeds {feedsCount} check{feedsCount > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span className="text-slate-500">{cmd.group}</span>
                    <span className="truncate max-w-[200px] text-slate-400 text-[10px]">
                      {cmd.targetSection}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Command & Mapped Checklist Details */}
        <div className="lg:col-span-7 space-y-4">
          {selectedCommand && (
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="default">{selectedCommand.group}</Badge>
                  <span className="text-xs font-mono text-slate-500">
                    {selectedCommand.id}
                  </span>
                </div>
                <CardTitle className="text-base font-mono text-emerald-400 mt-1">
                  {selectedCommand.command}
                </CardTitle>
                <CardDescription className="text-xs text-slate-300">
                  {selectedCommand.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                {/* Expected Outputs */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                    Extracted Parser Metrics:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCommand.expectedOutputs.map((out) => (
                      <span
                        key={out}
                        className="rounded bg-slate-950 px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-slate-800"
                      >
                        {out}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Mapped Checklist Items */}
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Fulfilled PM Checklist Tasks ({mappedItems.length}):
                  </span>

                  {mappedItems.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
                      This diagnostic command is for environmental / auxiliary verification.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mappedItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                {item.itemNumber}
                              </span>
                              <span className="font-medium text-xs text-slate-200">
                                {item.taskName}
                              </span>
                            </div>
                            <span className="text-[10px] text-blue-300 font-mono">
                              {item.targetAppendix}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400">
                            {item.description}
                          </p>

                          {item.thresholdDescription && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/90 font-mono pt-0.5">
                              <span>Criterion:</span>
                              <span>{item.thresholdDescription}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
