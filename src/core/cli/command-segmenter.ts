import { IVendorAdapter } from "@/vendors/types";
import {
  NormalizedLog,
  CommandSegment,
  SegmentedSessionLog,
  CommandSegmentStatus,
} from "./types";

interface ParsedPromptLine {
  isPrompt: boolean;
  hostname?: string;
  vdom?: string;
  promptChar?: string;
  commandText?: string;
  rawLine: string;
}

export class CommandSegmenter {
  /**
   * Segments a normalized PuTTY log into discrete command executions
   * using vendor-specific prompt recognizers and command signatures.
   */
  segment(normalized: NormalizedLog, adapter: IVendorAdapter): SegmentedSessionLog {
    const lines = normalized.lines;
    const vendorCommands = adapter.getCommands();

    // Map command string -> command definition
    const commandMap = new Map<string, string>();
    for (const cmd of vendorCommands) {
      // Index by normalized lower-case command
      const normalizedCmd = this.cleanCommandString(cmd.command);
      commandMap.set(normalizedCmd, cmd.id);
    }

    const segments: CommandSegment[] = [];
    const detectedVdomsSet = new Set<string>();
    const commandCountMap = new Map<string, number>();
    const warnings: string[] = [];

    let currentPrompt: ParsedPromptLine | null = null;
    let currentOutputLines: string[] = [];
    let currentLineStart = 0;
    const prologueLines: string[] = [];
    let foundFirstCommand = false;
    let lastHostname: string | undefined = undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsedPrompt = this.parsePromptLine(line, adapter);

      if (parsedPrompt.isPrompt) {
        if (parsedPrompt.hostname) {
          lastHostname = parsedPrompt.hostname;
        }
        if (parsedPrompt.vdom) {
          detectedVdomsSet.add(parsedPrompt.vdom);
        }

        // If we were already collecting a command, finalize it now
        if (currentPrompt) {
          const segment = this.buildSegment({
            prompt: currentPrompt,
            outputLines: currentOutputLines,
            lineStart: currentLineStart,
            lineEnd: i, // 1-indexed line before this new prompt
            commandMap,
            commandCountMap,
            segmentIndex: segments.length + 1,
          });
          segments.push(segment);

          currentOutputLines = [];
        }

        // Check if there is a command typed on this prompt line
        if (parsedPrompt.commandText && parsedPrompt.commandText.trim().length > 0) {
          foundFirstCommand = true;
          currentPrompt = parsedPrompt;
          currentOutputLines = [];
          currentLineStart = i + 1; // 1-indexed
        } else {
          // Empty prompt line (e.g. user just hit enter, or exit)
          currentPrompt = null;
        }
      } else {
        // Regular line
        if (!foundFirstCommand) {
          prologueLines.push(line);
        } else {
          currentOutputLines.push(line);
        }
      }
    }

    // Finalize the last pending command segment if one was active
    if (currentPrompt) {
      const segment = this.buildSegment({
        prompt: currentPrompt,
        outputLines: currentOutputLines,
        lineStart: currentLineStart,
        lineEnd: lines.length,
        commandMap,
        commandCountMap,
        segmentIndex: segments.length + 1,
      });
      segments.push(segment);
    }

    // Determine repeated commands
    let hasRepeated = false;
    for (const seg of segments) {
      if (seg.isRepeated) {
        hasRepeated = true;
      }
    }

    // Detect pagination interruptions in any segment
    let hasPaginationInterrupts = false;
    for (const seg of segments) {
      if (seg.interruptedByPagination) {
        hasPaginationInterrupts = true;
        warnings.push(
          `Command "${seg.command}" output contained terminal pagination markers.`
        );
      }
    }

    if (segments.length === 0) {
      warnings.push(
        "No command executions could be identified in the session log. Ensure prompt format matches vendor standard."
      );
    }

    const recognizedCommands = segments.filter((s) => Boolean(s.commandId)).length;

    return {
      rawSha256: normalized.rawSha256,
      detectedHostname: lastHostname,
      detectedVendor: adapter.id,
      detectedVdoms: Array.from(detectedVdomsSet),
      segments,
      unsegmentedPrologue: prologueLines.join("\n"),
      unsegmentedEpilogue: currentPrompt ? "" : currentOutputLines.join("\n"),
      totalCommands: segments.length,
      recognizedCommands,
      hasRepeatedCommands: hasRepeated,
      hasPaginationInterrupts,
      warnings,
    };
  }

  /**
   * Parses a line to determine if it is a vendor prompt, optionally with a typed command.
   * e.g. "FG200F # get system status" -> hostname="FG200F", promptChar="#", commandText="get system status"
   */
  private parsePromptLine(line: string, adapter: IVendorAdapter): ParsedPromptLine {
    // FortiGate prompt standard formats:
    // Hostname #
    // Hostname (vdom) #
    // Hostname $
    // Hostname (vdom) # command args
    const match = line.match(
      /^\s*([A-Za-z0-9_\-\.]+)(?:\s*\(([^\)]+)\))?\s*([#$])(?:\s+(.*))?$/
    );

    if (match) {
      const hostname = match[1];
      const vdom = match[2]?.trim();
      const promptChar = match[3];
      const commandText = match[4]?.trim();

      return {
        isPrompt: true,
        hostname,
        vdom,
        promptChar,
        commandText,
        rawLine: line,
      };
    }

    // Fallback to adapter's native prompt detector
    const adapterPrompt = adapter.detectPrompt(line);
    if (adapterPrompt.isPrompt) {
      return {
        isPrompt: true,
        hostname: adapterPrompt.hostname,
        promptChar: adapterPrompt.promptChar || "#",
        rawLine: line,
      };
    }

    return {
      isPrompt: false,
      rawLine: line,
    };
  }

  /**
   * Builds a normalized CommandSegment from collected lines.
   */
  private buildSegment({
    prompt,
    outputLines,
    lineStart,
    lineEnd,
    commandMap,
    commandCountMap,
    segmentIndex,
  }: {
    prompt: ParsedPromptLine;
    outputLines: string[];
    lineStart: number;
    lineEnd: number;
    commandMap: Map<string, string>;
    commandCountMap: Map<string, number>;
    segmentIndex: number;
  }): CommandSegment {
    const rawCommand = prompt.commandText || "";
    const cleanedCommand = this.cleanCommandString(rawCommand);

    // Track execution count for this command
    const previousRuns = commandCountMap.get(cleanedCommand) || 0;
    commandCountMap.set(cleanedCommand, previousRuns + 1);

    const isRepeated = previousRuns > 0;
    const executionIndex = previousRuns;

    // Check for matching vendor command ID
    const matchedCommandId = commandMap.get(cleanedCommand);

    const rawOutput = outputLines.join("\n").trim();

    // Check for pagination interruptions
    const interruptedByPagination =
      rawOutput.includes("--More--") || rawOutput.includes("-- More --");

    // Evaluate command status
    const { status, errorMessage } = this.evaluateCommandStatus(
      cleanedCommand,
      outputLines,
      matchedCommandId
    );

    return {
      id: `seg-${segmentIndex}`,
      command: cleanedCommand,
      rawCommandLine: prompt.rawLine,
      commandId: matchedCommandId,
      hostname: prompt.hostname || "UNKNOWN",
      vdom: prompt.vdom,
      promptChar: prompt.promptChar || "#",
      outputLines,
      rawOutput,
      lineStart,
      lineEnd,
      isRepeated,
      executionIndex,
      interruptedByPagination,
      commandStatus: status,
      errorMessage,
    };
  }

  /**
   * Evaluates whether a command succeeded, failed, was empty, or is unsupported.
   */
  private evaluateCommandStatus(
    command: string,
    outputLines: string[],
    matchedCommandId?: string
  ): { status: CommandSegmentStatus; errorMessage?: string } {
    if (command.trim().length === 0) {
      return { status: "EMPTY" };
    }

    const outputText = outputLines.join("\n");

    // FortiOS error signatures
    const lowerOutput = outputText.toLowerCase();
    if (
      lowerOutput.includes("command parse error") ||
      lowerOutput.includes("unknown action") ||
      lowerOutput.includes("node_check_object fail") ||
      lowerOutput.includes("invalid input detected") ||
      lowerOutput.includes("incomplete command")
    ) {
      // Extract the first error line
      const errorLine = outputLines.find((l) =>
        /parse error|unknown|fail|invalid|incomplete/i.test(l)
      );
      return {
        status: "FAILED",
        errorMessage: errorLine?.trim() || "CLI command execution failed.",
      };
    }

    if (outputLines.length === 0 || outputText.trim().length === 0) {
      return { status: "EMPTY" };
    }

    if (!matchedCommandId) {
      return { status: "UNSUPPORTED" };
    }

    return { status: "SUCCESS" };
  }

  /**
   * Cleans and normalizes command strings (collapsing multiple spaces, trimming).
   */
  private cleanCommandString(cmd: string): string {
    return cmd.trim().replace(/\s+/g, " ");
  }
}

export const commandSegmenter = new CommandSegmenter();
