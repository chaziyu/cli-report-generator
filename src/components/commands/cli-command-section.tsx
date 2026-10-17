"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Search,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VendorCommandDefinition } from "@/vendors/types";

export interface CliCommandSectionProps {
  vendor?: string;
  defaultCollapsed?: boolean;
}

// Maps granular vendor command groups to standard PM check categories
export function mapGroupToPmCategory(group: string): string {
  const g = group.toLowerCase();
  if (g === "performance" || g === "interfaces" || g === "hardware") return "Hardware";
  if (g === "vpn" || g === "routing" || g === "connectivity" || g === "network") return "Network";
  if (g === "ha") return "HA";
  if (g === "logging") return "Logging";
  if (g === "licensing") return "Licensing";
  if (g === "system" || g === "updates" || g === "ntp") return "System";
  return group;
}

export function CliCommandSection({
  vendor = "fortigate",
  defaultCollapsed = true,
}: CliCommandSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [commands, setCommands] = useState<VendorCommandDefinition[]>([]);
  const [vendorDisplayName, setVendorDisplayName] = useState("FortiGate");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search state
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Advanced details expansion state per command ID
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  // Optional Pagination Guidance toggle
  const [showPaginationHelp, setShowPaginationHelp] = useState(false);

  // Fetch command definitions from the vendor API
  useEffect(() => {
    let isMounted = true;
    async function loadCommands() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/vendors/${vendor}/commands`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load vendor commands");
        }
        if (isMounted) {
          setCommands(data.data.commands || []);
          if (data.data.displayName) {
            setVendorDisplayName(data.data.displayName);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Error loading commands");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadCommands();
    return () => {
      isMounted = false;
    };
  }, [vendor]);

  // Derive categories from commands
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const cmd of commands) {
      cats.add(mapGroupToPmCategory(cmd.group));
    }
    const order = ["System", "Hardware", "Licensing", "Network", "HA", "Logging"];
    const sorted = Array.from(cats).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
    return ["ALL", ...sorted];
  }, [commands]);

  // Filter commands by selected category and search query
  const filteredCommands = useMemo(() => {
    return commands.filter((cmd) => {
      const category = mapGroupToPmCategory(cmd.group);
      const matchesCategory =
        selectedCategory === "ALL" ||
        category.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.group.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [commands, selectedCategory, searchQuery]);

  const handleCopy = (id: string, commandText: string) => {
    navigator.clipboard.writeText(commandText);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  const toggleDetails = (id: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <Card className="border-slate-800 bg-[#070b14] shadow-md">
      {/* Collapsible Header */}
      <CardHeader className="py-3.5 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base text-white font-semibold">
                  CLI Command Reference
                </CardTitle>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {commands.length} Commands
                </span>
              </div>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Copy individual commands into customer&apos;s PuTTY terminal during remote PM session
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setShowPaginationHelp(!showPaginationHelp)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors p-1"
              title="Terminal guidance"
            >
              <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
              <span>PuTTY Help</span>
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="gap-1.5 text-xs border-slate-700 bg-slate-850 hover:bg-slate-750 text-slate-200"
            >
              <span>{isCollapsed ? "Show Commands" : "Collapse"}</span>
              {isCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="pt-0 pb-5 px-4 sm:px-6 space-y-4">
          {/* Optional PuTTY Pagination Guidance */}
          {showPaginationHelp && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3.5 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-blue-300 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>PuTTY Logging &amp; Pagination Notice</span>
              </div>
              <p className="leading-relaxed text-slate-300">
                Ensure PuTTY session logging is turned on before executing commands:{" "}
                <span className="font-mono text-blue-300">
                  PuTTY Configuration &gt; Session &gt; Logging &gt; &quot;All session output&quot;
                </span>
                .
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                If long terminal outputs pause on <code className="text-slate-200 font-mono">--More--</code>, press the spacebar to advance. Any console output setting modification requires explicit customer authorization and must be restored before concluding the PM.
              </p>
            </div>
          )}

          {/* Category Filter Pills & Search Box */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-slate-800">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              {categories.map((cat) => {
                const count =
                  cat === "ALL"
                    ? commands.length
                    : commands.filter(
                        (c) => mapGroupToPmCategory(c.group).toLowerCase() === cat.toLowerCase()
                      ).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-blue-600 text-white font-semibold shadow-sm"
                        : "bg-[#0c1222] text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800"
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="ml-1 text-[10px] opacity-75 font-mono">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Compact Search Box */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0c1222] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Loading or Error State */}
          {loading && (
            <div className="py-8 text-center text-xs text-slate-400">
              Loading approved commands...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Compact Commands List */}
          {!loading && !error && (
            <div className="space-y-2.5">
              {filteredCommands.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-[#0c1222] p-6 text-center text-xs text-slate-400">
                  No commands match the selected filter.
                </div>
              ) : (
                filteredCommands.map((cmd) => {
                  const isCopied = copiedId === cmd.id;
                  const isExpanded = Boolean(expandedDetails[cmd.id]);
                  const category = mapGroupToPmCategory(cmd.group);

                  return (
                    <div
                      key={cmd.id}
                      className="rounded-lg border border-slate-800 bg-[#0c1222] p-3 transition-colors hover:border-slate-700 space-y-2"
                    >
                      {/* Top Label & Category */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-xs font-medium text-slate-200 truncate">
                            {cmd.description}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[10px] font-medium py-0">
                            {category}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => toggleDetails(cmd.id)}
                            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-0.5 px-1 py-0.5 rounded transition-colors"
                          >
                            <span>{isExpanded ? "Less" : "Details"}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Single-line Horizontally Scrollable Command Field + Copy Button */}
                      <div className="flex items-center justify-between gap-2 rounded-md bg-[#030712] border border-slate-800 px-3 py-1.5">
                        <div className="overflow-x-auto whitespace-nowrap scrollbar-thin py-0.5 flex-1 min-w-0">
                          <code className="text-xs font-mono font-semibold text-emerald-400 select-all">
                            {cmd.command}
                          </code>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopy(cmd.id, cmd.command)}
                          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                            isCopied
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                          }`}
                          title="Copy command to clipboard"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 text-slate-400" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Expandable Advanced Technical Details */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
                          {cmd.expectedOutputs && cmd.expectedOutputs.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-500 font-medium">Expected Metrics:</span>
                              {cmd.expectedOutputs.map((out) => (
                                <span
                                  key={out}
                                  className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-800"
                                >
                                  {out}
                                </span>
                              ))}
                            </div>
                          )}

                          {cmd.targetAppendix && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 font-medium">Target Appendix:</span>
                              <span className="text-blue-300 font-mono text-[10px]">
                                {cmd.targetAppendix}
                              </span>
                            </div>
                          )}

                          {cmd.notes && (
                            <div className="text-slate-400 italic">
                              Note: {cmd.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
