import { describe, it, expect } from "vitest";
import { mapGroupToPmCategory } from "@/components/commands/cli-command-section";
import { FORTIGATE_COMMANDS } from "@/vendors/fortigate/commands";

describe("CLI Command Section & PM Category Mapping", () => {
  it("maps granular vendor groups to standard CTC PM check categories", () => {
    expect(mapGroupToPmCategory("System")).toBe("System");
    expect(mapGroupToPmCategory("Updates")).toBe("System");
    expect(mapGroupToPmCategory("NTP")).toBe("System");
    expect(mapGroupToPmCategory("Performance")).toBe("Hardware");
    expect(mapGroupToPmCategory("Interfaces")).toBe("Hardware");
    expect(mapGroupToPmCategory("Licensing")).toBe("Licensing");
    expect(mapGroupToPmCategory("VPN")).toBe("Network");
    expect(mapGroupToPmCategory("Routing")).toBe("Network");
    expect(mapGroupToPmCategory("Connectivity")).toBe("Network");
    expect(mapGroupToPmCategory("HA")).toBe("HA");
    expect(mapGroupToPmCategory("Logging")).toBe("Logging");
  });

  it("ensures all FortiGate PM commands map to standard PM categories", () => {
    const validCategories = new Set([
      "System",
      "Hardware",
      "Licensing",
      "Network",
      "HA",
      "Logging",
    ]);

    for (const cmd of FORTIGATE_COMMANDS) {
      const category = mapGroupToPmCategory(cmd.group);
      expect(validCategories.has(category)).toBe(true);
      expect(cmd.command.trim().length).toBeGreaterThan(0);
      expect(cmd.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("verifies all FortiGate PM commands are strictly read-only diagnostics", () => {
    // Commands must not include configuration changes
    const dangerousKeywords = [
      "config system",
      "set output",
      "unset",
      "delete",
      "purge",
      "factoryreset",
      "format",
    ];

    for (const cmd of FORTIGATE_COMMANDS) {
      expect(cmd.isReadOnly).toBe(true);
      for (const dangerous of dangerousKeywords) {
        expect(cmd.command.toLowerCase()).not.toContain(dangerous);
      }
    }
  });

  it("verifies every FortiGate PM command maps to a checklist item or section", () => {
    for (const cmd of FORTIGATE_COMMANDS) {
      expect(cmd.targetSection).toBeDefined();
      expect(cmd.mappedCheckIds?.length).toBeGreaterThan(0);
    }
  });
});
