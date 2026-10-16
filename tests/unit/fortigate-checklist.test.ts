import { describe, it, expect } from "vitest";
import {
  FORTIGATE_COMMANDS,
  getFortiGateCommandById,
  getFortiGateCommandsByGroup,
  generateFortiGateCollectionScript,
} from "@/vendors/fortigate/commands";
import {
  FORTIGATE_CHECKLIST,
  getFortiGateCheckItemById,
  getChecklistItemsForCommand,
  validateFortiGateMapping,
} from "@/vendors/fortigate/checklist";
import { fortiGateAdapter } from "@/vendors/fortigate";

describe("FortiGate PM Commands Definition", () => {
  it("should have all commands marked as read-only for customer firewall safety", () => {
    expect(FORTIGATE_COMMANDS.length).toBeGreaterThanOrEqual(11);
    for (const cmd of FORTIGATE_COMMANDS) {
      expect(cmd.id).toMatch(/^cmd-fg-/);
      expect(cmd.isReadOnly).toBe(true);
      expect(cmd.command.trim().length).toBeGreaterThan(0);
      expect(cmd.expectedOutputs.length).toBeGreaterThan(0);
      expect(cmd.targetSection.length).toBeGreaterThan(0);
      expect(cmd.group.length).toBeGreaterThan(0);
    }
  });

  it("should retrieve a command by its stable ID", () => {
    const perfCmd = getFortiGateCommandById("cmd-fg-sys-perf");
    expect(perfCmd).toBeDefined();
    expect(perfCmd?.command).toBe("get system performance status");
    expect(perfCmd?.group).toBe("Performance");
  });

  it("should filter commands by group", () => {
    const sysCmds = getFortiGateCommandsByGroup("System");
    expect(sysCmds.length).toBeGreaterThanOrEqual(2);
    expect(sysCmds.some((c) => c.command === "get system status")).toBe(true);
  });

  it("should generate a complete PuTTY collection script with pagination control", () => {
    const script = generateFortiGateCollectionScript();
    expect(script).toContain("set output standard");
    expect(script).toContain("get system status");
    expect(script).toContain("get system performance status");
    expect(script).toContain("get system interface physical");
    expect(script).toContain("diagnose test update info contract");
    expect(script).toContain("get vpn ipsec tunnel summary");
    expect(script).toContain("get router info routing-table all");
    expect(script).toContain("get system ha status");
    expect(script).toContain("diagnose autoupdate versions");
    expect(script).toContain("diagnose sys ntp status");
    expect(script).toContain("set output more");
  });
});

describe("FortiGate PM Checklist Definition", () => {
  it("should have all 21 standard CTC PM checklist items defined", () => {
    expect(FORTIGATE_CHECKLIST.length).toBe(21);

    for (const item of FORTIGATE_CHECKLIST) {
      expect(item.id).toMatch(/^fg-/);
      expect(item.itemNumber).toBeDefined();
      expect(item.taskName.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(["CLI", "GUI_MANUAL", "EXTERNAL_REFERENCE"]).toContain(
        item.sourceType
      );
      expect(item.targetSection.length).toBeGreaterThan(0);
      expect(item.collectionInstructions).toBeDefined();
      expect(item.expectedStatusOptions?.length).toBeGreaterThan(0);
    }
  });

  it("should have correct source type counts matching CTC standard PM specification", () => {
    const cliItems = FORTIGATE_CHECKLIST.filter((i) => i.sourceType === "CLI");
    const guiItems = FORTIGATE_CHECKLIST.filter((i) => i.sourceType === "GUI_MANUAL");
    const extItems = FORTIGATE_CHECKLIST.filter(
      (i) => i.sourceType === "EXTERNAL_REFERENCE"
    );

    expect(cliItems.length).toBe(17);
    expect(guiItems.length).toBe(2);
    expect(extItems.length).toBe(2);
    expect(cliItems.length + guiItems.length + extItems.length).toBe(21);
  });

  it("should pass mapping validation between commands and checklist items", () => {
    const validation = validateFortiGateMapping();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.commandCount).toBe(FORTIGATE_COMMANDS.length);
    expect(validation.checkItemCount).toBe(FORTIGATE_CHECKLIST.length);
  });

  it("should support One-to-Many command mapping (1 command feeding multiple checks)", () => {
    // get system performance status feeds CPU, Memory, and Uptime
    const perfItems = getChecklistItemsForCommand("cmd-fg-sys-perf");
    expect(perfItems.length).toBe(3);
    const perfItemIds = perfItems.map((i) => i.id);
    expect(perfItemIds).toContain("fg-hw-cpu");
    expect(perfItemIds).toContain("fg-hw-mem");
    expect(perfItemIds).toContain("fg-sys-uptime");

    // diagnose test update info contract feeds FortiCare and UTM bundle
    const contractItems = getChecklistItemsForCommand("cmd-fg-lic-contract");
    expect(contractItems.length).toBe(2);
    const contractItemIds = contractItems.map((i) => i.id);
    expect(contractItemIds).toContain("fg-lic-forticare");
    expect(contractItemIds).toContain("fg-lic-utm");
  });

  it("should allow querying a checklist item by its stable ID", () => {
    const cpuCheck = getFortiGateCheckItemById("fg-hw-cpu");
    expect(cpuCheck).toBeDefined();
    expect(cpuCheck?.itemNumber).toBe("1.2");
    expect(cpuCheck?.taskName).toBe("CPU Usage");
    expect(cpuCheck?.thresholdDescription).toContain("< 80%");
  });
});

describe("FortiGate Vendor Adapter Integration", () => {
  it("should return commands and checklist from adapter methods", () => {
    expect(fortiGateAdapter.id).toBe("fortigate");
    expect(fortiGateAdapter.getCommands().length).toBe(FORTIGATE_COMMANDS.length);
    expect(fortiGateAdapter.getChecklistDefinition().length).toBe(
      FORTIGATE_CHECKLIST.length
    );
  });

  it("should recognize standard FortiOS prompt formats", () => {
    const prompt1 = fortiGateAdapter.detectPrompt("FG-HQ-FW01 # ");
    expect(prompt1.isPrompt).toBe(true);
    expect(prompt1.hostname).toBe("FG-HQ-FW01");
    expect(prompt1.promptChar).toBe("#");

    const prompt2 = fortiGateAdapter.detectPrompt("FG-CLUSTER-01 (global) #");
    expect(prompt2.isPrompt).toBe(true);
    expect(prompt2.hostname).toBe("FG-CLUSTER-01");

    const nonPrompt = fortiGateAdapter.detectPrompt(
      "FortiGate-200F v7.4.11,build2878,250815 (GA.M)"
    );
    expect(nonPrompt.isPrompt).toBe(false);
  });
});
