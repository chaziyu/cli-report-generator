import sharp from "sharp";
import { sanitizeCliOutput } from "./redaction";
import { EvidenceRenderOptions, RenderedEvidencePage } from "./types";

/**
 * Escapes characters for safe inclusion in SVG XML text nodes.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wraps long terminal output lines so they do not exceed character width.
 */
function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) {
    return [line];
  }

  const wrapped: string[] = [];
  let remaining = line;

  while (remaining.length > maxChars) {
    // Try to break at space or punctuation near maxChars
    let breakIdx = remaining.lastIndexOf(" ", maxChars);
    if (breakIdx === -1 || breakIdx < maxChars * 0.7) {
      breakIdx = maxChars;
    }

    wrapped.push(remaining.substring(0, breakIdx));
    remaining = "    " + remaining.substring(breakIdx).trimStart();
  }

  if (remaining.length > 0) {
    wrapped.push(remaining);
  }

  return wrapped;
}

/**
 * Splits raw CLI text into wrapped lines and partitions them into page chunks.
 */
function paginateOutput(
  rawOutput: string,
  maxLinesPerPage: number,
  maxCharsPerLine: number
): string[][] {
  const rawLines = rawOutput.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const wrappedLines: string[] = [];

  for (const rawLine of rawLines) {
    const wrapped = wrapLine(rawLine, maxCharsPerLine);
    wrappedLines.push(...wrapped);
  }

  // Remove trailing empty lines
  while (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1].trim() === "") {
    wrappedLines.pop();
  }

  if (wrappedLines.length === 0) {
    return [["(No command output recorded)"]];
  }

  const pages: string[][] = [];
  for (let i = 0; i < wrappedLines.length; i += maxLinesPerPage) {
    pages.push(wrappedLines.slice(i, i + maxLinesPerPage));
  }

  return pages;
}

export class EvidenceRenderer {
  private defaultMaxLinesPerPage = 34;
  private defaultMaxCharsPerLine = 92;
  private defaultFontSize = 13;
  private lineHeight = 21;
  private imageWidth = 960;

  /**
   * Renders CLI command and its authentic output into terminal-styled SVG and PNG pages.
   */
  async renderEvidencePages(
    options: EvidenceRenderOptions
  ): Promise<RenderedEvidencePage[]> {
    const {
      title,
      command,
      rawOutput,
      deviceHostname,
      appendixMapping,
      sourceLabel = "Rendered from PuTTY session log (SHA-256 verified)",
      maxLinesPerPage = this.defaultMaxLinesPerPage,
      maxCharsPerLine = this.defaultMaxCharsPerLine,
      fontSize = this.defaultFontSize,
      redactSecrets = true,
    } = options;

    let processedOutput = rawOutput;
    let redactionsApplied = 0;

    if (redactSecrets) {
      const redaction = sanitizeCliOutput(rawOutput);
      processedOutput = redaction.sanitizedText;
      redactionsApplied = redaction.redactionsApplied;
    }

    const pageChunks = paginateOutput(
      processedOutput,
      maxLinesPerPage,
      maxCharsPerLine
    );
    const totalPages = pageChunks.length;
    const renderedPages: RenderedEvidencePage[] = [];

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const lines = pageChunks[pageIdx];
      const pageNumber = pageIdx + 1;

      const svgString = this.generateSvg({
        title,
        command,
        lines,
        pageNumber,
        totalPages,
        deviceHostname,
        appendixMapping,
        sourceLabel,
        fontSize,
        redactionsApplied,
      });

      // Render crisp PNG via Sharp at 144 DPI density
      const pngBuffer = await sharp(Buffer.from(svgString), { density: 144 })
        .png({ compressionLevel: 8 })
        .toBuffer();

      const safeTitle = [appendixMapping, title]
        .filter(Boolean)
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const fileName = `${safeTitle}-page-${pageNumber}-of-${totalPages}.png`;

      renderedPages.push({
        pageNumber,
        totalPages,
        pngBuffer,
        svgString,
        fileName,
        redactionsApplied,
        lineCount: lines.length,
      });
    }

    return renderedPages;
  }

  /**
   * Generates a high-fidelity SVG document representing the terminal window.
   */
  private generateSvg(params: {
    title: string;
    command: string;
    lines: string[];
    pageNumber: number;
    totalPages: number;
    deviceHostname?: string;
    appendixMapping?: string;
    sourceLabel: string;
    fontSize: number;
    redactionsApplied: number;
  }): string {
    const {
      title,
      command,
      lines,
      pageNumber,
      totalPages,
      deviceHostname,
      appendixMapping,
      sourceLabel,
      fontSize,
      redactionsApplied,
    } = params;

    const headerHeight = 56;
    const promptHeight = 44;
    const footerHeight = 42;
    const padding = 20;

    const contentHeight = Math.max(lines.length * this.lineHeight + padding * 2, 180);
    const totalHeight = headerHeight + promptHeight + contentHeight + footerHeight;

    const hostLabel = deviceHostname ? `${deviceHostname} # ` : "$ ";
    const displayHeader = appendixMapping ? `${appendixMapping} — ${title}` : title;
    const isMultiPage = totalPages > 1;

    // Build text elements
    const textElements = lines
      .map((line, index) => {
        const yPos = headerHeight + promptHeight + padding + (index + 1) * this.lineHeight - 4;
        return `<text x="${padding + 4}" y="${yPos}" fill="#e2e8f0" font-family="'Consolas', 'Courier New', 'Menlo', monospace" font-size="${fontSize}px" xml:space="preserve">${escapeXml(
          line
        )}</text>`;
      })
      .join("\n      ");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.imageWidth} ${totalHeight}" width="${this.imageWidth}" height="${totalHeight}">
  <defs>
    <linearGradient id="header-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="prompt-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="100%" stop-color="#0d1527" />
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.35" />
    </filter>
  </defs>

  <!-- Window Container -->
  <rect x="0" y="0" width="${this.imageWidth}" height="${totalHeight}" rx="10" fill="#090d16" stroke="#334155" stroke-width="1.5" />

  <!-- Window Title Bar -->
  <rect x="0" y="0" width="${this.imageWidth}" height="${headerHeight}" rx="10" fill="url(#header-grad)" />
  <!-- Straighten bottom corners of header -->
  <rect x="0" y="${headerHeight - 8}" width="${this.imageWidth}" height="8" fill="#141e33" />
  <line x1="0" y1="${headerHeight}" x2="${this.imageWidth}" y2="${headerHeight}" stroke="#334155" stroke-width="1" />

  <!-- Mac/Terminal Style Window Controls -->
  <circle cx="24" cy="${headerHeight / 2}" r="6" fill="#ef4444" />
  <circle cx="44" cy="${headerHeight / 2}" r="6" fill="#f59e0b" />
  <circle cx="64" cy="${headerHeight / 2}" r="6" fill="#10b981" />

  <!-- Window Title -->
  <text x="${this.imageWidth / 2}" y="${headerHeight / 2 + 5}" text-anchor="middle" fill="#f1f5f9" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13px" font-weight="600">
    ${escapeXml(displayHeader)}
  </text>

  <!-- Page Indicator Badge (Top Right) -->
  ${
    isMultiPage
      ? `<rect x="${this.imageWidth - 116}" y="14" width="96" height="26" rx="6" fill="#1e293b" stroke="#475569" stroke-width="1" />
  <text x="${this.imageWidth - 68}" y="31" text-anchor="middle" fill="#94a3b8" font-family="-apple-system, sans-serif" font-size="11px" font-weight="600">Page ${pageNumber} of ${totalPages}</text>`
      : `<text x="${this.imageWidth - 24}" y="33" text-anchor="end" fill="#64748b" font-family="-apple-system, sans-serif" font-size="11px" font-weight="500">CTC Evidence</text>`
  }

  <!-- Prompt Bar (Command Execution) -->
  <rect x="0" y="${headerHeight}" width="${this.imageWidth}" height="${promptHeight}" fill="url(#prompt-grad)" />
  <line x1="0" y1="${headerHeight + promptHeight}" x2="${this.imageWidth}" y2="${headerHeight + promptHeight}" stroke="#1e293b" stroke-width="1" />

  <!-- Prompt Text -->
  <text x="20" y="${headerHeight + promptHeight / 2 + 5}" fill="#34d399" font-family="'Consolas', 'Courier New', monospace" font-size="13px" font-weight="bold">
    <tspan fill="#38bdf8">${escapeXml(hostLabel)}</tspan><tspan fill="#4ade80">${escapeXml(command)}</tspan>
  </text>

  <!-- Output Lines -->
  <g>
      ${textElements}
  </g>

  <!-- Footer Bar -->
  <rect x="0" y="${totalHeight - footerHeight}" width="${this.imageWidth}" height="${footerHeight}" fill="#0f172a" />
  <!-- Straighten top corners of footer -->
  <rect x="0" y="${totalHeight - footerHeight}" width="${this.imageWidth}" height="4" fill="#0f172a" />
  <line x1="0" y1="${totalHeight - footerHeight}" x2="${this.imageWidth}" y2="${totalHeight - footerHeight}" stroke="#1e293b" stroke-width="1" />

  <!-- Footer Text: Source Label -->
  <text x="20" y="${totalHeight - footerHeight / 2 + 4}" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11px">
    ${escapeXml(sourceLabel)}
  </text>

  <!-- Footer Text: Redaction or Timestamp -->
  ${
    redactionsApplied > 0
      ? `<text x="${this.imageWidth - 20}" y="${totalHeight - footerHeight / 2 + 4}" text-anchor="end" fill="#fbbf24" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11px" font-weight="500">
    &#9888; ${redactionsApplied} sensitive value(s) sanitized
  </text>`
      : `<text x="${this.imageWidth - 20}" y="${totalHeight - footerHeight / 2 + 4}" text-anchor="end" fill="#475569" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10px">
    CTC Global PM Automation Engine
  </text>`
  }
</svg>`;
  }
}

export const evidenceRenderer = new EvidenceRenderer();
