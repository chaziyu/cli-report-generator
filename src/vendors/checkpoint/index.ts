import { IVendorAdapter, VendorCheckItemDefinition, VendorCommandDefinition, VendorRuleHandler } from "../types";
import { vendorRegistry } from "../registry";
import { CHECKPOINT_COMMANDS } from "./commands";
import { CHECKPOINT_CHECKLIST } from "./checklist";
import { checkPointParser } from "./parser";
import { CHECKPOINT_RULES } from "./rules";

export * from "./commands";
export * from "./checklist";
export * from "./parser";
export * from "./rules";

export class CheckPointVendorAdapter implements IVendorAdapter {
  readonly id = "checkpoint" as const;
  readonly displayName = "Check Point Gaia / 7000M";
  readonly description = "Gaia preventive maintenance guide support";

  getCommands(): VendorCommandDefinition[] {
    return CHECKPOINT_COMMANDS;
  }

  getChecklistDefinition(): VendorCheckItemDefinition[] {
    return CHECKPOINT_CHECKLIST;
  }

  getParser() {
    return checkPointParser;
  }

  getRuleHandler(checkId: string): VendorRuleHandler | undefined {
    return CHECKPOINT_RULES[checkId];
  }

  detectPrompt(line: string) {
    const expert = line.match(/^\s*\[(Expert|Clish)@([A-Za-z0-9_.-]+)(?::\d+)?\]([#>])(?:\s+(.*))?\s*$/i);
    if (expert) {
      const mode = expert[1].toLowerCase() === "clish" ? "Gaia Clish" : "Expert";
      return {
        isPrompt: true,
        hostname: expert[2],
        promptChar: expert[3],
        commandText: expert[4]?.trim(),
        executionContext: mode,
      };
    }
    const clish = line.match(/^\s*([A-Za-z0-9_.-]+)([>#])(?:\s+(.*))?\s*$/);
    return clish
      ? { isPrompt: true, hostname: clish[1], promptChar: clish[2], commandText: clish[3]?.trim() }
      : { isPrompt: false };
  }

  detectCommandError(output: string): string | undefined {
    return output.split(/\r?\n/).find((line) => /command not found|unknown command|invalid command|syntax error/i.test(line))?.trim();
  }
}

export const checkPointAdapter = new CheckPointVendorAdapter();
vendorRegistry.register(checkPointAdapter);
