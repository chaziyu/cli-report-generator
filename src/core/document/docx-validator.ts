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
    headersFootersPreserved: boolean;
    tableStructurePreserved: boolean;
    appendixHeadingsPreserved: boolean;
    contentTypesValid: boolean;
  };
}

export class DocxValidator {
  /**
   * Validates a modified DOCX buffer against structural OOXML rules, relationships, and protected sections.
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
      headersFootersPreserved: false,
      tableStructurePreserved: false,
      appendixHeadingsPreserved: false,
      contentTypesValid: false,
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

    let docXml: string = "";
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
        const fullZipPath = target.startsWith("media/")
          ? `word/${target}`
          : target.startsWith("/")
          ? target.slice(1)
          : `word/${target}`;
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

    // 4. Verify headers and footers preserved
    try {
      const headerFooterFiles = Object.keys(zip.files).filter((p) =>
        /^word\/(header|footer)\d+\.xml$/.test(p)
      );
      let hfValid = true;
      for (const hfPath of headerFooterFiles) {
        const hfContent = await zip.file(hfPath)?.async("string");
        if (!hfContent || (!hfContent.includes("<w:hdr") && !hfContent.includes("<w:ftr"))) {
          errors.push(`Header or footer part '${hfPath}' is missing root container.`);
          hfValid = false;
        }
      }
      checked.headersFootersPreserved = hfValid;
    } catch (err) {
      errors.push(`Failed to validate headers and footers: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 5. Verify [Content_Types].xml
    try {
      const ctEntry = zip.file("[Content_Types].xml");
      if (ctEntry) {
        const ctXml = await ctEntry.async("string");
        if (ctXml.includes("<Types") && ctXml.includes("image/png")) {
          checked.contentTypesValid = true;
        } else {
          errors.push("Missing required image/png content type registration in [Content_Types].xml.");
        }
      } else {
        errors.push("Missing root '[Content_Types].xml' entry.");
      }
    } catch (err) {
      errors.push(`Failed to validate [Content_Types].xml: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 6. Verify protected sections and structural tables
    if (originalInspection) {
      const tables = docXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) || [];

      // Check total tables preserved
      if (tables.length < originalInspection.totalTables) {
        errors.push(
          `Document table structure compromised: original contained ${originalInspection.totalTables} tables, generated document has ${tables.length}.`
        );
        checked.tableStructurePreserved = false;
      } else {
        checked.tableStructurePreserved = true;
      }

      // Check protected sections
      if (originalInspection.protectedSections.length > 0) {
        let protectedViolated = false;

        for (const sec of originalInspection.protectedSections) {
          if (sec.type === "TABLE" && sec.tableIndex !== undefined) {
            if (sec.tableIndex >= tables.length) {
              errors.push(`Protected section '${sec.name}' at table index ${sec.tableIndex} is missing in generated document.`);
              protectedViolated = true;
            } else {
              const tableText = tables[sec.tableIndex].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
              if (
                sec.name.toLowerCase().includes("author") &&
                !tableText.toLowerCase().includes("name") &&
                !tableText.toLowerCase().includes("designation")
              ) {
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

      // 7. Verify appendix headings preserved
      if (originalInspection.appendixContainers.length > 0) {
        let missingHeadings = 0;
        for (const app of originalInspection.appendixContainers) {
          const appPattern = new RegExp(`Appendix\\s*${app.appendixNumber}\\b`, "i");
          if (!appPattern.test(docXml)) {
            warnings.push(`Appendix heading for Appendix ${app.appendixNumber} was not located in modified text.`);
            missingHeadings++;
          }
        }
        checked.appendixHeadingsPreserved = missingHeadings === 0;
      } else {
        checked.appendixHeadingsPreserved = true;
      }
    } else {
      checked.protectedSectionsPreserved = true;
      checked.tableStructurePreserved = true;
      checked.appendixHeadingsPreserved = true;
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
