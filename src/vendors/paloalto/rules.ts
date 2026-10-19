import { ExtractedMetricsValue } from "@/core/checks/types";
import { VendorRuleContext, VendorRuleHandler } from "../types";

function review(checkId: string, expectedValue: string): VendorRuleHandler {
  return (_metrics, context) => ({
    ruleId: `rule-${checkId}-review`,
    collectionState: context?.hasExecution ? "COMPLETE" : "MISSING",
    evaluationStatus: context?.hasExecution ? "REVIEW" : "PENDING",
    currentValue: context?.hasExecution ? "CLI evidence collected" : "Missing",
    expectedValue,
    remarks: context?.hasExecution
      ? "CLI output is available; engineer review is required for this checklist criterion."
      : "Required evidence is missing; collect the CLI output or manual evidence listed in the guide.",
    reviewRequired: true,
  });
}

function valuesFor(
  context: VendorRuleContext | undefined,
  commandIds: string[],
  metricKey: string
): number[] {
  return commandIds.flatMap((commandId) => {
    const executions = context?.executionsByCommandId?.[commandId] ?? [];
    if (!executions.some((execution) => execution.parseStatus === "SUCCESS")) return [];
    return (context?.metricsByCommandId?.[commandId] ?? []).flatMap((metric) => {
      const value = (metric as Record<string, unknown>)[metricKey];
      if (typeof value === "number") return [value];
      if (Array.isArray(value)) return value.filter((entry): entry is number => typeof entry === "number");
      return [];
    });
  });
}

function threshold(
  checkId: string,
  commandIds: string[],
  metricKey: string,
  limit: number,
  unit: string
): VendorRuleHandler {
  return (_metrics: ExtractedMetricsValue | undefined, context) => {
    if (!context?.hasExecution) {
      return {
        ruleId: `rule-${checkId}`,
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: `< ${limit}${unit}`,
        remarks: "Required CLI evidence is missing.",
        reviewRequired: true,
      };
    }

    const values = valuesFor(context, commandIds, metricKey);
    const complete = commandIds.every((commandId) => {
      const executions = context.executionsByCommandId?.[commandId] ?? [];
      return (
        executions.length > 0 &&
        executions.every((execution) => execution.parseStatus === "SUCCESS") &&
        valuesFor(context, [commandId], metricKey).length > 0
      );
    });

    if (values.some((value) => value >= limit)) {
      const value = Math.max(...values);
      return {
        ruleId: `rule-${checkId}-fail`,
        collectionState: complete ? "COMPLETE" : "INCOMPLETE",
        evaluationStatus: complete ? "FAIL" : "REVIEW",
        currentValue: `${value}${unit}`,
        expectedValue: `< ${limit}${unit}`,
        remarks: complete
          ? `Observed ${value}${unit}, which does not meet the guide threshold.`
          : `Observed ${value}${unit}; the threshold is not met, but required command evidence is incomplete. Engineer review is required.`,
        reviewRequired: true,
      };
    }

    if (values.length === 0 || !complete) {
      return {
        ruleId: `rule-${checkId}-review`,
        collectionState: "INCOMPLETE",
        evaluationStatus: "REVIEW",
        currentValue: values.length ? values.map((value) => `${value}${unit}`).join(", ") : "Not reliably parsed",
        expectedValue: `< ${limit}${unit}`,
        remarks: "Output was collected, but reliable measurements from every required command are needed before this check can pass.",
        reviewRequired: true,
      };
    }

    return {
      ruleId: `rule-${checkId}-pass`,
      collectionState: "COMPLETE",
      evaluationStatus: "PASS",
      currentValue: values.map((value) => `${value}${unit}`).join(", "),
      expectedValue: `< ${limit}${unit}`,
      remarks: `All required measurements are below the guide threshold of ${limit}${unit}.`,
      reviewRequired: false,
    };
  };
}

export const PALOALTO_RULES: Record<string, VendorRuleHandler> = {
  "pa-disk-space": threshold("pa-disk-space", ["pa-disk-space"], "diskUsagePercentages", 90, "%"),
  "pa-cpu-usage": threshold("pa-cpu-usage", ["pa-system-resources", "pa-resource-monitor"], "cpuUtilizationPct", 80, "%"),
  "pa-memory-usage": threshold("pa-memory-usage", ["pa-system-resources"], "memoryUtilizationPct", 90, "%"),
  "pa-port-monitoring": review("pa-port-monitoring", "Engineer assessment of inactive ports"),
  "pa-power-supply": review("pa-power-supply", "Installed supplies operational; alarms reviewed"),
  "pa-hardware-support": review("pa-hardware-support", "Valid support contract and expiry reviewed"),
  "pa-feature-license": review("pa-feature-license", "Applicable feature licenses and expiry reviewed"),
  "pa-system-uptime": review("pa-system-uptime", "Uptime and last restart reviewed"),
  "pa-gui-access": review("pa-gui-access", "Engineer-confirmed GUI login and screenshot"),
  "pa-ssh-access": review("pa-ssh-access", "Engineer-confirmed SSH login and screenshot"),
  "pa-firmware-version": review("pa-firmware-version", "Installed version and approved lifecycle reference reviewed"),
  "pa-date-time": review("pa-date-time", "GMT+8 time and NTP synchronization reviewed"),
  "pa-internet-access": review("pa-internet-access", "Engineer-authorized connectivity check reviewed"),
  "pa-high-availability": review("pa-high-availability", "Applicable HA topology and peer synchronization reviewed"),
  "pa-event-logging": review("pa-event-logging", "Warning and critical events from the past three months reviewed"),
  "pa-config-backup": review("pa-config-backup", "Successful GUI export/download and screenshot confirmed"),
};
