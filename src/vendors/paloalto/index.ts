import { IVendorAdapter, VendorCheckItemDefinition, VendorCommandDefinition, VendorRuleHandler } from "../types";
import { vendorRegistry } from "../registry";
import { PALOALTO_COMMANDS } from "./commands";
import { PALOALTO_CHECKLIST } from "./checklist";
import { paloAltoParser } from "./parser";
import { PALOALTO_RULES } from "./rules";

export * from "./commands";
export * from "./checklist";
export * from "./parser";
export * from "./rules";

export class PaloAltoVendorAdapter implements IVendorAdapter {
  readonly id = "paloalto" as const;
  readonly displayName = "Palo Alto Networks PAN-OS";
  readonly description = "PAN-OS preventive maintenance guide support";

  getCommands(): VendorCommandDefinition[] {
    return PALOALTO_COMMANDS;
  }

  getChecklistDefinition(): VendorCheckItemDefinition[] {
    return PALOALTO_CHECKLIST;
  }

  getParser() {
    return paloAltoParser;
  }

  getRuleHandler(checkId: string): VendorRuleHandler | undefined {
    return PALOALTO_RULES[checkId];
  }

  detectPrompt(line: string) {
    const match = line.match(/^\s*[A-Za-z0-9_.-]+@([A-Za-z0-9_.-]+)([>#])(?:\s+(.*))?\s*$/);
    return match
      ? { isPrompt: true, hostname: match[1], promptChar: match[2], commandText: match[3]?.trim() }
      : { isPrompt: false };
  }

  detectCommandError(output: string): string | undefined {
    return output.split(/\r?\n/).find((line) => /invalid syntax|unknown command|invalid command/i.test(line))?.trim();
  }
}

export const paloAltoAdapter = new PaloAltoVendorAdapter();
vendorRegistry.register(paloAltoAdapter);
