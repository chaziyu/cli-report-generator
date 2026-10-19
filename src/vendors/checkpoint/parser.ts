import { IVendorParser, ParsedCommandOutput } from "@/core/checks/types";

const COMMAND_IDS = new Set([
  "cp-os-version",
  "cp-hotfix-take",
  "cp-uptime",
  "cp-cpu",
  "cp-memory",
  "cp-disk-usage",
  "cp-lvm-overview",
  "cp-hardware-health",
  "cp-interfaces",
  "cp-licenses",
  "cp-clock",
  "cp-timezone",
  "cp-ntp-active",
  "cp-ntp-current",
  "cp-dns",
  "cp-routes",
  "cp-cluster-state",
  "cp-cluster-sync",
  "cp-watchdog",
  "cp-vsx-systems",
  "cp-connections",
]);

function percentage(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

export class CheckPointParser implements IVendorParser {
  readonly vendorId = "checkpoint" as const;

  canParse(commandId: string): boolean {
    return COMMAND_IDS.has(commandId);
  }

  parseCommandOutput(commandId: string, rawOutput: string): ParsedCommandOutput {
    if (!this.canParse(commandId)) {
      return { commandId, rawCommand: "", parseStatus: "UNSUPPORTED", metrics: {} };
    }
    if (!rawOutput.trim()) {
      return { commandId, rawCommand: "", parseStatus: "EMPTY", metrics: {} };
    }

    const metrics: Record<string, unknown> = { outputLineCount: rawOutput.split(/\r?\n/).length };

    if (commandId === "cp-memory") {
      const explicit = rawOutput.match(/Memory\s+(?:Usage|Utilization)\s*\(?%\)?\s*:\s*([\d.]+)/i)?.[1];
      let memoryPct = percentage(explicit);
      if (memoryPct === undefined) {
        const total = rawOutput.match(/^\s*Total Real Memory \(Bytes\):\s*(\d+)/im)?.[1];
        const active = rawOutput.match(/^\s*Active Real Memory \(Bytes\):\s*(\d+)/im)?.[1];
        if (total && active && Number(total) > 0) {
          memoryPct = Number(active) / Number(total) * 100;
        }
      }
      if (memoryPct !== undefined) metrics.memoryUtilizationPct = memoryPct;
    }

    if (commandId === "cp-cpu") {
      const cpu = rawOutput.match(/^\s*CPU Usage \(%\):\s*([\d.]+)/im)?.[1];
      const cpuPct = percentage(cpu);
      if (cpuPct !== undefined) metrics.cpuUtilizationPct = cpuPct;
    }

    if (commandId === "cp-disk-usage" || commandId === "cp-lvm-overview") {
      const percentages = rawOutput
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*\S+\s+.*?(\d{1,3})%\s*$/)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(percentage)
        .filter((value): value is number => value !== undefined);
      if (percentages.length > 0) metrics.diskUsagePercentages = percentages;
    }

    if (commandId === "cp-os-version") {
      const version = rawOutput.match(/^\s*(?:Product version|Version):\s*(.+)$/im)?.[1]?.trim();
      const build = rawOutput.match(/^\s*Build number:\s*(.+)$/im)?.[1]?.trim();
      if (version) metrics.gaiaVersion = version;
      if (build) metrics.buildNumber = build;
    }

    if (commandId === "cp-uptime") {
      const uptime = rawOutput.match(/^\s*Uptime:\s*(.+)$/im)?.[1]?.trim();
      if (uptime) metrics.uptime = uptime;
    }

    return { commandId, rawCommand: "", parseStatus: "SUCCESS", metrics };
  }
}

export const checkPointParser = new CheckPointParser();
