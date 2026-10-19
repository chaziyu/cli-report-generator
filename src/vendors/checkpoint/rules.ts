import { ExtractedMetricsValue } from "@/core/checks/types";
import { VendorRuleContext, VendorRuleHandler } from "../types";

function valuesFor(context: VendorRuleContext | undefined, commandId: string, key: string): number[] {
  const executions = context?.executionsByCommandId?.[commandId] ?? [];
  if (!executions.some((execution) => execution.parseStatus === "SUCCESS")) return [];
  return (context?.metricsByCommandId?.[commandId] ?? []).flatMap((metric) => {
    const value = (metric as Record<string, unknown>)[key];
    if (typeof value === "number") return [value];
    if (Array.isArray(value)) return value.filter((entry): entry is number => typeof entry === "number");
    return [];
  });
}

function observedValue(metrics: ExtractedMetricsValue | undefined): string {
  if (!metrics || typeof metrics !== "object") return "CLI evidence collected";
  const values = metrics as Record<string, unknown>;
  for (const key of ["gaiaVersion", "buildNumber", "uptime", "cpuUtilizationPct", "memoryUtilizationPct"]) {
    if (values[key] !== undefined) return `${key}: ${values[key]}`;
  }
  if (Array.isArray(values.diskUsagePercentages)) return `Disk usage observations: ${(values.diskUsagePercentages as number[]).join("%, ")}%`;
  return "CLI evidence collected";
}

function review(checkId: string, commandIds: string[], expectedValue: string): VendorRuleHandler {
  return (metrics, context) => {
    const collectedIds = commandIds.filter((commandId) => (context?.outputsByCommandId?.[commandId]?.length ?? 0) > 0);
    if (commandIds.length === 0 || collectedIds.length === 0) {
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
    const allSuccessful = commandIds.every((commandId) => {
      const executions = context?.executionsByCommandId?.[commandId] ?? [];
      return executions.length > 0 && executions.every((execution) => execution.parseStatus === "SUCCESS");
    });
    const complete = collectedIds.length === commandIds.length && allSuccessful;
    const contexts = (context?.allExecutions ?? context?.executions ?? [])
      .map((execution) => execution.executionContext)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return {
      ruleId: `rule-${checkId}-review`,
      collectionState: complete ? "COMPLETE" : "INCOMPLETE",
      evaluationStatus: "REVIEW",
      currentValue: observedValue(metrics),
      expectedValue,
      remarks: `Evidence is collected; engineer review is required. Detected CLI contexts: ${contexts.length ? contexts.join(", ") : "not recorded"}.`,
      reviewRequired: true,
    };
  };
}

function memoryRule(): VendorRuleHandler {
  return (_metrics, context) => {
    const commandId = "cp-memory";
    const executions = context?.executionsByCommandId?.[commandId] ?? [];
    if (executions.length === 0) {
      return {
        ruleId: "rule-cp-memory", collectionState: "MISSING", evaluationStatus: "PENDING",
        currentValue: "Missing", expectedValue: "< 80%", remarks: "Required memory CLI evidence is missing.", reviewRequired: true,
      };
    }

    const contexts = executions.map((execution) => execution.executionContext);
    const contextVerified = contexts.length > 0 && contexts.every((value) => value === "Gaia Clish");
    const values = valuesFor(context, commandId, "memoryUtilizationPct");
    const validExecution = executions.every((execution) => execution.parseStatus === "SUCCESS");
    if (!validExecution || values.length === 0 || !contextVerified) {
      return {
        ruleId: "rule-cp-memory-review", collectionState: validExecution ? "COMPLETE" : "INCOMPLETE",
        evaluationStatus: "REVIEW", currentValue: values.length ? values.map((value) => `${value}%`).join(", ") : "Not reliably parsed",
        expectedValue: "< 80%", remarks: `Memory output requires engineer review because CLI context or reliable measurement is missing. Detected context: ${contexts.filter(Boolean).join(", ") || "not recorded"}.`, reviewRequired: true,
      };
    }

    const highest = Math.max(...values);
    const passed = values.every((value) => value < 80);
    return {
      ruleId: passed ? "rule-cp-memory-pass" : "rule-cp-memory-fail",
      collectionState: "COMPLETE",
      evaluationStatus: passed ? "PASS" : "FAIL",
      currentValue: values.map((value) => `${value}%`).join(", "),
      expectedValue: "< 80%",
      remarks: passed
        ? "Memory is below the guide threshold and the Gaia Clish context was recorded."
        : `Memory reached ${highest}%, which does not meet the guide threshold.`,
      reviewRequired: !passed,
    };
  };
}

export const CHECKPOINT_RULES: Record<string, VendorRuleHandler> = {
  "cp-os-version": review("cp-os-version", ["cp-os-version"], "Installed Gaia version and build reviewed"),
  "cp-hotfix-take": review("cp-hotfix-take", ["cp-hotfix-take"], "Hotfix take and patches reviewed"),
  "cp-system-uptime": review("cp-system-uptime", ["cp-uptime"], "Uptime reviewed"),
  "cp-cpu-usage": review("cp-cpu-usage", ["cp-cpu"], "CTC/customer-approved CPU threshold"),
  "cp-memory-usage": memoryRule(),
  "cp-disk-space": review("cp-disk-space", ["cp-disk-usage", "cp-lvm-overview"], "CTC/customer-approved disk threshold"),
  "cp-hardware-health": review("cp-hardware-health", ["cp-hardware-health"], "Hardware sensors and component health reviewed"),
  "cp-interface-monitoring": review("cp-interface-monitoring", ["cp-interfaces"], "Interfaces checked against topology"),
  "cp-license-information": review("cp-license-information", ["cp-licenses"], "Applicable licenses and expiry dates reviewed"),
  "cp-gui-access": review("cp-gui-access", [], "Engineer-confirmed GUI login and screenshot"),
  "cp-ssh-access": review("cp-ssh-access", [], "Engineer-confirmed SSH login and screenshot"),
  "cp-date-time": review("cp-date-time", ["cp-clock", "cp-timezone"], "System time and GMT+8 timezone reviewed"),
  "cp-ntp-synchronization": review("cp-ntp-synchronization", ["cp-ntp-active", "cp-ntp-current"], "Active NTP server and synchronization reviewed"),
  "cp-dns-configuration": review("cp-dns-configuration", ["cp-dns"], "DNS servers reviewed"),
  "cp-routing-table": review("cp-routing-table", ["cp-routes"], "Routes and next hops reviewed"),
  "cp-local-log-storage": review("cp-local-log-storage", ["cp-disk-usage"], "Log-storage utilization reviewed"),
  "cp-log-switch-configuration": review("cp-log-switch-configuration", [], "Management-side rotation, alert, and deletion settings reviewed"),
  "cp-cluster-status": review("cp-cluster-status", ["cp-cluster-state"], "Applicable cluster member state reviewed"),
  "cp-ha-synchronization": review("cp-ha-synchronization", ["cp-cluster-sync"], "Applicable cluster synchronization reviewed"),
  "cp-watchdog-processes": review("cp-watchdog-processes", ["cp-watchdog"], "WatchDog process state and execution context reviewed"),
  "cp-vsx-status": review("cp-vsx-status", ["cp-vsx-systems"], "Applicable VSX virtual systems reviewed"),
  "cp-vsx-load-sharing": review("cp-vsx-load-sharing", ["cp-cluster-state"], "Partial evidence; additional engineer review required"),
  "cp-concurrent-connections": review("cp-concurrent-connections", ["cp-connections"], "Connection statistics and approved capacity limit reviewed"),
  "cp-config-backup": review("cp-config-backup", [], "Engineer-confirmed GUI backup and download screenshot"),
};
