import { describe, it, expect } from "vitest";
import { metadataReconciler } from "@/core/session/metadata-reconciler";
import { DocumentMetadata } from "@/report-layouts/types";

describe("MetadataReconciler: Deterministic Reconciliation", () => {
  it("reconciles matching DOCX metadata and CLI detected prompt hostname", () => {
    const docxMeta: DocumentMetadata = {
      customerName: "Aurelius Hospitals",
      reportDate: "15/08/2026",
      engineerName: "Cha Zi Yu",
      model: "FortiGate 200F",
      hostname: "HQ-FW-01",
      serialNumber: "FG200FTK21004812",
    };

    const result = metadataReconciler.reconcile(docxMeta, "HQ-FW-01");

    expect(result.customer).toBe("Aurelius Hospitals");
    expect(result.pmDate).toBe("15/08/2026");
    expect(result.engineerName).toBe("Cha Zi Yu");
    expect(result.model).toBe("FortiGate 200F");
    expect(result.isAmbiguous).toBe(false);
    expect(result.missingFields).toHaveLength(0);
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].hostname).toBe("HQ-FW-01");
    expect(result.devices[0].source).toBe("BOTH");
    expect(result.devices[0].serialNumber).toBe("FG200FTK21004812");
  });

  it("detects hostname ambiguity when CLI prompt differs from Word report table", () => {
    const docxMeta: DocumentMetadata = {
      customerName: "Bank Negara Malaysia",
      model: "FortiGate 200F",
      hostname: "BNM-DC-FW01",
    };

    const result = metadataReconciler.reconcile(docxMeta, "BNM-DR-FW02");

    expect(result.isAmbiguous).toBe(true);
    expect(result.ambiguityReason).toContain("does not match Word document hostname");
    expect(result.devices).toHaveLength(2);
    expect(result.devices[0].hostname).toBe("BNM-DC-FW01");
    expect(result.devices[0].source).toBe("DOCX");
    expect(result.devices[1].hostname).toBe("BNM-DR-FW02");
    expect(result.devices[1].source).toBe("CLI");
  });

  it("flags missing fields when DOCX lacks customer or model", () => {
    const docxMeta: DocumentMetadata = {
      hostname: "FGT-STANDALONE",
    };

    const result = metadataReconciler.reconcile(docxMeta, null);

    expect(result.customer).toBeNull();
    expect(result.model).toBeNull();
    expect(result.missingFields).toContain("customer");
    expect(result.missingFields).toContain("model");
    expect(result.missingFields).not.toContain("devices");
    expect(result.devices).toHaveLength(1);
  });

  it("flags missing devices when neither docx nor cli prompt provides hostname", () => {
    const docxMeta: DocumentMetadata = {
      customerName: "Demo Client",
      model: "FortiGate 80F",
    };

    const result = metadataReconciler.reconcile(docxMeta, null);

    expect(result.missingFields).toContain("devices");
    expect(result.devices).toHaveLength(0);
  });

  it("preserves pre-existing session devices if passed", () => {
    const existing = [
      { hostname: "EXISTING-FW01", model: "FortiGate 100F", role: "Primary" },
      { hostname: "EXISTING-FW02", model: "FortiGate 100F", role: "Secondary" },
    ];

    const result = metadataReconciler.reconcile(null, "EXISTING-FW01", existing);

    expect(result.devices).toHaveLength(2);
    expect(result.devices[0].hostname).toBe("EXISTING-FW01");
    expect(result.devices[0].source).toBe("BOTH");
    expect(result.devices[1].hostname).toBe("EXISTING-FW02");
  });
});
