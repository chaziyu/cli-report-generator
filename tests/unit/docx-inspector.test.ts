import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { docxInspector } from "@/core/document/docx-inspector";

describe("DocxInspector: Non-destructive CTC Word Report Inspection", () => {
  const sampleDocPath = path.join(
    process.cwd(),
    "doc",
    "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
  );

  it("inspects CTC FortiGate PM Word report and extracts structural layout map", async () => {
    // Only run if the sample report exists in doc/
    if (!fs.existsSync(sampleDocPath)) {
      console.warn("Skipping test: sample file not present at", sampleDocPath);
      return;
    }

    const result = await docxInspector.inspectDocument(sampleDocPath);

    expect(result.isValidDocx).toBe(true);
    expect(result.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.fileSizeBytes).toBeGreaterThan(100000);

    // Layout recognition
    expect(result.isSupportedLayout).toBe(true);
    expect(result.layoutId).toBe("ctc-fortigate-v1_1");
    expect(result.vendorId).toBe("fortigate");

    // Metadata extraction
    expect(result.metadata.engineerName).toBe("Syivhanii Selvarajan");
    expect(result.metadata.serialNumber).toBe("FGT80FTK21015747");
    expect(result.metadata.model).toContain("80F");

    // Checklist row mapping
    expect(result.editableChecklistRows.length).toBe(21);

    const row11 = result.editableChecklistRows.find((r) => r.itemNumber === "1.1");
    expect(row11).toBeDefined();
    expect(row11?.checkId).toBe("fg-hw-disk");
    expect(row11?.taskName).toContain("Hard disk space");
    expect(row11?.currentStatus).toBe("NA"); // Flash storage only
    expect(row11?.currentRemarks).toContain("not equipped with hard disk");
    expect(row11?.statusCellIndex).toBe(3);
    expect(row11?.remarksCellIndex).toBe(4);
    expect(row11?.checkboxOptions.length).toBeGreaterThan(0);

    const row21 = result.editableChecklistRows.find((r) => r.itemNumber === "2.1");
    expect(row21).toBeDefined();
    expect(row21?.checkId).toBe("fg-lic-forticare");
    expect(row21?.currentStatus).toBe("PASS");

    // Protected sections
    expect(result.protectedSections.length).toBeGreaterThanOrEqual(1);
    expect(result.protectedSections[0].name).toContain("Author Details");

    // Appendix containers
    expect(result.appendixContainers.length).toBeGreaterThan(5);
    const app1 = result.appendixContainers.find((a) => a.appendixNumber === 1);
    expect(app1).toBeDefined();
  });

  it("handles another sample report (ACSM_FG200F) consistently", async () => {
    const fg200Path = path.join(
      process.cwd(),
      "doc",
      "ACSM_FG200F_2nd Half of Preventive Maintenance 2026.docx"
    );

    if (!fs.existsSync(fg200Path)) {
      return;
    }

    const result = await docxInspector.inspectDocument(fg200Path);

    expect(result.isValidDocx).toBe(true);
    expect(result.layoutId).toBe("ctc-fortigate-v1_1");
    expect(result.editableChecklistRows.length).toBeGreaterThanOrEqual(20);
    expect(result.metadata.hostname).toBe("HQ_T2_FG200F_Primary");
    expect(result.metadata.engineerName).toBe("Cha Zi Yu");
  });

  it("rejects non-DOCX files gracefully with descriptive error", async () => {
    const invalidBuffer = Buffer.from("Not a real docx file, just random text");
    await expect(docxInspector.inspectDocument(invalidBuffer)).rejects.toThrow(
      /Failed to parse file as valid DOCX archive/
    );
  });
});
