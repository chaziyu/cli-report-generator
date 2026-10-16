import JSZip from "jszip";
import { DocumentInspectionResult, ProtectedSection } from "@/report-layouts/types";

export interface DocxValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checkedComponents: {
    zipArchive: boolean;
    documentXml: boolean;
    relationshipsXml: boolean;
    protectedSectionsPreserved: boolean;
    mediaIntegrity: boolean;
  };
}

export class DocxValidator {
  /**
   * Validates a modified DOCX buffer against structural OOXML rules and protected sections.
   */
  async validateModifiedDocument(
    modifiedBuffer: Buffer | Uint8Array,
    originalInspection?: DocumentInspectionResult
  ): Promise<DocxValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checked = {
      zipArchive: false,
      documentXml: false,
      relationshipsXml: false,
      protectedSectionsPreserved: false,
      mediaIntegrity: false,
    };

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(modifiedBuffer);
      checked.zipArchive = true;
    } catch (err) {
      errors.push(`Invalid ZIP archive: ${err instanceof Error ? err.message : String(err)}`);
      return { isValid: false, errors, warnings, checkedComponents: checked };
    }

    // 1. Verify word/document.xml
    const docEntry = zip.file("word/document.xml");
    if (!docEntry) {
      errors.push("Missing required entry 'word/document.xml'.");
      return { isValid: false, errors, warnings, checkedComponents: checked };
    }

    let docXml: string;
    try {
      docXml = await docEntry.async("string");
      if (!docXml.includes("<w:document") || !docXml.includes("</w:document>")) {
        errors.push("Malformed 'word/document.xml': missing root <w:document> tag.");
      } else {
        checked.documentXml = true;
      }
    } catch (err) {
      errors.push(`Failed to read 'word/document.xml': ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. Verify word/_rels/document.xml.rels
    const relsEntry = zip.file("word/_rels/document.xml.rels");
    let relsXml = "";
    if (relsEntry) {
      try {
        relsXml = await relsEntry.async("string");
        if (!relsXml.includes("<Relationships") || !relsXml.includes("</Relationships>")) {
          errors.push("Malformed 'word/_rels/document.xml.rels': missing root <Relationships> tag.");
        } else {
          checked.relationshipsXml = true;
        }
      } catch (err) {
        errors.push(`Failed to read 'word/_rels/document.xml.rels': ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      warnings.push("No 'word/_rels/document.xml.rels' found in package.");
    }

    // 3. Verify media integrity
    if (relsXml) {
      const mediaRefs = relsXml.matchAll(/Type="[^"]*image"[^>]*Target="([^"]+)"/g);
      let missingMedia = 0;
      for (const ref of mediaRefs) {
        const target = ref[1];
        const fullZipPath = target.startsWith("media/") ? `word/${target}` : target.startsWith("/") ? target.slice(1) : `word/${target}`;
        if (!zip.file(fullZipPath)) {
          errors.push(`Image relationship references missing media file in ZIP: '${fullZipPath}'`);
          missingMedia++;
        }
      }
      if (missingMedia === 0) {
        checked.mediaIntegrity = true;
      }
    } else {
      checked.mediaIntegrity = true;
    }

    // 4. Verify protected sections are preserved
    if (originalInspection && originalInspection.protectedSections.length > 0) {
      const tables = docXml!.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) || [];
      let protectedViolated = false;

      for (const sec of originalInspection.protectedSections) {
        if (sec.type === "TABLE" && sec.tableIndex !== undefined) {
          if (sec.tableIndex >= tables.length) {
            errors.push(`Protected section '${sec.name}' at table index ${sec.tableIndex} is missing in generated document.`);
            protectedViolated = true;
          } else {
            const tableText = tables[sec.tableIndex].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
            if (sec.name.toLowerCase().includes("author") && !tableText.toLowerCase().includes("name") && !tableText.toLowerCase().includes("designation")) {
              errors.push(`Protected author details and sign-off section appears corrupted or altered.`);
              protectedViolated = true;
            }
          }
        }
      }

      checked.protectedSectionsPreserved = !protectedViolated;
    } else {
      checked.protectedSectionsPreserved = true;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      checkedComponents: checked,
    };
  }
}

export const docxValidator = new DocxValidator();
