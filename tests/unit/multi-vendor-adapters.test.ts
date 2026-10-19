import { describe, expect, it } from "vitest";
import { vendorRegistry } from "@/vendors";
import { guiEvidenceMapper } from "@/core/evidence/gui-evidence-mapper";
import { commandSegmenter, logNormalizer } from "@/core/cli";
import { reviewService } from "@/core/review/review-service";
import type { ExtractedMetricsValue } from "@/core/checks/types";

describe("multi-vendor PM guides", () => {
  it("keeps all 77 task definitions stable and maps new guide tasks to their source and policy", () => {
    const expectedCounts = {
      fortigate: 21,
      paloalto: 16,
      juniper_srx: 16,
      checkpoint: 24,
    } as const;

    for (const [vendorId, expectedCount] of Object.entries(expectedCounts)) {
      const adapter = vendorRegistry.get(vendorId as keyof typeof expectedCounts)!;
      const commands = adapter.getCommands();
      const checklist = adapter.getChecklistDefinition();
      const commandIds = new Set(commands.map((command) => command.id));

      expect(checklist, vendorId).toHaveLength(expectedCount);
      expect(new Set(checklist.map((item) => item.id)).size, `${vendorId} task IDs`).toBe(expectedCount);
      for (const item of checklist) {
        if (vendorId !== "fortigate") {
          expect(item.guideSource?.document, `${vendorId}:${item.id} source document`).toBeTruthy();
          expect(item.guideSource?.tableRow, `${vendorId}:${item.id} source row`).toBeGreaterThan(0);
          expect(item.evaluationPolicy, `${vendorId}:${item.id} evaluation policy`).toBeTruthy();
        if (vendorId !== "fortigate") {
          expect(item.evidenceRequired, `${vendorId}:${item.id} required evidence`).toBe(true);
        }
        }
        for (const commandRef of item.commands) {
          expect(
            commandIds.has(commandRef) || commands.some((command) => command.command === commandRef),
            `${vendorId}:${item.id} command ${commandRef}`
          ).toBe(true);
        }
      }
      for (const command of commands) {
        expect(command.command).not.toMatch(/[\r\n]/);
      }
    }
  });

  it("applies only the Palo Alto guide thresholds and requires both CPU commands", () => {
    const adapter = vendorRegistry.get("paloalto")!;
    const parser = adapter.getParser!();
    const diskAt89 = parser.parseCommandOutput!("pa-disk-space", "Filesystem Size Used Avail Use% Mounted on\n/dev/root 10G 8.9G 1.1G 89% /");
    const diskAt90 = parser.parseCommandOutput!("pa-disk-space", "Filesystem Size Used Avail Use% Mounted on\n/dev/root 10G 9G 1G 90% /");
    const diskHandler = adapter.getRuleHandler!("pa-disk-space")!;
    const diskContext = (metrics: ExtractedMetricsValue) => ({
      hasExecution: true,
      executionsByCommandId: { "pa-disk-space": [{ parseStatus: "SUCCESS" }] },
      outputsByCommandId: { "pa-disk-space": ["disk output"] },
      metricsByCommandId: { "pa-disk-space": [metrics] },
    });

    expect(diskHandler(undefined, diskContext(diskAt89.metrics)).evaluationStatus).toBe("PASS");
    expect(diskHandler(undefined, diskContext(diskAt90.metrics)).evaluationStatus).toBe("FAIL");

    const cpuHandler = adapter.getRuleHandler!("pa-cpu-usage")!;
    const cpuMetrics = {
      "pa-system-resources": [{ cpuUtilizationPct: 50 }],
      "pa-resource-monitor": [{ cpuUtilizationPct: 40 }],
    };
    const bothCommands = {
      hasExecution: true,
      executionsByCommandId: {
        "pa-system-resources": [{ parseStatus: "SUCCESS" }],
        "pa-resource-monitor": [{ parseStatus: "SUCCESS" }],
      },
      outputsByCommandId: {
        "pa-system-resources": ["system resources"],
        "pa-resource-monitor": ["resource monitor"],
      },
      metricsByCommandId: cpuMetrics,
    };
    const oneCommand = {
      ...bothCommands,
      executionsByCommandId: { "pa-system-resources": [{ parseStatus: "SUCCESS" }] },
      outputsByCommandId: { "pa-system-resources": ["system resources"] },
      metricsByCommandId: { "pa-system-resources": cpuMetrics["pa-system-resources"] },
    };
    expect(cpuHandler(undefined, bothCommands).evaluationStatus).toBe("PASS");
    expect(cpuHandler(undefined, oneCommand).evaluationStatus).toBe("REVIEW");
  });

  it("keeps Juniper per-node observations separate and leaves threshold-free checks for review", () => {
    const adapter = vendorRegistry.get("juniper_srx")!;
    const parsed = adapter.getParser!().parseCommandOutput!(
      "srx-routing-engine",
      "Slot 0:\n  Current state Master\n  Idle 95 percent\n  Memory utilization 35 percent\nSlot 1:\n  Current state Backup\n  Idle 90 percent\n  Memory utilization 50 percent"
    );
    const nodes = (parsed.metrics as unknown as Record<string, unknown>).routingEngines as Array<{ slot: number; cpuUtilizationPct: number; memoryUtilizationPct: number }>;

    expect(nodes.map((node) => node.slot)).toEqual([0, 1]);
    expect(nodes.map((node) => node.cpuUtilizationPct)).toEqual([5, 10]);
    expect(nodes.map((node) => node.memoryUtilizationPct)).toEqual([35, 50]);
    expect(adapter.getChecklistDefinition().every((item) => adapter.getRuleHandler?.(item.id))).toBe(true);
  });

  it("passes Check Point memory only with verified Gaia Clish context", () => {
    const adapter = vendorRegistry.get("checkpoint")!;
    const parser = adapter.getParser!();
    const parsed = parser.parseCommandOutput!(
      "cp-memory",
      "Total Real Memory (Bytes): 1000\nActive Real Memory (Bytes): 790"
    );
    const handler = adapter.getRuleHandler!("cp-memory-usage")!;
    const context = (executionContext: string | undefined) => ({
      hasExecution: true,
      executionsByCommandId: { "cp-memory": [{ parseStatus: "SUCCESS", executionContext }] },
      outputsByCommandId: { "cp-memory": ["memory output"] },
      metricsByCommandId: { "cp-memory": [parsed.metrics] },
    });

    expect(handler(undefined, context("Gaia Clish")).evaluationStatus).toBe("PASS");
    expect(handler(undefined, context("Expert")).evaluationStatus).toBe("REVIEW");
    expect(handler(undefined, context(undefined)).evaluationStatus).toBe("REVIEW");
    expect(adapter.getCommands().find((command) => command.id === "cp-connections")?.contextVerification).toBe("VERIFY_REQUIRED");
  });

  it("keeps Check Point CLI context unknown unless the prompt identifies the shell", () => {
    const adapter = vendorRegistry.get("checkpoint")!;
    const segmented = commandSegmenter.segment(
      logNormalizer.normalize("CP-GW-01# cpstat os -f memory\nMemory Usage: 70%\n"),
      adapter
    );

    expect(segmented.segments[0].executionContext).toBeUndefined();
    expect(adapter.detectPrompt("[Expert@CP-GW-01:0]# cpstat os -f memory").executionContext).toBe("Expert");
  });

  it("requires evidence and a justified exception before approving a guide task without it", () => {
    const check = vendorRegistry.get("paloalto")!.getChecklistDefinition().find((item) => item.id === "pa-gui-access")!;
    const reviewItem = reviewService.buildReviewItems({ checklistDefinitions: [check] })[0];

    expect(reviewItem.requiresEvidence).toBe(true);
    expect(reviewItem.evidenceHealth.status).toBe("MISSING");
    expect(reviewItem.requiresJustification).toBe(true);
    expect(reviewService.validateDecision(check, {
      checklistResultId: null,
      status: "REVIEW",
      currentValue: null,
      expectedValue: null,
      proposedRemarks: null,
      collectionState: "MISSING",
      reviewRequired: true,
    }, false, { checkId: check.id, decision: "APPROVED" }).isValid).toBe(false);
  });

  it("offers each vendor's own checklist tasks for GUI evidence mapping", () => {
    for (const vendorId of ["paloalto", "juniper_srx", "checkpoint"] as const) {
      const tasks = guiEvidenceMapper.getAvailableTasks(vendorId);
      expect(tasks).toHaveLength(vendorRegistry.get(vendorId)!.getChecklistDefinition().length);
      expect(tasks.every((task) => task.checkId.startsWith(vendorId === "juniper_srx" ? "srx-" : vendorId === "paloalto" ? "pa-" : "cp-"))).toBe(true);
      expect(tasks.some((task) => task.appendixMapping.startsWith("Appendix"))).toBe(false);
    }
  });
});
