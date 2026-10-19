import crypto from "crypto";
import { NormalizedLog, LineEndingType } from "./types";

/**
 * ANSI escape code patterns:
 * - CSI: \x1b\[[0-9;]*[a-zA-Z]
 * - OSC: \x1b\][^\x07\x1b]*(\x07|\x1b\\)
 * - Private mode: \x1b\[\?[0-9]*[a-zA-Z]
 * - Single byte controls: \x1b[()][0-9A-Za-z]
 */
const ANSI_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * PuTTY session log banner regex:
 * e.g. "=~=~=~=~=~=~=~=~=~=~=~= PuTTY log 2026.08.15 14:22:01 =~=~=~=~=~=~=~=~=~=~="
 */
const PUTTY_BANNER_REGEX =
  /^=~=~=~=~=~=~=~=~=~=~=~= PuTTY log .* =~=~=~=~=~=~=~=~=~=~=$/;

/**
 * Multi-vendor terminal pagination markers:
 * - FortiGate / Check Point / PAN-OS: "--More--", "--More-- ", "--More-- (page 1)"
 * - Juniper SRX Junos: "---(more)---", "---(more 12%)---"
 */
const PAGINATION_MARKER_REGEX =
  /(?:--\s*More\s*--(?:[ \t]*(?:\(page\s+\d+\))?)?|---\s*\(more(?:\s+\d+%)?\)\s*---+)/gi;

export class LogNormalizer {
  /**
   * Normalizes a raw PuTTY session log buffer or string into a clean,
   * standard representation while preserving original SHA-256 integrity.
   */
  normalize(rawInput: Buffer | Uint8Array | string): NormalizedLog {
    let rawBuffer: Buffer;
    let rawString: string;

    if (typeof rawInput === "string") {
      rawBuffer = Buffer.from(rawInput, "utf-8");
      rawString = rawInput;
    } else {
      rawBuffer = Buffer.isBuffer(rawInput) ? rawInput : Buffer.from(rawInput);
      rawString = this.decodeBuffer(rawBuffer);
    }

    const rawSha256 = crypto
      .createHash("sha256")
      .update(rawBuffer)
      .digest("hex");

    // 1. Detect UTF-8 BOM and strip if present
    let content = rawString;
    let encoding = "UTF-8";
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
      encoding = "UTF-8 (BOM)";
    }

    // 2. Detect line ending types before normalization
    const lineEndingType = this.detectLineEndings(content);

    // 3. Detect and count ANSI escapes
    const hasAnsiEscapes = ANSI_REGEX.test(content);
    // Reset regex index
    ANSI_REGEX.lastIndex = 0;

    // 4. Strip ANSI escapes
    let sanitized = content.replace(ANSI_REGEX, "");

    // 5. Handle backspace erasure (char + \b or \b + space + \b)
    sanitized = this.processBackspaces(sanitized);

    // 6. Detect pagination markers
    const paginationMatches = sanitized.match(PAGINATION_MARKER_REGEX);
    const hasPaginationMarkers = Boolean(
      paginationMatches && paginationMatches.length > 0
    );
    const paginationMarkerCount = paginationMatches
      ? paginationMatches.length
      : 0;

    // 7. Standardize all line breaks to \n and remove standalone \r
    sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 8. Split into lines
    const rawLines = sanitized.split("\n");

    // 9. Detect PuTTY banners and filter or preserve metadata
    const detectedBanners: string[] = [];
    const lines: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (PUTTY_BANNER_REGEX.test(line.trim())) {
        detectedBanners.push(line.trim());
      } else {
        // Clean out terminal pagination artifacts on a line if standalone
        const isStandalonePagination =
          line.trim().match(/^(?:--\s*More\s*--(?:[ \t]*(?:\(page\s+\d+\))?)?|---\s*\(more(?:\s+\d+%)?\)\s*---+)$/i) !== null;
        if (!isStandalonePagination) {
          // Remove inline pagination prompts like "--More-- " or "---(more 12%)---" at line boundaries
          const cleanedLine = line
            .replace(/--\s*More\s*--(?:[ \t]*(?:\(page\s+\d+\))?)?/gi, "")
            .replace(/---\s*\(more(?:\s+\d+%)?\)\s*---+/gi, "")
            .trimEnd();
          lines.push(cleanedLine);
        }
      }
    }

    // Join back into normalizedContent
    const normalizedContent = lines.join("\n");

    return {
      rawSha256,
      normalizedContent,
      lines,
      encoding,
      hasAnsiEscapes,
      hasPaginationMarkers,
      paginationMarkerCount,
      detectedBanners,
      lineEndingType,
    };
  }

  /**
   * Decodes a buffer safely, falling back to latin1/ascii if utf-8 contains invalid replacement chars.
   */
  private decodeBuffer(buffer: Buffer): string {
    try {
      const utf8Text = buffer.toString("utf-8");
      // If there are no replacement characters, utf-8 is valid
      if (!utf8Text.includes("\ufffd")) {
        return utf8Text;
      }
      // Try latin1 fallback if severe utf-8 corruption is suspected
      const latin1Text = buffer.toString("latin1");
      return latin1Text;
    } catch {
      return buffer.toString("latin1");
    }
  }

  /**
   * Detects whether line endings are CRLF, LF, CR, or MIXED.
   */
  private detectLineEndings(text: string): LineEndingType {
    const hasCrlf = text.includes("\r\n");
    const withoutCrlf = text.replace(/\r\n/g, "");
    const hasLf = withoutCrlf.includes("\n");
    const hasCr = withoutCrlf.includes("\r");

    if (hasCrlf && !hasLf && !hasCr) return "CRLF";
    if (!hasCrlf && hasLf && !hasCr) return "LF";
    if (!hasCrlf && !hasLf && hasCr) return "CR";
    if ((hasCrlf && hasLf) || (hasCrlf && hasCr) || (hasLf && hasCr))
      return "MIXED";
    return "LF";
  }

  /**
   * Resolves backspace characters (\b / \x08) to simulate terminal backspace deletion.
   */
  private processBackspaces(text: string): string {
    if (!text.includes("\b")) return text;

    const chars = Array.from(text);
    const result: string[] = [];

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char === "\b") {
        if (result.length > 0 && result[result.length - 1] !== "\n") {
          result.pop();
        }
      } else {
        result.push(char);
      }
    }

    return result.join("");
  }
}

export const logNormalizer = new LogNormalizer();
