import { IVendorParser, ParsedCommandOutput } from "@/core/checks/types";

const COMMAND_IDS = new Set([
  "srx-chassis-hardware",
  "srx-routing-engine",
  "srx-system-storage",
  "srx-chassis-environment",
  "srx-power-supply",
  "srx-license-detail",
  "srx-version",
  "srx-chassis-alarms",
  "srx-system-alarms",
  "srx-cluster-status",
  "srx-cluster-interfaces",
  "srx-system-messages",
]);

function percent(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

export class JuniperSrxParser implements IVendorParser {
  readonly vendorId = "juniper_srx" as const;

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

    if (commandId === "srx-routing-engine") {
      const sections = rawOutput.split(/(?=^\s*Slot\s+\d+\s*:)/im).filter((section) => /\bSlot\s+\d+\s*:/i.test(section));
      metrics.routingEngines = sections.map((section) => {
        const slot = section.match(/\bSlot\s+(\d+)\s*:/i)?.[1];
        const state = section.match(/^\s*Current state\s+(\S+)/im)?.[1];
        const memory = section.match(/^\s*Memory utilization\s+(\d+)\s+percent/im)?.[1];
        const idle = section.match(/^\s*Idle\s+(\d+)\s+percent/im)?.[1];
        return {
          slot: slot === undefined ? undefined : Number(slot),
          state,
          memoryUtilizationPct: percent(memory),
          cpuUtilizationPct: idle === undefined ? undefined : 100 - Number(idle),
        };
      });
    }

    if (commandId === "srx-system-storage") {
      const filesystems = rawOutput
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*(\S+)\s+.*?\s(\d{1,3})%\s+(\S+)\s*$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => ({ filesystem: match[1], usedPct: Number(match[2]), mountPoint: match[3] }));
      metrics.filesystems = filesystems;
    }

    if (commandId === "srx-version") {
      const version = rawOutput.match(/^\s*Junos:\s*(.+)$/im)?.[1]?.trim()
        ?? rawOutput.match(/JUNOS Software Release\s+\[([^\]]+)\]/i)?.[1]?.trim();
      const hostnames = Array.from(rawOutput.matchAll(/^\s*Hostname:\s*(\S+)/gim), (match) => match[1]);
      if (version) metrics.junosVersion = version;
      if (hostnames.length) metrics.hostnames = hostnames;
    }

    if (commandId === "srx-chassis-alarms" || commandId === "srx-system-alarms") {
      metrics.alarmLines = rawOutput
        .split(/\r?\n/)
        .filter((line) => /alarm|warning|error|major|minor/i.test(line));
    }

    return { commandId, rawCommand: "", parseStatus: "SUCCESS", metrics };
  }
}

export const juniperSrxParser = new JuniperSrxParser();
