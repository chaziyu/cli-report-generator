import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { logNormalizer } from "@/core/cli/log-normalizer";
import { commandSegmenter } from "@/core/cli/command-segmenter";
import { fortiGateAdapter } from "@/vendors/fortigate";

describe("CommandSegmenter", () => {
  it("segments clean FortiGate PuTTY session log fixture into consecutive commands", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "logs",
      "fortigate-clean-session.log"
    );
    const content = await fs.readFile(fixturePath);
    const normalized = logNormalizer.normalize(content);

    const segmented = commandSegmenter.segment(normalized, fortiGateAdapter);

    expect(segmented.detectedHostname).toBe("FGT200F-HQ-PRI");
    expect(segmented.detectedVendor).toBe("fortigate");
    expect(segmented.totalCommands).toBeGreaterThanOrEqual(11);
    expect(segmented.recognizedCommands).toBeGreaterThanOrEqual(11);
    expect(segmented.hasRepeatedCommands).toBe(false);

    // Verify first command
    const firstSegment = segmented.segments[0];
    expect(firstSegment.command).toBe("get system status");
    expect(firstSegment.commandId).toBe("cmd-fg-sys-status");
    expect(firstSegment.hostname).toBe("FGT200F-HQ-PRI");
    expect(firstSegment.promptChar).toBe("#");
    expect(firstSegment.rawOutput).toContain("Version: FortiGate-200F v7.4.11");
    expect(firstSegment.rawOutput).toContain("Serial-Number: FG200FTK21004812");

    // Verify performance command
    const perfSegment = segmented.segments.find(
      (s) => s.command === "get system performance status"
    );
    expect(perfSegment).toBeDefined();
    expect(perfSegment?.commandId).toBe("cmd-fg-sys-perf");
    expect(perfSegment?.rawOutput).toContain("CPU states:");
    expect(perfSegment?.rawOutput).toContain("Uptime: 177 days");

    // Verify disk command
    const diskSegment = segmented.segments.find(
      (s) => s.command === "fnsysctl df"
    );
    expect(diskSegment).toBeDefined();
    expect(diskSegment?.commandId).toBe("cmd-fg-hw-disk");

    // Verify interfaces command
    const intfSegment = segmented.segments.find(
      (s) => s.command === "get system interface physical"
    );
    expect(intfSegment).toBeDefined();
    expect(intfSegment?.commandId).toBe("cmd-fg-intf-phys");

    // Verify contract command
    const contractSegment = segmented.segments.find(
      (s) => s.command === "diagnose test update info contract"
    );
    expect(contractSegment).toBeDefined();
    expect(contractSegment?.commandId).toBe("cmd-fg-lic-contract");

    // Verify prologue contains banner
    expect(segmented.unsegmentedPrologue).toContain("FortiGate-200F");
  });

  it("detects and indexes repeated commands without losing execution order", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "logs",
      "fortigate-repeated.log"
    );
    const content = await fs.readFile(fixturePath);
    const normalized = logNormalizer.normalize(content);

    const segmented = commandSegmenter.segment(normalized, fortiGateAdapter);

    expect(segmented.hasRepeatedCommands).toBe(true);

    const perfRuns = segmented.segments.filter(
      (s) => s.command === "get system performance status"
    );
    expect(perfRuns.length).toBe(2);

    // First execution
    expect(perfRuns[0].isRepeated).toBe(false);
    expect(perfRuns[0].executionIndex).toBe(0);
    expect(perfRuns[0].rawOutput).toContain("Uptime: 45 days, 2 hours, 10 minutes");

    // Second execution
    expect(perfRuns[1].isRepeated).toBe(true);
    expect(perfRuns[1].executionIndex).toBe(1);
    expect(perfRuns[1].rawOutput).toContain("Uptime: 45 days, 2 hours, 12 minutes");
  });

  it("identifies failed command executions and extracts error message", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "logs",
      "fortigate-errors.log"
    );
    const content = await fs.readFile(fixturePath);
    const normalized = logNormalizer.normalize(content);

    const segmented = commandSegmenter.segment(normalized, fortiGateAdapter);

    const failedSegment = segmented.segments.find(
      (s) => s.command === "get systm status"
    );
    expect(failedSegment).toBeDefined();
    expect(failedSegment?.commandStatus).toBe("FAILED");
    expect(failedSegment?.errorMessage).toContain("command parse error");

    // Valid command in same session still succeeds
    const validSegment = segmented.segments.find(
      (s) => s.command === "get system status"
    );
    expect(validSegment).toBeDefined();
    expect(validSegment?.commandStatus).toBe("SUCCESS");
  });

  it("does not incorrectly split on hash characters inside output text", () => {
    const logWithHashesInOutput =
      "FGT # get system status\n" +
      "# This is a comment inside script or table\n" +
      "Version: v7.4.0 # Release note hash #abc123\n" +
      "FGT # get system performance status\n" +
      "CPU: 10%\n";

    const normalized = logNormalizer.normalize(logWithHashesInOutput);
    const segmented = commandSegmenter.segment(normalized, fortiGateAdapter);

    expect(segmented.segments.length).toBe(2);
    expect(segmented.segments[0].command).toBe("get system status");
    expect(segmented.segments[0].rawOutput).toContain(
      "# This is a comment inside script or table"
    );
    expect(segmented.segments[1].command).toBe("get system performance status");
  });
});
