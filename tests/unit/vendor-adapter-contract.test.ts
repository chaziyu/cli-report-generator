import { describe, it, expect } from "vitest";
import { vendorRegistry } from "@/vendors";
import { fortiGateAdapter } from "@/vendors/fortigate";

describe("Vendor Adapter & Parser Contract", () => {
  it("all registered supported vendors expose a parser for every approved CLI command", () => {
    const vendorIds = ["fortigate", "paloalto", "juniper_srx", "checkpoint"] as const;
    for (const vendorId of vendorIds) {
      const adapter = vendorRegistry.get(vendorId);
      const parser = vendorRegistry.getParser(vendorId);
      expect(adapter).toBeDefined();
      expect(parser).toBeDefined();
      expect(parser?.vendorId).toBe(vendorId);
      for (const command of adapter!.getCommands()) {
        expect(parser?.canParse(command.id), `${vendorId}:${command.id}`).toBe(true);
      }
    }
  });

  it("vendorRegistry returns the FortiGate parser via getParser() convenience method", () => {
    const parser = vendorRegistry.getParser("fortigate");
    expect(parser).toBeDefined();
    expect(parser?.vendorId).toBe("fortigate");
    expect(parser?.canParse("cmd-fg-sys-perf")).toBe(true);
  });

  it("FortiGate still exposes its full approved command list", () => {
    const parser = fortiGateAdapter.getParser();
    const commands = fortiGateAdapter.getCommands();

    expect(commands.length).toBeGreaterThan(0);
    expect(parser.vendorId).toBe("fortigate");
  });

  it("vendorRegistry returns undefined for a non-existent vendor parser", () => {
    const parser = vendorRegistry.getParser("other" as any);
    expect(parser).toBeUndefined();
  });
});
