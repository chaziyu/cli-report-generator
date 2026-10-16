import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalStorageService } from "@/lib/storage/local-storage";
import fs from "fs/promises";
import path from "path";

describe("LocalStorageService", () => {
  const testStorageDir = path.join(process.cwd(), "data", "test-storage");
  let storage: LocalStorageService;

  beforeEach(async () => {
    storage = new LocalStorageService(testStorageDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("calculates correct SHA-256 hash", () => {
    const content = Buffer.from("Hello CTC PM Automation");
    const hash = storage.calculateSha256(content);
    expect(hash).toBe(
      "1485caec0fa09a359c753041f0b16a18732f3a70f5680455320dfbaf47e3bbb3"
    );
  });

  it("saves and retrieves a file correctly", async () => {
    const sessionId = "session-123";
    const filename = "putty_session.txt";
    const content = Buffer.from("FortiGate-VM64 # get system status\n");

    const meta = await storage.saveFile(
      sessionId,
      "logs",
      filename,
      content,
      "text/plain"
    );

    expect(meta.originalFilename).toBe(filename);
    expect(meta.sizeBytes).toBe(content.byteLength);
    expect(meta.mimeType).toBe("text/plain");
    expect(meta.storagePath).toContain("session-123/logs/");

    const exists = await storage.fileExists(meta.storagePath);
    expect(exists).toBe(true);

    const retrieved = await storage.getFile(meta.storagePath);
    expect(retrieved.toString()).toBe("FortiGate-VM64 # get system status\n");
  });

  it("deletes a stored file", async () => {
    const meta = await storage.saveFile(
      "session-del",
      "reports",
      "test.docx",
      Buffer.from("dummy docx content")
    );

    expect(await storage.fileExists(meta.storagePath)).toBe(true);
    await storage.deleteFile(meta.storagePath);
    expect(await storage.fileExists(meta.storagePath)).toBe(false);
  });

  it("prevents directory traversal attacks", () => {
    const unsafePath = "../../../etc/passwd";
    const resolved = storage.resolveAbsolutePath(unsafePath);
    expect(resolved.startsWith(testStorageDir)).toBe(true);
  });
});
