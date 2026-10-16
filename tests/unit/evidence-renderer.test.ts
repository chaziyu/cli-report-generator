import { describe, it, expect } from "vitest";
import { evidenceRenderer } from "@/core/evidence/evidence-renderer";

describe("EvidenceRenderer: CLI Terminal Image Generation", () => {
  it("renders a single-page terminal image as a valid PNG and SVG", async () => {
    const pages = await evidenceRenderer.renderEvidencePages({
      title: "Hard Disk Space",
      appendixMapping: "Appendix 1",
      command: "fnsysctl df",
      deviceHostname: "FGT200F-HQ-PRI",
      rawOutput: `Filesystem           1k-blocks      Used Available Use% Mounted on
none                    819200       124    819076   0% /tmp
none                   8192000    421040   7770960   5% /dev/shm
/dev/nodev             2097152    184320   1912832   9% /var/log`,
    });

    expect(pages.length).toBe(1);
    const page = pages[0];
    expect(page.pageNumber).toBe(1);
    expect(page.totalPages).toBe(1);
    expect(page.fileName).toBe("appendix-1-hard-disk-space-page-1-of-1.png");

    // Verify PNG magic header bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    expect(page.pngBuffer).toBeInstanceOf(Buffer);
    expect(page.pngBuffer.length).toBeGreaterThan(1000);
    expect(page.pngBuffer[0]).toBe(0x89);
    expect(page.pngBuffer[1]).toBe(0x50); // P
    expect(page.pngBuffer[2]).toBe(0x4e); // N
    expect(page.pngBuffer[3]).toBe(0x47); // G

    // Check SVG text content
    expect(page.svgString).toContain("Appendix 1 — Hard Disk Space");
    expect(page.svgString).toContain("FGT200F-HQ-PRI # ");
    expect(page.svgString).toContain("fnsysctl df");
    expect(page.svgString).toContain("/var/log");
    expect(page.svgString).toContain("Rendered from PuTTY session log");
  });

  it("paginates long CLI outputs cleanly across multiple numbered pages", async () => {
    // Generate 60 lines of output
    const lines: string[] = [];
    for (let i = 1; i <= 60; i++) {
      lines.push(`S*  10.${i}.0.0/16 [10/0] via 192.168.1.254, port1`);
    }

    const pages = await evidenceRenderer.renderEvidencePages({
      title: "Routing Table",
      appendixMapping: "Appendix 7",
      command: "get router info routing-table all",
      deviceHostname: "FGT200F-HQ-PRI",
      rawOutput: lines.join("\n"),
      maxLinesPerPage: 25, // Forces 3 pages
    });

    expect(pages.length).toBe(3);

    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].totalPages).toBe(3);
    expect(pages[0].svgString).toContain("Page 1 of 3");

    expect(pages[1].pageNumber).toBe(2);
    expect(pages[1].totalPages).toBe(3);
    expect(pages[1].svgString).toContain("Page 2 of 3");

    expect(pages[2].pageNumber).toBe(3);
    expect(pages[2].totalPages).toBe(3);
    expect(pages[2].svgString).toContain("Page 3 of 3");
  });

  it("escapes XML special characters safely (&, <, >)", async () => {
    const rawWithXmlChars = `
Interface: port1 <UP,BROADCAST,RUNNING> mtu 1500
Flags: <SIMPLEX,MULTICAST> metric 0
Test & validation: a < b and c > d & done
`;
    const pages = await evidenceRenderer.renderEvidencePages({
      title: "Interface Detail",
      command: "diagnose ip address list",
      rawOutput: rawWithXmlChars,
    });

    expect(pages.length).toBe(1);
    // Should NOT throw sharp / rsvg parsing error
    expect(pages[0].pngBuffer.length).toBeGreaterThan(500);
    expect(pages[0].svgString).toContain("&lt;UP,BROADCAST,RUNNING&gt;");
    expect(pages[0].svgString).toContain("Test &amp; validation");
  });

  it("redacts sensitive passwords and reflects redaction count in the footer", async () => {
    const rawWithPassword = `
config system admin
    edit "backup-user"
        set password ENC SecretEncryptedPassword123==
    next
end
`;
    const pages = await evidenceRenderer.renderEvidencePages({
      title: "Admin Users",
      command: "show system admin",
      rawOutput: rawWithPassword,
      redactSecrets: true,
    });

    expect(pages.length).toBe(1);
    expect(pages[0].redactionsApplied).toBe(1);
    expect(pages[0].svgString).toContain("[REDACTED_PASSWORD]");
    expect(pages[0].svgString).not.toContain("SecretEncryptedPassword123==");
    expect(pages[0].svgString).toContain("1 sensitive value(s) sanitized");
  });
});
