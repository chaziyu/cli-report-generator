import sharp from "sharp";
import { vendorRegistry, VendorId } from "@/vendors";

export interface GuiTaskOption {
  checkId: string;
  taskName: string;
  itemNumber?: string;
  appendixMapping: string;
  isPrimaryGui: boolean;
}

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  format?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export class GuiEvidenceMapper {
  /**
   * Retrieves available PM checklist tasks and their associated appendices.
   * Primary GUI/manual tasks (GUI Access, Backup) are prioritized.
   */
  getAvailableTasks(vendorId: string = "fortigate"): GuiTaskOption[] {
    const adapter = vendorRegistry.get(vendorId as VendorId);
    if (!adapter) return [];

    const checklist = adapter.getChecklistDefinition();

    return checklist.map((item) => {
      const isPrimaryGui =
        item.sourceType === "GUI_MANUAL" ||
        item.id === "fg-mgmt-gui" ||
        item.id === "fg-sys-backup";

      return {
        checkId: item.id,
        taskName: item.taskName,
        itemNumber: item.itemNumber,
        appendixMapping:
          item.targetAppendix || (vendorId === "fortigate" ? "Appendix - Manual Evidence" : "Manual evidence"),
        isPrimaryGui,
      };
    });
  }

  /**
   * Validates image binary data server-side using magic byte detection
   * and Sharp metadata extraction to guarantee safe PNG/JPEG content.
   */
  async validateImageContent(
    buffer: Buffer | Uint8Array,
    maxSizeBytes: number = 20 * 1024 * 1024 // 20 MB limit
  ): Promise<ImageValidationResult> {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const sizeBytes = buf.byteLength;

    if (sizeBytes === 0) {
      return { isValid: false, error: "Image file is empty (0 bytes)." };
    }

    if (sizeBytes > maxSizeBytes) {
      return {
        isValid: false,
        error: `Image exceeds maximum allowed size of ${Math.round(maxSizeBytes / (1024 * 1024))} MB.`,
      };
    }

    // 1. Magic bytes signature validation
    const isPng =
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a;

    const isJpeg =
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff;

    if (!isPng && !isJpeg) {
      return {
        isValid: false,
        error: "Invalid image format. Only authentic PNG and JPEG images are supported for report appendices.",
      };
    }

    // 2. Decode image using sharp to ensure it is not malformed or corrupted
    try {
      const metadata = await sharp(buf).metadata();

      if (!metadata.width || !metadata.height) {
        return {
          isValid: false,
          error: "Corrupted image file: unable to decode dimensions.",
        };
      }

      if (metadata.width < 10 || metadata.height < 10) {
        return {
          isValid: false,
          error: `Image dimensions (${metadata.width}x${metadata.height}) are too small for documentation evidence.`,
        };
      }

      if (metadata.width > 8192 || metadata.height > 8192) {
        return {
          isValid: false,
          error: `Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed dimensions of 8192x8192.`,
        };
      }

      return {
        isValid: true,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        sizeBytes,
      };
    } catch (err) {
      return {
        isValid: false,
        error: `Image decoding failed: ${err instanceof Error ? err.message : "Malformed image data"}`,
      };
    }
  }
}

export const guiEvidenceMapper = new GuiEvidenceMapper();
