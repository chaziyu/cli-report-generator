import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { logNormalizer } from "@/core/cli/log-normalizer";

describe("LogNormalizer", () => {
  it("normalizes CRLF and mixed line endings to LF", () => {
    const crlfText = "Line 1\r\nLine 2\r\nLine 3\r\n";
    const result = logNormalizer.normalize(crlfText);

    expect(result.lineEndingType).toBe("CRLF");
    expect(result.lines).toEqual(["Line 1", "Line 2", "Line 3", ""]);
    expect(result.normalizedContent).toBe("Line 1\nLine 2\nLine 3\n");
  });

  it("strips ANSI color and cursor control escape sequences", () => {
    // \x1b[32m is green, \x1b[0m is reset, \x1b[2K is clear line
    const ansiText = "\x1b[32mFGT200F # \x1b[0mget system status\x1b[2K\nCPU: 5%";
    const result = logNormalizer.normalize(ansiText);

    expect(result.hasAnsiEscapes).toBe(true);
    expect(result.normalizedContent).toBe("FGT200F # get system status\nCPU: 5%");
    expect(result.lines[0]).toBe("FGT200F # get system status");
  });

  it("handles backspace erasure keystrokes", () => {
    // User types "get systm", hits backspace, and types "em status"
    const textWithBackspace = "get systm\bem status\n";
    const result = logNormalizer.normalize(textWithBackspace);

    expect(result.lines[0]).toBe("get system status");
  });

  it("detects and strips terminal pagination markers (--More--)", () => {
    const paginatedText =
      "FGT # get router info routing-table all\n" +
      "C 10.0.0.0/24 port1\n" +
      "--More--\n" +
      "S 0.0.0.0/0 port2\n";

    const result = logNormalizer.normalize(paginatedText);

    expect(result.hasPaginationMarkers).toBe(true);
    expect(result.paginationMarkerCount).toBe(1);
    expect(result.lines).toContain("C 10.0.0.0/24 port1");
    expect(result.lines).toContain("S 0.0.0.0/0 port2");
    expect(result.lines).not.toContain("--More--");
  });

  it("detects PuTTY header banners and extracts metadata", () => {
    const puttyText =
      "=~=~=~=~=~=~=~=~=~=~=~= PuTTY log 2026.08.15 09:30:00 =~=~=~=~=~=~=~=~=~=~=\n" +
      "FGT # get system status\n";

    const result = logNormalizer.normalize(puttyText);

    expect(result.detectedBanners.length).toBe(1);
    expect(result.detectedBanners[0]).toContain("PuTTY log 2026.08.15");
    expect(result.lines).not.toContain(result.detectedBanners[0]);
  });
  it("calculates exact SHA-256 of unaltered input buffer", () => {
    const buffer = Buffer.from("Authentic PuTTY output from firewall", "utf-8");
    const result = logNormalizer.normalize(buffer);
    const expectedHash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");
    expect(result.rawSha256).toBe(expectedHash);
  });

  it("strips UTF-8 BOM if present", () => {
    const bomBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Hostname # get system status", "utf-8"),
    ]);

    const result = logNormalizer.normalize(bomBuffer);
    expect(result.encoding).toBe("UTF-8 (BOM)");
    expect(result.lines[0]).toBe("Hostname # get system status");
  });
});
