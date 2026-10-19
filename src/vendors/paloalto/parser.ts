import { IVendorParser, ParsedCommandOutput } from "@/core/checks/types";
import { VendorId } from "../types";

const COMMAND_IDS = new Set([
  "pa-disk-space",
  "pa-system-resources",
  "pa-resource-monitor",
  "pa-interface-all",
  "pa-power-supplies",
  "pa-support-info",
  "pa-license-info",
  "pa-system-info",
  "pa-preferred-software",
  "pa-clock",
  "pa-ntp",
  "pa-internet-ping",
  "pa-ha-status",
  "pa-system-log",
]);

function boundedPercent(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : undefined;
}

export class PaloAltoParser implements IVendorParser {
  readonly vendorId: VendorId = "paloalto";

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

    const metrics: Record<string, unknown> = {};
    if (commandId === "pa-disk-space") {
      const percentages = rawOutput
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*\S+\s+.*?(\d{1,3})%\s+\S/))
        .map((match) => match?.[1])
        .filter((value): value is string => Boolean(value))
        .map(boundedPercent)
        .filter((value): value is number => value !== undefined);
      if (percentages.length > 0) {
        metrics.diskUsagePercentages = percentages;
        metrics.diskUsagePct = Math.max(...percentages);
      }
    }

    if (commandId === "pa-system-resources") {
      const cpuLine = rawOutput.match(/^\s*%?cpu\(s\):?([^\r\n]*)/im)?.[1];
      const idle = cpuLine?.match(/([\d.]+)%\s*id\b/i)?.[1];
      const cpu = rawOutput.match(/CPU\s+(?:usage|utilization)\s*:?\s*([\d.]+)%/i)?.[1];
      const cpuPct = cpu ? boundedPercent(cpu) : idle ? boundedPercent(String(100 - Number(idle))) : undefined;
      if (cpuPct !== undefined) metrics.cpuUtilizationPct = cpuPct;

      const memoryPct = rawOutput.match(/memory(?:\s+usage|\s+utilization)?\s*:?\s*([\d.]+)%/i)?.[1]
        ?? rawOutput.match(/Memory:\s*[^\r\n]*?used\s*\([^)]*?([\d.]+)%/i)?.[1];
      const boundedMemory = memoryPct ? boundedPercent(memoryPct) : undefined;
      if (boundedMemory !== undefined) metrics.memoryUtilizationPct = boundedMemory;
    }

    if (commandId === "pa-resource-monitor") {
      const cpuValues = rawOutput
        .split(/\r?\n/)
        .map((line) => line.match(/\bCPU\s+(?:load|usage|utilization)[^\r\n]*?([\d.]+)%/i)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(boundedPercent)
        .filter((value): value is number => value !== undefined);
      if (cpuValues.length > 0) {
        metrics.cpuUtilizationPct = Math.max(...cpuValues);
        metrics.cpuUtilizationObservations = cpuValues;
      }
    }

    if (commandId === "pa-system-info") {
      const version = rawOutput.match(/^\s*sw-version:\s*(.+)$/im)?.[1]?.trim();
      const uptime = rawOutput.match(/^\s*uptime:\s*(.+)$/im)?.[1]?.trim();
      if (version) metrics.panOsVersion = version;
      if (uptime) metrics.uptime = uptime;
    }

    return { commandId, rawCommand: "", parseStatus: "SUCCESS", metrics };
  }
}

export const paloAltoParser = new PaloAltoParser();
