import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { reportLayoutRegistry } from "@/report-layouts/registry";
import { docxInspector } from "@/core/document/docx-inspector";

describe("ReportLayoutRegistry and Multi-Vendor Layouts (Phase 6)", () => {
  it("registers all four firewall vendor report layouts", () => {
    expect(reportLayoutRegistry.hasLayoutForVendor("fortigate")).toBe(true);
    expect(reportLayoutRegistry.hasLayoutForVendor("paloalto")).toBe(true);
    expect(reportLayoutRegistry.hasLayoutForVendor("juniper_srx")).toBe(true);
    expect(reportLayoutRegistry.hasLayoutForVendor("checkpoint")).toBe(true);
    expect(reportLayoutRegistry.hasLayoutForVendor("cisco" as any)).toBe(false);

    const fgLayouts = reportLayoutRegistry.getLayoutsForVendor("fortigate");
    expect(fgLayouts.length).toBeGreaterThanOrEqual(1);
    expect(fgLayouts[0].id).toBe("ctc-fortigate-v1_1");

    const paLayouts = reportLayoutRegistry.getLayoutsForVendor("paloalto");
    expect(paLayouts.length).toBeGreaterThanOrEqual(1);
    expect(paLayouts[0].id).toBe("ctc-paloalto-v1");

    const srxLayouts = reportLayoutRegistry.getLayoutsForVendor("juniper_srx");
    expect(srxLayouts.length).toBeGreaterThanOrEqual(1);
    expect(srxLayouts[0].id).toBe("ctc-juniper-srx-v1");

    const cpLayouts = reportLayoutRegistry.getLayoutsForVendor("checkpoint");
    expect(cpLayouts.length).toBeGreaterThanOrEqual(1);
    expect(cpLayouts[0].id).toBe("ctc-checkpoint-v1");
  });

  it("inspects Palo Alto PM document and maps all 16 checklist tasks", async () => {
    const paDocPath = path.join(
      process.cwd(),
      "doc",
      "LFSA_PA-820_PM 2nd half 2026.docx"
    );

    if (!fs.existsSync(paDocPath)) {
      console.warn("Skipping test: sample file not present at", paDocPath);
      return;
    }

    const result = await docxInspector.inspectDocument(paDocPath, "paloalto");

    expect(result.isValidDocx).toBe(true);
    expect(result.isSupportedLayout).toBe(true);
    expect(result.layoutId).toBe("ctc-paloalto-v1");
    expect(result.vendorId).toBe("paloalto");
    expect(result.editableChecklistRows.length).toBe(16);

    // Verify key checklist items are mapped
    const diskRow = result.editableChecklistRows.find((r) => r.checkId === "pa-disk-space");
    expect(diskRow).toBeDefined();
    expect(diskRow?.currentStatus).toBe("PASS");

    const cpuRow = result.editableChecklistRows.find((r) => r.checkId === "pa-cpu-usage");
    expect(cpuRow).toBeDefined();
    expect(cpuRow?.currentStatus).toBe("PASS");

    const backupRow = result.editableChecklistRows.find((r) => r.checkId === "pa-config-backup");
    expect(backupRow).toBeDefined();
    expect(backupRow?.currentStatus).toBe("PASS");

    // Appendix mapping
    expect(result.appendixContainers.length).toBeGreaterThanOrEqual(15);

    // Protected sections
    expect(result.protectedSections.length).toBeGreaterThanOrEqual(1);
    expect(result.protectedSections.some((p) => p.name.includes("Author Details"))).toBe(true);
  });

  it("inspects Check Point PM document and recognizes multi-device layout", async () => {
    const cpDocPath = path.join(
      process.cwd(),
      "doc",
      "ACSM_CheckPoint 2nd Half of Preventive Maintenance 2026.docx"
    );

    if (!fs.existsSync(cpDocPath)) {
      console.warn("Skipping test: sample file not present at", cpDocPath);
      return;
    }

    const result = await docxInspector.inspectDocument(cpDocPath, "checkpoint");

    expect(result.isValidDocx).toBe(true);
    expect(result.isSupportedLayout).toBe(true);
    expect(result.layoutId).toBe("ctc-checkpoint-v1");
    expect(result.vendorId).toBe("checkpoint");
    expect(result.editableChecklistRows.length).toBeGreaterThan(0);

    // Check multi-device support
    expect(result.deviceSections).toBeDefined();
    expect(result.deviceSections!.length).toBeGreaterThanOrEqual(2);
    expect(result.supportsMultiDeviceSections).toBe(true);

    // Protected sections
    expect(result.protectedSections.length).toBeGreaterThanOrEqual(1);
  });

  it("fails closed on unapproved or random document text", () => {
    const detected = reportLayoutRegistry.detectLayout(
      "<w:document><w:body><w:p><w:r><w:t>Random document text</w:t></w:r></w:p></w:body></w:document>",
      "Random document text"
    );
    expect(detected).toBeUndefined();
  });

  it("surfaces vendor mismatch warning when document does not match session vendor", async () => {
    const fgDocPath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );

    if (!fs.existsSync(fgDocPath)) {
      return;
    }

    // Inspecting FortiGate report with preferredVendorId="paloalto"
    const result = await docxInspector.inspectDocument(fgDocPath, "paloalto");

    expect(result.vendorId).toBe("fortigate");
    expect(result.warnings.some((w) => w.includes("does not match session vendor paloalto"))).toBe(true);
  });
});
