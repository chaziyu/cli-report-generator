import { IVendorAdapter, VendorCommandDefinition, VendorCheckItemDefinition } from "../types";
import { vendorRegistry } from "../registry";
import { FORTIGATE_COMMANDS } from "./commands";
import { FORTIGATE_CHECKLIST } from "./checklist";
import { fortiGateParser, FortiGateParser } from "./parser";
import { IVendorParser } from "@/core/checks/types";

export * from "./commands";
export * from "./checklist";
export * from "./parser";

export class FortiGateVendorAdapter implements IVendorAdapter {
  readonly id = "fortigate" as const;
  readonly displayName = "Fortinet FortiGate";
  readonly description = "FortiOS Next-Generation Firewalls (FortiGate 60F-3000F, VM)";
  readonly supportedFirmwareRange = "FortiOS 6.4 - 7.6+";

  getCommands(): VendorCommandDefinition[] {
    return FORTIGATE_COMMANDS;
  }

  getChecklistDefinition(): VendorCheckItemDefinition[] {
    return FORTIGATE_CHECKLIST;
  }

  getParser(): IVendorParser {
    return fortiGateParser;
  }

  detectPrompt(line: string): { isPrompt: boolean; hostname?: string; promptChar?: string } {
    // FortiGate prompt standard formats:
    // Hostname # or Hostname (vdom) # or Hostname $
    const match = line.match(/^([A-Za-z0-9_\-\.]+)(?:\s*\([^\)]+\))?\s*([#$])\s*$/);
    if (match) {
      return {
        isPrompt: true,
        hostname: match[1],
        promptChar: match[2],
      };
    }
    return { isPrompt: false };
  }
}

// Auto-register FortiGate adapter
export const fortiGateAdapter = new FortiGateVendorAdapter();
vendorRegistry.register(fortiGateAdapter);
