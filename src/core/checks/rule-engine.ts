import {
  VendorId,
  NormalizedCheckResult,
  VendorCheckItemDefinition,
} from "@/vendors/types";
import { vendorRegistry } from "@/vendors";
import { FORTIGATE_RULES } from "@/vendors/fortigate/rules";
import {
  createMissingResult,
  createNormalizedResult,
  validateDeviceIsolation,
} from "./normalized-result";
import { ExtractedMetricsValue } from "./types";

export interface CommandExecutionInput {
  id: string;
  command: string;
  deviceId?: string;
  commandGroup?: string | null;
  outputContent?: string | null;
  parseStatus?: string | null;
  rawOutputRef?: string | null;
}

export interface RuleEvaluationSummary {
  deviceId: string;
  vendorId: VendorId;
  totalChecks: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  naCount: number;
  reviewCount: number;
  pendingCount: number;
  results: NormalizedCheckResult[];
}

export class RuleEngine {
  /**
   * Deterministically evaluates PM checklist items against recognized command executions.
   */
  evaluateDeviceChecks({
    deviceId,
    vendorId,
    checklistDefinitions,
    commandExecutions,
  }: {
    deviceId: string;
    vendorId: VendorId;
    checklistDefinitions: VendorCheckItemDefinition[];
    commandExecutions: CommandExecutionInput[];
  }): RuleEvaluationSummary {
    // Validate device isolation on inputs
    for (const exec of commandExecutions) {
      if (exec.deviceId && exec.deviceId !== deviceId) {
        throw new Error(
          `Device isolation violated: command execution "${exec.id}" belongs to device "${exec.deviceId}", but evaluation was requested for device "${deviceId}".`
        );
      }
    }

    const adapter = vendorRegistry.get(vendorId);
    const parser = adapter?.getParser?.();

    // Map command executions by command string and by vendor command ID (preserving all observations)
    const executionsByCommand = new Map<string, CommandExecutionInput[]>();
    const parsedMetricsByCommandId = new Map<
      string,
      Array<{ execution: CommandExecutionInput; metrics: ExtractedMetricsValue }>
    >();

    // Index all executions preserving observation order
    for (const exec of commandExecutions) {
      const cleanCmd = this.cleanCommand(exec.command);
      const list = executionsByCommand.get(cleanCmd) || [];
      list.push(exec);
      executionsByCommand.set(cleanCmd, list);

      if (parser && exec.outputContent) {
        // Try matching against vendor command definitions to find command ID
        const matchedDef = adapter
          ?.getCommands()
          .find((c) => this.cleanCommand(c.command) === cleanCmd);
        if (matchedDef) {
          const parsed = parser.parseCommandOutput(
            matchedDef.id,
            exec.outputContent
          );
          if (parsed.parseStatus === "SUCCESS") {
            const mList = parsedMetricsByCommandId.get(matchedDef.id) || [];
            mList.push({ execution: exec, metrics: parsed.metrics });
            parsedMetricsByCommandId.set(matchedDef.id, mList);
          }
        }
      }
    }

    const results: NormalizedCheckResult[] = [];

    for (const item of checklistDefinitions) {
      // Find matching rule handler
      const ruleHandler =
        vendorId === "fortigate" ? FORTIGATE_RULES[item.id] : undefined;

      // Check if command execution exists for this checklist item (preserving all observations)
      let matchedExecutions: CommandExecutionInput[] = [];
      let matchedCommandId: string | undefined;

      if (item.commands.length > 0) {
        for (const cmdId of item.commands) {
          const cmdDef = adapter?.getCommands().find((c) => c.id === cmdId);
          if (cmdDef) {
            const execs = executionsByCommand.get(this.cleanCommand(cmdDef.command));
            if (execs && execs.length > 0) {
              matchedExecutions = execs;
              matchedCommandId = cmdId;
              break;
            }
          }
        }
      }

      const matchedExecution = matchedExecutions[matchedExecutions.length - 1]; // latest or primary observation

      if (ruleHandler) {
        const metricsEntries = matchedCommandId
          ? parsedMetricsByCommandId.get(matchedCommandId) || []
          : [];

        const allMetrics = metricsEntries.map((m) => m.metrics);
        const primaryMetrics =
          metricsEntries.length > 0
            ? metricsEntries[metricsEntries.length - 1].metrics
            : undefined;

        const finding = ruleHandler(primaryMetrics, {
          hasExecution: matchedExecutions.length > 0,
          rawOutput: matchedExecution?.outputContent || undefined,
          executions: matchedExecutions,
          allOutputs: matchedExecutions
            .map((e) => e.outputContent)
            .filter((o): o is string => Boolean(o)),
          allMetrics,
        });

        const checkResult = createNormalizedResult({
          vendorId,
          deviceId,
          checkId: item.id,
          commandId: matchedCommandId || item.commands[0] || undefined,
          rawOutputRef: matchedExecution?.id || undefined,
          extractedValues: {
            ...((primaryMetrics as Record<string, unknown>) || {}),
            currentValue: finding.currentValue,
            expectedValue: finding.expectedValue,
          },
          collectionState: finding.collectionState,
          evaluationStatus: finding.evaluationStatus,
          ruleId: finding.ruleId,
          remarks: finding.remarks,
          evidenceRefs: matchedExecutions.map((e) => e.id),
          reviewRequired: finding.reviewRequired,
        });

        results.push(checkResult);
      } else {
        // Generic fallback if no specific rule handler registered
        if (item.sourceType === "CLI" && !matchedExecution) {
          results.push(
            createMissingResult({
              vendorId,
              deviceId,
              checkId: item.id,
              commandId: item.commands[0],
            })
          );
        } else {
          results.push(
            createNormalizedResult({
              vendorId,
              deviceId,
              checkId: item.id,
              commandId: item.commands[0],
              rawOutputRef: matchedExecution?.id,
              extractedValues: {},
              collectionState: matchedExecution ? "COMPLETE" : "UNSUPPORTED",
              evaluationStatus: matchedExecution ? "REVIEW" : "PENDING",
              remarks: `Check defined for ${item.taskName}.`,
              reviewRequired: true,
            })
          );
        }
      }
    }

    // Verify multi-device isolation
    validateDeviceIsolation(deviceId, results);

    // Compute summary counts
    let passedCount = 0;
    let failedCount = 0;
    let warningCount = 0;
    let naCount = 0;
    let reviewCount = 0;
    let pendingCount = 0;

    for (const r of results) {
      switch (r.evaluationStatus) {
        case "PASS":
          passedCount++;
          break;
        case "FAIL":
          failedCount++;
          break;
        case "WARNING":
          warningCount++;
          break;
        case "NA":
          naCount++;
          break;
        case "REVIEW":
          reviewCount++;
          break;
        case "PENDING":
          pendingCount++;
          break;
      }
    }

    return {
      deviceId,
      vendorId,
      totalChecks: results.length,
      passedCount,
      failedCount,
      warningCount,
      naCount,
      reviewCount,
      pendingCount,
      results,
    };
  }

  private cleanCommand(cmd: string): string {
    return cmd.trim().toLowerCase().replace(/\s+/g, " ");
  }
}

export const ruleEngine = new RuleEngine();
