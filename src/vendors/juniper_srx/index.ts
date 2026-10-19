import { IVendorAdapter, VendorCheckItemDefinition, VendorCommandDefinition, VendorRuleHandler } from "../types";
import { vendorRegistry } from "../registry";
import { JUNIPER_SRX_COMMANDS } from "./commands";
import { JUNIPER_SRX_CHECKLIST } from "./checklist";
import { juniperSrxParser } from "./parser";
import { JUNIPER_SRX_RULES } from "./rules";

export * from "./commands";
export * from "./checklist";
export * from "./parser";
export * from "./rules";

export class JuniperSrxVendorAdapter implements IVendorAdapter {
  readonly id = "juniper_srx" as const;
  readonly displayName = "Juniper SRX Junos";
  readonly description = "Junos SRX preventive maintenance guide support";

  getCommands(): VendorCommandDefinition[] {
    return JUNIPER_SRX_COMMANDS;
  }

  getChecklistDefinition(): VendorCheckItemDefinition[] {
    return JUNIPER_SRX_CHECKLIST;
  }

  getParser() {
    return juniperSrxParser;
  }

  getRuleHandler(checkId: string): VendorRuleHandler | undefined {
    return JUNIPER_SRX_RULES[checkId];
  }

  detectPrompt(line: string) {
    const match = line.match(/^\s*(?:\[edit(?:\s+[^\]]+)?\]\s*)?[A-Za-z0-9_.-]+@([A-Za-z0-9_.-]+)([>#])(?:\s+(.*))?\s*$/);
    return match
      ? { isPrompt: true, hostname: match[1], promptChar: match[2], commandText: match[3]?.trim() }
      : { isPrompt: false };
  }

  detectCommandError(output: string): string | undefined {
    return output.split(/\r?\n/).find((line) => /^\s*(?:%\s*)?(?:syntax error|unknown command|invalid command)/i.test(line))?.trim();
  }
}

export const juniperSrxAdapter = new JuniperSrxVendorAdapter();
vendorRegistry.register(juniperSrxAdapter);
