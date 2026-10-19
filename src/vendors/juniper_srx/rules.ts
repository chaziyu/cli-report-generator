import { ExtractedMetricsValue } from "@/core/checks/types";
import { VendorRuleHandler } from "../types";

function currentValue(metrics: ExtractedMetricsValue | undefined): string {
  if (!metrics || typeof metrics !== "object") return "CLI evidence collected";
  const values = metrics as Record<string, unknown>;
  if (Array.isArray(values.routingEngines)) {
    return values.routingEngines
      .map((engine) => {
        const node = engine as Record<string, unknown>;
        return [
          node.slot === undefined ? "node" : `slot ${node.slot}`,
          node.state,
          node.cpuUtilizationPct === undefined ? undefined : `CPU ${node.cpuUtilizationPct}%`,
          node.memoryUtilizationPct === undefined ? undefined : `memory ${node.memoryUtilizationPct}%`,
        ].filter(Boolean).join(": ");
      })
      .join("; ") || "Routing-engine output collected";
  }
  if (Array.isArray(values.filesystems)) {
    return values.filesystems
      .map((filesystem) => {
        const row = filesystem as Record<string, unknown>;
        return `${row.mountPoint ?? row.filesystem}: ${row.usedPct}%`;
      })
      .join("; ") || "Storage output collected";
  }
  if (typeof values.junosVersion === "string") return values.junosVersion;
  return "CLI evidence collected";
}

function review(checkId: string, expectedValue: string): VendorRuleHandler {
  return (metrics, context) => {
    if (!context?.hasExecution) {
      return {
        ruleId: `rule-${checkId}-review`,
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue,
        remarks: "Required CLI or manual evidence is missing.",
        reviewRequired: true,
      };
    }

    const successful = (context.executions ?? []).every((execution) => execution.parseStatus === "SUCCESS");
    return {
      ruleId: `rule-${checkId}-review`,
      collectionState: successful ? "COMPLETE" : "INCOMPLETE",
      evaluationStatus: "REVIEW",
      currentValue: currentValue(metrics),
      expectedValue,
      remarks: "Evidence is collected. Engineer review is required; the supplied Juniper guide does not provide a numeric health threshold for this check.",
      reviewRequired: true,
    };
  };
}

export const JUNIPER_SRX_RULES: Record<string, VendorRuleHandler> = {
  "srx-gui-access": review("srx-gui-access", "Engineer-confirmed J-Web login and screenshot"),
  "srx-chassis-hardware": review("srx-chassis-hardware", "Chassis model, serials, and components reviewed"),
  "srx-cpu-usage": review("srx-cpu-usage", "CPU observations reviewed on each applicable node"),
  "srx-memory-usage": review("srx-memory-usage", "Memory observations reviewed on each applicable node"),
  "srx-storage-utilization": review("srx-storage-utilization", "Storage observations reviewed on each applicable node"),
  "srx-chassis-health": review("srx-chassis-health", "Temperatures, fans, and hardware state reviewed"),
  "srx-power-supply": review("srx-power-supply", "Installed power supply states reviewed"),
  "srx-license-status": review("srx-license-status", "Applicable licenses and expiry dates reviewed"),
  "srx-firmware-version": review("srx-firmware-version", "Junos version recorded for each applicable node"),
  "srx-firmware-lifecycle": review("srx-firmware-lifecycle", "Current Juniper lifecycle reference reviewed"),
  "srx-chassis-alarms": review("srx-chassis-alarms", "Active chassis alarms reviewed"),
  "srx-system-alarms": review("srx-system-alarms", "Active system alarms reviewed"),
  "srx-cluster-status": review("srx-cluster-status", "Applicable cluster nodes and redundancy groups reviewed"),
  "srx-cluster-interfaces": review("srx-cluster-interfaces", "Applicable control, fabric, and monitored interfaces reviewed"),
  "srx-log-messages": review("srx-log-messages", "Latest 50 system log entries reviewed"),
  "srx-config-backup": review("srx-config-backup", "J-Web export, downloaded file, and screenshot confirmed"),
};
