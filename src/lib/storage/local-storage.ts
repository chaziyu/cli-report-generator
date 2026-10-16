import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { FileCategory, IStorageService, StoredFileMetadata } from "./types";

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir =
      baseDir ||
      process.env.STORAGE_DIR ||
      path.join(process.cwd(), "data", "storage");
  }

  calculateSha256(content: Buffer | Uint8Array): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  resolveAbsolutePath(storagePath: string): string {
    // Prevent directory traversal attacks
    const normalized = path.normalize(storagePath).replace(/^(\.\.[\/\\])+/, "");
    return path.join(this.baseDir, normalized);
  }

  private sanitizeFilename(filename: string): string {
    const base = path.basename(filename);
    return base.replace(/[^a-zA-Z0-9._\-]/g, "_");
  }

  async saveFile(
    sessionId: string,
    category: FileCategory,
    originalFilename: string,
    content: Buffer | Uint8Array,
    mimeType?: string
  ): Promise<StoredFileMetadata> {
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "");
    const sanitizedFilename = this.sanitizeFilename(originalFilename);
    const timestamp = Date.now();
    const storedFilename = `${timestamp}_${sanitizedFilename}`;

    const relativeSubdir = path.join(sanitizedSessionId, category);
    const targetDir = path.join(this.baseDir, relativeSubdir);
    await fs.mkdir(targetDir, { recursive: true });

    const relativePath = path.join(relativeSubdir, storedFilename);
    const absolutePath = path.join(targetDir, storedFilename);

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    await fs.writeFile(absolutePath, buffer);

    const hashSha256 = this.calculateSha256(buffer);
    const sizeBytes = buffer.byteLength;

    const detectedMime =
      mimeType ||
      this.inferMimeType(originalFilename);

    return {
      originalFilename,
      storedFilename,
      storagePath: relativePath.replace(/\\/g, "/"),
      absolutePath,
      hashSha256,
      sizeBytes,
      mimeType: detectedMime,
    };
  }

  async getFile(storagePath: string): Promise<Buffer> {
    const absPath = this.resolveAbsolutePath(storagePath);
    return await fs.readFile(absPath);
  }

  async deleteFile(storagePath: string): Promise<void> {
    const absPath = this.resolveAbsolutePath(storagePath);
    try {
      await fs.unlink(absPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    const absPath = this.resolveAbsolutePath(storagePath);
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  private inferMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case ".txt":
      case ".log":
        return "text/plain";
      case ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".json":
        return "application/json";
      default:
        return "application/octet-stream";
    }
  }
}

export const storage = new LocalStorageService();
