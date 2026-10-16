export type FileCategory = "logs" | "reports" | "evidence" | "exports" | "screenshots";

export interface StoredFileMetadata {
  originalFilename: string;
  storedFilename: string;
  storagePath: string; // Relative path from storage root
  absolutePath: string;
  hashSha256: string;
  sizeBytes: number;
  mimeType: string;
}

export interface IStorageService {
  saveFile(
    sessionId: string,
    category: FileCategory,
    originalFilename: string,
    content: Buffer | Uint8Array,
    mimeType?: string
  ): Promise<StoredFileMetadata>;

  getFile(storagePath: string): Promise<Buffer>;

  deleteFile(storagePath: string): Promise<void>;

  fileExists(storagePath: string): Promise<boolean>;

  calculateSha256(content: Buffer | Uint8Array): string;

  resolveAbsolutePath(storagePath: string): string;
}
