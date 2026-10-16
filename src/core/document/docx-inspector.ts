import fs from "fs/promises";
import crypto from "crypto";
import JSZip from "jszip";
import { reportLayoutRegistry } from "@/report-layouts";
import { DocumentInspectionResult } from "@/report-layouts/types";

export class DocxInspector {
  /**
   * Inspects a Word document (.docx) non-destructively, returning a structural map of editable fields.
   */
  async inspectDocument(
    input: Buffer | Uint8Array | string
  ): Promise<DocumentInspectionResult> {
    let buffer: Buffer;

    if (typeof input === "string") {
      buffer = await fs.readFile(input);
    } else if (Buffer.isBuffer(input)) {
      buffer = input;
    } else {
      buffer = Buffer.from(input);
    }

    // 1. Calculate SHA-256 hash to guarantee source integrity
    const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileSizeBytes = buffer.byteLength;

    // 2. Open ZIP package
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (err) {
      throw new Error(
        `Failed to parse file as valid DOCX archive: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    // 3. Read word/document.xml
    const docEntry = zip.file("word/document.xml");
    if (!docEntry) {
      throw new Error("Invalid DOCX format: 'word/document.xml' entry not found.");
    }
    const documentXml = await docEntry.async("string");

    // 4. Read relationships if present (for image tracking)
    let relsXml: string | undefined;
    const relsEntry = zip.file("word/_rels/document.xml.rels");
    if (relsEntry) {
      relsXml = await relsEntry.async("string");
    }

    // 5. Extract tables and summary text
    const tables = documentXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) || [];
    const textSummary = documentXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // 6. Count images and drawings
    const drawings = documentXml.match(/<w:drawing[\s>]/g) || [];
    const mediaFiles = Object.keys(zip.files).filter((k) =>
      k.startsWith("word/media/")
    );

    // 7. Detect layout
    const layout = reportLayoutRegistry.detectLayout(documentXml, textSummary);
    const warnings: string[] = [];

    if (!layout) {
      warnings.push(
        "Document structure does not match a known CTC QMS template layout. Custom manual mapping may be required."
      );

      return {
        isValidDocx: true,
        sha256Hash,
        fileSizeBytes,
        layoutId: "unknown",
        layoutName: "Unknown Document Layout",
        vendorId: "other",
        isSupportedLayout: false,
        metadata: {},
        editableChecklistRows: [],
        appendixContainers: [],
        protectedSections: [],
        totalTables: tables.length,
        totalImages: mediaFiles.length || drawings.length,
        warnings,
      };
    }

    // 8. Extract structural maps using the matched layout definition
    const metadata = layout.extractMetadata(documentXml, tables);
    const editableChecklistRows = layout.mapChecklistRows(tables);
    const appendixContainers = layout.mapAppendixContainers(documentXml, relsXml);
    const protectedSections = layout.identifyProtectedSections(tables);

    if (editableChecklistRows.length === 0) {
      warnings.push("No checklist items could be located in document tables.");
    }

    if (appendixContainers.length === 0) {
      warnings.push("No appendix containers were detected in document.");
    }

    return {
      isValidDocx: true,
      sha256Hash,
      fileSizeBytes,
      layoutId: layout.id,
      layoutName: layout.name,
      vendorId: layout.vendorId,
      isSupportedLayout: true,
      metadata,
      editableChecklistRows,
      appendixContainers,
      protectedSections,
      totalTables: tables.length,
      totalImages: mediaFiles.length || drawings.length,
      warnings,
    };
  }
}

export const docxInspector = new DocxInspector();
