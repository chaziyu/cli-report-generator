import { describe, it, expect } from "vitest";
import { vendorRegistry } from "@/vendors";
import { fortiGateAdapter } from "@/vendors/fortigate";

describe("Vendor Adapter & Parser Contract", () => {
  it("FortiGateVendorAdapter implements IVendorAdapter and exposes getParser", () => {
    expect(fortiGateAdapter.id).toBe("fortigate");
    const parser = fortiGateAdapter.getParser();
    expect(parser).toBeDefined();
    expect(parser.vendorId).toBe("fortigate");
  });

  it("vendorRegistry returns parser via getParser() convenience method", () => {
    const parser = vendorRegistry.getParser("fortigate");
    expect(parser).toBeDefined();
    expect(parser?.vendorId).toBe("fortigate");
    expect(parser?.canParse("cmd-fg-sys-perf")).toBe(true);
  });

  it("FortiGate parser can parse all approved FortiGate command definitions", () => {
    const parser = fortiGateAdapter.getParser();
    const commands = fortiGateAdapter.getCommands();

    for (const cmd of commands) {
      expect(parser.canParse(cmd.id)).toBe(true);
    }
  });

  it("vendorRegistry returns undefined for non-existent vendor parser", () => {
    const parser = vendorRegistry.getParser("paloalto" as any);
    expect(parser).toBeUndefined();
  });
});
