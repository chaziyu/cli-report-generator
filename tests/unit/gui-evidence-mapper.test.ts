import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { guiEvidenceMapper } from "@/core/evidence/gui-evidence-mapper";

describe("GuiEvidenceMapper Unit Tests", () => {
  it("validates authentic PNG image content with correct dimensions and format", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 300,
        height: 200,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await guiEvidenceMapper.validateImageContent(pngBuffer);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe("png");
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("validates authentic JPEG image content with correct dimensions and format", async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 400,
        height: 250,
        channels: 3,
        background: { r: 50, g: 150, b: 250 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await guiEvidenceMapper.validateImageContent(jpegBuffer);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe("jpeg");
    expect(result.width).toBe(400);
    expect(result.height).toBe(250);
  });

  it("rejects empty image buffers", async () => {
    const empty = Buffer.alloc(0);
    const result = await guiEvidenceMapper.validateImageContent(empty);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects image buffers exceeding size limits", async () => {
    const fakeBuffer = Buffer.alloc(50);
    // test with a small maxSizeBytes parameter e.g. 10 bytes
    const result = await guiEvidenceMapper.validateImageContent(fakeBuffer, 10);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("maximum allowed size");
  });

  it("rejects non-image files with invalid magic bytes (e.g. fake PNG extension with text content)", async () => {
    const fakeTextFile = Buffer.from("This is not a real image file, just plain text.");
    const result = await guiEvidenceMapper.validateImageContent(fakeTextFile);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Invalid image format");
  });

  it("rejects corrupted images that have magic bytes but corrupted payload", async () => {
    // PNG magic bytes followed by garbage
    const corruptedPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("random corrupted garbage data 1234567890"),
    ]);
    const result = await guiEvidenceMapper.validateImageContent(corruptedPng);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("decoding failed");
  });

  it("rejects tiny images below 10x10 dimensions", async () => {
    const tinyBuffer = await sharp({
      create: {
        width: 5,
        height: 5,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await guiEvidenceMapper.validateImageContent(tinyBuffer);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("too small");
  });

  it("extracts PM checklist tasks prioritizing primary GUI items (Appendix 9 & 16)", () => {
    const tasks = guiEvidenceMapper.getAvailableTasks("fortigate");
    expect(tasks.length).toBeGreaterThan(0);

    const guiAccess = tasks.find((t) => t.checkId === "fg-mgmt-gui");
    expect(guiAccess).toBeDefined();
    expect(guiAccess?.isPrimaryGui).toBe(true);
    expect(guiAccess?.appendixMapping).toContain("Appendix 9");

    const backup = tasks.find((t) => t.checkId === "fg-sys-backup");
    expect(backup).toBeDefined();
    expect(backup?.isPrimaryGui).toBe(true);
    expect(backup?.appendixMapping).toContain("Appendix 16");
  });
});
