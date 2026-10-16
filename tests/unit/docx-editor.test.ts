import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs/promises";
import JSZip from "jszip";
import {
  docxEditor,
  docxValidator,
  docxInspector,
  OoxmlRelationships,
} from "@/core/document";

describe("DocxEditor & OOXML Document Manipulation Unit Tests", () => {
  it("OoxmlRelationships parses, allocates new rIds, and manages image relationships", () => {
    const sampleRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

    const rels = OoxmlRelationships.fromXml(sampleRelsXml);
    expect(rels.getRelationship("rId1")?.target).toBe("styles.xml");
    expect(rels.findImageRelByTarget("media/image1.png")?.id).toBe("rId10");

    // Add new image
    const newId = rels.addImageRelationship("media/image2.png");
    expect(newId).toBe("rId11");

    const xml = rels.toXml();
    expect(xml).toContain('Id="rId11"');
    expect(xml).toContain('Target="media/image2.png"');
  });

  it("updateStatusCell toggles checkboxes correctly for PASS, FAIL, and NA", () => {
    const sampleCellXml = `<w:tc>
  <w:p>
    <w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:t>☐</w:t></w:r></w:sdtContent></w:sdt>
    <w:r><w:t> Healthy</w:t></w:r>
  </w:p>
  <w:p>
    <w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:t>☒</w:t></w:r></w:sdtContent></w:sdt>
    <w:r><w:t> N/A</w:t></w:r>
  </w:p>
</w:tc>`;

    // Switch to PASS (Healthy)
    const passCell = docxEditor.updateStatusCell(sampleCellXml, "PASS");
    expect(passCell).toContain('<w14:checked w14:val="1"');
    expect(passCell).toContain("<w:t>☒</w:t>");
    // N/A should now be unchecked
    expect(passCell).toContain('<w14:checked w14:val="0"');

    // Switch to NA
    const naCell = docxEditor.updateStatusCell(passCell, "NA");
    const countChecked = (naCell.match(/w14:val="1"/g) || []).length;
    expect(countChecked).toBe(1);
  });

  it("updateRemarksCell replaces remarks text and escapes XML characters safely", () => {
    const sampleCellXml = `<w:tc>
  <w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
  <w:p><w:pPr><w:color w:val="000000"/></w:pPr><w:r><w:t>Old Remarks</w:t></w:r></w:p>
</w:tc>`;

    const updated = docxEditor.updateRemarksCell(
      sampleCellXml,
      "New CPU reading: < 15% & healthy"
    );

    expect(updated).toContain("New CPU reading: &lt; 15% &amp; healthy");
    expect(updated).toContain('<w:color w:val="0070C0"/>'); // CTC standard blue
    expect(updated).toContain('<w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>');
  });

  it("edits an authentic CTC Word report non-destructively and validates output", async () => {
    const samplePath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );

    let docBuffer: Buffer;
    try {
      docBuffer = await fs.readFile(samplePath);
    } catch {
      console.warn("Skipping test: sample file not available at", samplePath);
      return;
    }

    // Inspect initial doc
    const initialInsp = await docxInspector.inspectDocument(docBuffer);
    expect(initialInsp.editableChecklistRows.length).toBe(21);

    // Apply decisions to row 1.2 (CPU) and row 1.1 (Disk)
    const result = await docxEditor.editReport({
      originalDocxBuffer: docBuffer,
      decisions: [
        {
          checkId: "fg-hw-cpu",
          finalStatus: "PASS",
          finalRemarks: "CPU utilization tested at 18%, healthy.",
          reviewer: "Lead Engineer",
        },
        {
          checkId: "fg-hw-disk",
          finalStatus: "NA",
          finalRemarks: "N/A - FortiGate 80F flash storage only.",
          reviewer: "Lead Engineer",
        },
      ],
      deviceMetadata: {
        serialNumber: "FGT80FTK21015747",
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(result.changeSummary.appliedRowChanges.length).toBe(2);
    expect(result.changeSummary.unappliedCheckCount).toBe(19);

    // Re-inspect modified buffer
    const modifiedInsp = await docxInspector.inspectDocument(result.modifiedBuffer);
    expect(modifiedInsp.isValidDocx).toBe(true);
    expect(modifiedInsp.editableChecklistRows.length).toBe(21);

    // Verify row 1.2 status changed to PASS and remarks updated
    const cpuRow = modifiedInsp.editableChecklistRows.find((r) => r.checkId === "fg-hw-cpu");
    expect(cpuRow).toBeDefined();
    expect(cpuRow?.currentStatus).toBe("PASS");
    expect(cpuRow?.currentRemarks).toContain("CPU utilization tested at 18%");

    // Verify row 1.1 status is NA
    const diskRow = modifiedInsp.editableChecklistRows.find((r) => r.checkId === "fg-hw-disk");
    expect(diskRow).toBeDefined();
    expect(diskRow?.currentStatus).toBe("NA");
    expect(diskRow?.currentRemarks).toContain("flash storage only");

    // Verify author credentials section was preserved
    expect(result.validation.checkedComponents.protectedSectionsPreserved).toBe(true);
  });
});
