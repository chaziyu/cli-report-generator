import { IVendorAdapter, VendorCommandDefinition, VendorCheckItemDefinition } from "../types";
import { vendorRegistry } from "../registry";
import { FORTIGATE_COMMANDS } from "./commands";
import { FORTIGATE_CHECKLIST } from "./checklist";
import { fortiGateParser, FortiGateParser } from "./parser";
import { IVendorParser } from "@/core/checks/types";
import { FORTIGATE_RULES } from "./rules";
import { VendorRuleHandler } from "../types";

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

  getRuleHandler(checkId: string): VendorRuleHandler | undefined {
    return FORTIGATE_RULES[checkId];
  }

  detectCommandError(output: string): string | undefined {
    const errorLine = output
      .split("\n")
      .find((line) =>
        /command parse error|unknown action|node_check_object fail|invalid input detected|incomplete command/i.test(line)
      );
    return errorLine?.trim();
  }

  detectPrompt(line: string) {
    const match = line.match(
      /^\s*([A-Za-z0-9_\-\.]+)(?:\s*\(([^\)]+)\))?\s*([#$])(?:\s+(.*))?\s*$/
    );
    if (match) {
      return {
        isPrompt: true,
        hostname: match[1],
        vdom: match[2]?.trim(),
        promptChar: match[3],
        commandText: match[4]?.trim(),
      };
    }
    return { isPrompt: false };
  }
}

// Auto-register FortiGate adapter
export const fortiGateAdapter = new FortiGateVendorAdapter();
vendorRegistry.register(fortiGateAdapter);
