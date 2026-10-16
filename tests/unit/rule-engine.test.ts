import { describe, it, expect } from "vitest";
import { ruleEngine } from "@/core/checks/rule-engine";
import { FORTIGATE_CHECKLIST } from "@/vendors/fortigate/checklist";

describe("RuleEngine: Deterministic Evaluation Engine", () => {
  it("evaluates all items in checklist and produces summary", () => {
    const summary = ruleEngine.evaluateDeviceChecks({
      deviceId: "dev-01",
      vendorId: "fortigate",
      checklistDefinitions: FORTIGATE_CHECKLIST,
      commandExecutions: [],
    });

    expect(summary.deviceId).toBe("dev-01");
    expect(summary.totalChecks).toBe(FORTIGATE_CHECKLIST.length);
    expect(summary.results.length).toBe(FORTIGATE_CHECKLIST.length);
    // When no commands executed, CLI checks should be PENDING and missing
    expect(summary.pendingCount).toBeGreaterThan(0);
    // Unsupported / external items should be REVIEW
    expect(summary.reviewCount).toBeGreaterThan(0);
  });

  it("maps command outputs and computes pass/fail deterministic results", () => {
    const summary = ruleEngine.evaluateDeviceChecks({
      deviceId: "dev-01",
      vendorId: "fortigate",
      checklistDefinitions: FORTIGATE_CHECKLIST,
      commandExecutions: [
        {
          id: "cmd-01",
          deviceId: "dev-01",
          command: "get system performance status",
          outputContent: `
CPU states: 0% user 1% system 0% nice 99% idle 0% iowait 0% irq 0% softirq
Memory: 16384000k total, 5406720k used (33%), 10977280k free (67%)
Average sessions: 1845 concurrent sessions, 42 sessions/sec
Uptime: 177 days,  14 hours,  24 minutes
`,
        },
        {
          id: "cmd-02",
          deviceId: "dev-01",
          command: "fnsysctl df",
          outputContent: `
Filesystem           1k-blocks      Used Available Use% Mounted on
none                    819200       124    819076   0% /tmp
none                   8192000    421040   7770960   5% /dev/shm
/dev/nodev             2097152    184320   1912832   9% /var/log
`,
        },
      ],
    });

    const cpuResult = summary.results.find((r) => r.checkId === "fg-hw-cpu");
    expect(cpuResult).toBeDefined();
    // Instantaneous reading without historical proof requires review per PM requirement
    expect(cpuResult?.evaluationStatus).toBe("REVIEW");
    expect(cpuResult?.reviewRequired).toBe(true);
    expect(cpuResult?.extractedValues?.totalCpuUtilizationPct).toBe(1);

    const memResult = summary.results.find((r) => r.checkId === "fg-hw-mem");
    expect(memResult).toBeDefined();
    // Instantaneous reading without historical proof requires review per PM requirement
    expect(memResult?.evaluationStatus).toBe("REVIEW");
    expect(memResult?.reviewRequired).toBe(true);
    expect(memResult?.extractedValues?.memoryUtilizationPct).toBe(33);

    const diskResult = summary.results.find((r) => r.checkId === "fg-hw-disk");
    expect(diskResult).toBeDefined();
    expect(diskResult?.evaluationStatus).toBe("PASS");
    expect(diskResult?.extractedValues?.highestUsedPct).toBe(9);
  });

  it("preserves multiple observations for the same command in observation order", () => {
    const summary = ruleEngine.evaluateDeviceChecks({
      deviceId: "dev-01",
      vendorId: "fortigate",
      checklistDefinitions: FORTIGATE_CHECKLIST,
      commandExecutions: [
        {
          id: "cmd-perf-1",
          deviceId: "dev-01",
          command: "get system performance status",
          outputContent: `CPU states: 5% user 5% system 0% nice 90% idle\nMemory: 1000k total, 200k used (20%)`,
        },
        {
          id: "cmd-perf-2",
          deviceId: "dev-01",
          command: "get system performance status",
          outputContent: `CPU states: 10% user 15% system 0% nice 75% idle\nMemory: 1000k total, 350k used (35%)`,
        },
      ],
    });

    const cpuResult = summary.results.find((r) => r.checkId === "fg-hw-cpu");
    expect(cpuResult).toBeDefined();
    expect(cpuResult?.evidenceRefs).toEqual(["cmd-perf-1", "cmd-perf-2"]);
    expect(cpuResult?.evaluationStatus).toBe("REVIEW");
    expect(cpuResult?.remarks).toContain("Captured 2 instantaneous CPU observations");
  });

  it("enforces device isolation: commands from a different device are rejected", () => {
    expect(() => {
      ruleEngine.evaluateDeviceChecks({
        deviceId: "dev-target-01",
        vendorId: "fortigate",
        checklistDefinitions: FORTIGATE_CHECKLIST,
        commandExecutions: [
          {
            id: "cmd-foreign",
            deviceId: "dev-other-99", // Belongs to different device!
            command: "get system performance status",
            outputContent: "CPU states: 5% user",
          },
        ],
      });
    }).toThrow(/Device isolation violated/);
  });
});
