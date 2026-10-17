import JSZip from "jszip";
import { docxInspector } from "./docx-inspector";
import { OoxmlRelationships } from "./ooxml-relationships";
import { docxValidator, DocxValidationResult } from "./docx-validator";
import {
  DocumentInspectionResult,
  EditableChecklistRowTarget,
} from "@/report-layouts/types";

export interface DecisionToApply {
  checkId: string;
  finalStatus: string; // "PASS", "FAIL", "WARNING", "NA", "REVIEW"
  finalRemarks: string;
  reviewer?: string;
  reviewNotes?: string;
}

export interface EvidenceToInsert {
  id?: string;
  checkIds: string[];
  appendixNumber?: number;
  imageBuffer: Buffer | Uint8Array;
  title: string;
  caption?: string;
  pageNumber?: number;
  totalPages?: number;
  sourceLabel?: string;
  replaceExistingMedia?: boolean; // Explicit engineer approval required to overwrite original media
}

export interface AppliedRowChange {
  itemNumber: string;
  checkId: string;
  taskName: string;
  previousStatus: string;
  newStatus: string;
  previousRemarks: string;
  newRemarks: string;
}

export interface AppliedAppendixChange {
  appendixNumber: number;
  appendixTitle: string;
  action: "PRESERVED_ORIGINAL_AND_APPENDED" | "REPLACED_EXISTING" | "INSERTED_NEW";
  imageRelId: string;
  imagePath: string;
  title?: string;
}

export interface ReportChangeSummary {
  appliedRowChanges: AppliedRowChange[];
  appliedAppendixChanges: AppliedAppendixChange[];
  unappliedCheckCount: number;
  totalEditableRows: number;
  sourceDocHash: string;
  generatedAt: string;
}

export interface EditReportOptions {
  originalDocxBuffer: Buffer | Uint8Array;
  decisions: DecisionToApply[];
  evidences?: EvidenceToInsert[];
  deviceMetadata?: {
    model?: string;
    hostname?: string;
    serialNumber?: string;
    engineerName?: string;
    reportDate?: string;
  };
}

export interface EditReportResult {
  modifiedBuffer: Buffer;
  changeSummary: ReportChangeSummary;
  validation: DocxValidationResult;
  inspection: DocumentInspectionResult;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export class DocxEditor {
  /**
   * Applies approved review decisions and CLI terminal evidence to a CTC Word report.
   */
  async editReport(options: EditReportOptions): Promise<EditReportResult> {
    const { originalDocxBuffer, decisions, evidences = [], deviceMetadata } = options;

    // 1. Inspect original document to get layout targets
    const inspection = await docxInspector.inspectDocument(originalDocxBuffer);
    if (!inspection.isSupportedLayout && inspection.editableChecklistRows.length === 0) {
      throw new Error(
        `Unsupported document layout (${inspection.layoutName}). Cannot locate checklist row targets safely.`
      );
    }

    // 2. Open ZIP archive
    const zip = await JSZip.loadAsync(originalDocxBuffer);

    // 3. Read word/document.xml and relationships
    const docEntry = zip.file("word/document.xml");
    if (!docEntry) {
      throw new Error("Invalid DOCX: 'word/document.xml' not found in package.");
    }
    let documentXml = await docEntry.async("string");

    const relsEntry = zip.file("word/_rels/document.xml.rels");
    const relsXml = relsEntry ? await relsEntry.async("string") : "";
    const relsManager = OoxmlRelationships.fromXml(relsXml);

    // 4. Ensure PNG image content type is registered in [Content_Types].xml
    await OoxmlRelationships.ensurePngContentType(zip);

    // 5. Build lookup maps for approved decisions
    const decisionMap = new Map<string, DecisionToApply>();
    for (const dec of decisions) {
      decisionMap.set(dec.checkId, dec);
    }

    const appliedRowChanges: AppliedRowChange[] = [];
    const appliedAppendixChanges: AppliedAppendixChange[] = [];

    // 6. Split document XML into tables
    const tableRegex = /<w:tbl[\s>][\s\S]*?<\/w:tbl>/g;
    const tables = documentXml.match(tableRegex) || [];

    // Group checklist targets by tableIndex
    const targetsByTable = new Map<number, EditableChecklistRowTarget[]>();
    for (const target of inspection.editableChecklistRows) {
      const list = targetsByTable.get(target.tableIndex) || [];
      list.push(target);
      targetsByTable.set(target.tableIndex, list);
    }

    // 7. Apply approved row changes table by table
    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const targetsInTable = targetsByTable.get(tIdx);
      if (!targetsInTable || targetsInTable.length === 0) continue;

      const tableXml = tables[tIdx];
      const rows = tableXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

      let tableModified = false;

      // Group targets in this table by rowIndex
      for (const target of targetsInTable) {
        const decision = decisionMap.get(target.checkId);
        // Only apply if approved/modified decision exists
        if (!decision) continue;

        if (target.rowIndex >= rows.length) continue;

        const rowXml = rows[target.rowIndex];
        const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];

        if (target.statusCellIndex >= cells.length || target.remarksCellIndex >= cells.length) {
          continue;
        }

        const origStatusCell = cells[target.statusCellIndex];
        const origRemarksCell = cells[target.remarksCellIndex];

        // Update status cell
        const updatedStatusCell = this.updateStatusCell(
          origStatusCell,
          decision.finalStatus
        );

        // Update remarks cell
        const updatedRemarksCell = this.updateRemarksCell(
          origRemarksCell,
          decision.finalRemarks
        );

        // Reconstruct row XML
        cells[target.statusCellIndex] = updatedStatusCell;
        cells[target.remarksCellIndex] = updatedRemarksCell;

        // Replace cells in rowXml
        const newRowXml = this.reassembleRow(rowXml, cells);
        rows[target.rowIndex] = newRowXml;
        tableModified = true;

        appliedRowChanges.push({
          itemNumber: target.itemNumber,
          checkId: target.checkId,
          taskName: target.taskName,
          previousStatus: target.currentStatus,
          newStatus: decision.finalStatus,
          previousRemarks: target.currentRemarks,
          newRemarks: decision.finalRemarks,
        });
      }

      if (tableModified) {
        const newTableXml = this.reassembleTable(tableXml, rows);
        // Replace this table in documentXml
        documentXml = documentXml.replace(tableXml, () => newTableXml);
      }
    }

    // 8. Apply Appendix Evidence Images (Preserve original by default, append multi-images, replace only if approved)
    let docPrCounter = 2000;
    for (const container of inspection.appendixContainers) {
      // Find matching evidence for this appendix
      const matchingEvs = evidences.filter((ev) =>
        (ev.appendixNumber !== undefined && ev.appendixNumber === container.appendixNumber) ||
        ev.checkIds.some((id) => container.checkIds.includes(id))
      );

      if (matchingEvs.length === 0) continue;

      let replacedExisting = false;

      for (let evIndex = 0; evIndex < matchingEvs.length; evIndex++) {
        const ev = matchingEvs[evIndex];

        // Explicit replacement check
        if (ev.replaceExistingMedia && container.existingImagePath && !replacedExisting) {
          const cleanPath = container.existingImagePath.startsWith("media/")
            ? `word/${container.existingImagePath}`
            : `word/media/${container.existingImagePath}`;

          zip.file(cleanPath, ev.imageBuffer);
          replacedExisting = true;

          appliedAppendixChanges.push({
            appendixNumber: container.appendixNumber,
            appendixTitle: container.appendixTitle,
            action: "REPLACED_EXISTING",
            imageRelId: container.existingImageRelId || "embedded",
            imagePath: container.existingImagePath,
            title: ev.title,
          });
        } else {
          // Default: Preserve original media file untouched and append approved evidence
          const newFileName = `image_app_${container.appendixNumber}_${evIndex + 1}_${Math.floor(Math.random() * 9000 + 1000)}.png`;
          const newRelPath = `media/${newFileName}`;
          zip.file(`word/${newRelPath}`, ev.imageBuffer);

          const newRelId = relsManager.addImageRelationship(newRelPath);
          const dimensions = this.getPngDimensions(ev.imageBuffer);
          const drawingXml = this.generateInlineDrawingXml(newRelId, ev.title, dimensions, docPrCounter++);

          // Insert image drawing run into the appendix table cell/row
          if (
            container.tableIndex !== undefined &&
            container.tableIndex < tables.length &&
            container.rowIndex !== undefined
          ) {
            const tableXml = tables[container.tableIndex];
            const rows = tableXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
            if (container.rowIndex < rows.length) {
              const rowXml = rows[container.rowIndex];
              const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
              const targetCellIdx = container.cellIndex !== undefined && container.cellIndex < cells.length
                ? container.cellIndex
                : cells.length - 1;

              if (targetCellIdx >= 0 && targetCellIdx < cells.length) {
                const targetCellXml = cells[targetCellIdx];
                const captionText = ev.caption && ev.caption !== ev.title ? ev.caption : "";
                const captionXml = captionText
                  ? `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/><w:color w:val="595959"/></w:rPr><w:t xml:space="preserve">${escapeXml(captionText)}</w:t></w:r></w:p>`
                  : "";
                const newParagraphXml = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r>${drawingXml}</w:r></w:p>${captionXml}`;

                const updatedCellXml = targetCellXml.replace(/<\/w:tc>$/, `${newParagraphXml}</w:tc>`);
                cells[targetCellIdx] = updatedCellXml;

                const newRowXml = this.reassembleRow(rowXml, cells);
                rows[container.rowIndex] = newRowXml;
                const newTableXml = this.reassembleTable(tableXml, rows);
                documentXml = documentXml.replace(tableXml, () => newTableXml);
                tables[container.tableIndex] = newTableXml;

                appliedAppendixChanges.push({
                  appendixNumber: container.appendixNumber,
                  appendixTitle: container.appendixTitle,
                  action: container.existingImagePath ? "PRESERVED_ORIGINAL_AND_APPENDED" : "INSERTED_NEW",
                  imageRelId: newRelId,
                  imagePath: newRelPath,
                  title: ev.title,
                });
              }
            }
          }
        }
      }
    }

    // 9. Optionally update device header metadata if requested
    if (deviceMetadata) {
      documentXml = this.updateDocumentMetadata(documentXml, deviceMetadata);
    }

    // 10. Commit updated XML and rels into ZIP package
    zip.file("word/document.xml", documentXml);
    zip.file("word/_rels/document.xml.rels", relsManager.toXml());

    // 11. Generate final modified DOCX buffer
    const modifiedBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // 12. Run post-generation validation
    const validation = await docxValidator.validateModifiedDocument(
      modifiedBuffer,
      inspection
    );

    const changeSummary: ReportChangeSummary = {
      appliedRowChanges,
      appliedAppendixChanges,
      unappliedCheckCount: inspection.editableChecklistRows.length - appliedRowChanges.length,
      totalEditableRows: inspection.editableChecklistRows.length,
      sourceDocHash: inspection.sha256Hash,
      generatedAt: new Date().toISOString(),
    };

    return {
      modifiedBuffer,
      changeSummary,
      validation,
      inspection,
    };
  }

  /**
   * Updates checkboxes in status cell according to finalStatus (e.g. PASS, FAIL, NA).
   */
  updateStatusCell(cellXml: string, finalStatus: string): string {
    const normTarget = this.normalizeStatus(finalStatus);

    // Each option is contained within a paragraph <w:p>
    const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;

    return cellXml.replace(pRegex, (pXml) => {
      const pText = pXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const optionLabel = pText.replace(/[☐☒☑]/g, "").trim().toUpperCase();

      if (!optionLabel) return pXml;

      const matches = this.optionMatchesStatus(optionLabel, normTarget);

      let updatedP = pXml;

      // 1. If SDT checkbox is inside this paragraph
      if (updatedP.includes("<w:sdt") && (updatedP.includes("<w14:checkbox") || updatedP.includes("w14:checked"))) {
        if (matches) {
          updatedP = updatedP
            .replace(/<w14:checked\s+w14:val="[01]"/g, '<w14:checked w14:val="1"')
            .replace(/<w:sdtContent>[\s\S]*?<\/w:sdtContent>/g, '<w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>☒</w:t></w:r></w:sdtContent>');
        } else {
          updatedP = updatedP
            .replace(/<w14:checked\s+w14:val="[01]"/g, '<w14:checked w14:val="0"')
            .replace(/<w:sdtContent>[\s\S]*?<\/w:sdtContent>/g, '<w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>☐</w:t></w:r></w:sdtContent>');
        }
      } else if (updatedP.includes("☐") || updatedP.includes("☒") || updatedP.includes("☑")) {
        // 2. Fallback: Unicode symbols without SDT
        if (matches) {
          updatedP = updatedP.replace(/[☐☑]/g, "☒");
        } else {
          updatedP = updatedP.replace(/[☒☑]/g, "☐");
        }
      }

      return updatedP;
    });
  }

  /**
   * Updates remarks cell preserving formatting, table cell properties and paragraphs.
   */
  updateRemarksCell(cellXml: string, newRemarks: string): string {
    const escaped = escapeXml(newRemarks);

    // Extract cell properties <w:tcPr>
    const tcPrMatch = cellXml.match(/<w:tcPr[\s>][\s\S]*?<\/w:tcPr>/);
    const tcPr = tcPrMatch ? tcPrMatch[0] : "";

    // Extract paragraph properties <w:pPr> if any
    const pPrMatch = cellXml.match(/<w:pPr[\s>][\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch
      ? pPrMatch[0]
      : '<w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:rPr><w:color w:val="0070C0"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>';

    // Build fresh formatted paragraph with standard CTC blue font (0070C0)
    const newContent = `${tcPr}<w:p>${pPr}<w:r><w:rPr><w:color w:val="0070C0"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;

    return `<w:tc>${newContent}</w:tc>`;
  }

  private optionMatchesStatus(optionLabel: string, targetStatus: string): boolean {
    if (targetStatus === "PASS") {
      return (
        optionLabel.includes("HEALTHY") ||
        optionLabel.includes("VALID") ||
        optionLabel.includes("UP TO DATE") ||
        optionLabel.includes("PASS") ||
        optionLabel.includes("YES")
      );
    }
    if (targetStatus === "FAIL") {
      return (
        optionLabel.includes("UNHEALTHY") ||
        optionLabel.includes("EXPIRED") ||
        optionLabel.includes("OUT-OF-DATE") ||
        optionLabel.includes("FAIL") ||
        optionLabel.includes("NO")
      );
    }
    if (targetStatus === "NA") {
      return (
        optionLabel.includes("N/A") ||
        optionLabel.includes("NA") ||
        optionLabel.includes("NOT APPLICABLE") ||
        optionLabel.includes("NOT APPLY")
      );
    }
    return false;
  }

  private normalizeStatus(status: string): string {
    const s = status.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (s === "NOTAPPLICABLE" || s === "NOTAPPLY" || s === "NA") return "NA";
    if (s === "PASSED" || s === "PASS" || s === "HEALTHY") return "PASS";
    if (s === "FAILED" || s === "FAIL" || s === "UNHEALTHY") return "FAIL";
    return s || "PENDING";
  }

  private reassembleRow(rowXml: string, cells: string[]): string {
    const trPrMatch = rowXml.match(/<w:trPr[\s>][\s\S]*?<\/w:trPr>/);
    const trPr = trPrMatch ? trPrMatch[0] : "";
    const openTag = rowXml.match(/^<w:tr[^>]*>/)?.[0] || "<w:tr>";
    return `${openTag}${trPr}${cells.join("")}</w:tr>`;
  }

  private reassembleTable(tableXml: string, rows: string[]): string {
    const tblPrMatch = tableXml.match(/<w:tblPr[\s>][\s\S]*?<\/w:tblPr>/);
    const tblGridMatch = tableXml.match(/<w:tblGrid[\s>][\s\S]*?<\/w:tblGrid>/);
    const tblPr = tblPrMatch ? tblPrMatch[0] : "";
    const tblGrid = tblGridMatch ? tblGridMatch[0] : "";
    const openTag = tableXml.match(/^<w:tbl[^>]*>/)?.[0] || "<w:tbl>";
    return `${openTag}${tblPr}${tblGrid}${rows.join("")}</w:tbl>`;
  }

  /**
   * Reads PNG dimensions (width, height) directly from the IHDR chunk.
   */
  private getPngDimensions(buffer: Buffer | Uint8Array): { width: number; height: number } | null {
    if (buffer.length < 24) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
      const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
    return null;
  }

  private generateInlineDrawingXml(
    rId: string,
    name: string,
    dimensions?: { width: number; height: number } | null,
    docPrId: number = 100
  ): string {
    const maxCx = 5724525; // ~5.75 inches in EMUs
    let cx = maxCx;
    let cy = 3800000; // default ~4 inches

    if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
      const aspectRatio = dimensions.height / dimensions.width;
      cy = Math.round(maxCx * aspectRatio);
      if (cy > 6858000) {
        // Cap max height to ~7.2 inches to avoid awkward page breaks
        cy = 6858000;
        cx = Math.round(cy / aspectRatio);
      }
    }

    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${escapeXml(name)}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  }

  private updateDocumentMetadata(
    documentXml: string,
    meta: {
      model?: string;
      hostname?: string;
      serialNumber?: string;
      engineerName?: string;
      reportDate?: string;
    }
  ): string {
    let xml = documentXml;

    if (meta.serialNumber) {
      xml = xml.replace(/(Serial\s*Number\s*[:\s]+)(?:[A-Za-z0-9_\-]+)?/i, `$1${escapeXml(meta.serialNumber)}`);
    }
    if (meta.hostname) {
      xml = xml.replace(/(Hostname\s*[:\s]+)(?:[A-Za-z0-9_\-]+)?/i, `$1${escapeXml(meta.hostname)}`);
    }

    return xml;
  }
}

export const docxEditor = new DocxEditor();
