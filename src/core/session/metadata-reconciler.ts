import { DocumentMetadata } from "@/report-layouts/types";

export interface ReconciledDevice {
  hostname: string;
  model?: string;
  serialNumber?: string;
  role: string; // "Primary" | "Secondary" | "Standalone" | "Cluster-Member"
  source: "DOCX" | "CLI" | "BOTH";
}

export interface ReconciledMetadata {
  customer: string | null;
  pmDate: string | null;
  engineerName: string | null;
  model: string | null;
  devices: ReconciledDevice[];
  isAmbiguous: boolean;
  ambiguityReason?: string;
  missingFields: Array<"customer" | "model" | "devices">;
}

export class MetadataReconciler {
  /**
   * Reconciles metadata extracted from Word inspection and PuTTY log segmentation.
   * Keeps UI clean and focused on essential report information:
   * Customer, Vendor, Model, Devices.
   */
  reconcile(
    docxMetadata?: DocumentMetadata | null,
    cliDetectedHostname?: string | null,
    existingDevices?: Array<{
      hostname: string;
      model?: string | null;
      serialNumber?: string | null;
      role?: string | null;
    }>
  ): ReconciledMetadata {
    const missingFields: Array<"customer" | "model" | "devices"> = [];

    // 1. Customer
    const customer = docxMetadata?.customerName?.trim() || null;
    if (!customer) {
      missingFields.push("customer");
    }

    // 2. PM Date
    const pmDate = docxMetadata?.reportDate?.trim() || null;

    // 3. Engineer / Author
    const engineerName = docxMetadata?.engineerName?.trim() || null;

    // 4. Model
    const model = docxMetadata?.model?.trim() || null;
    if (!model) {
      missingFields.push("model");
    }

    // 5. Devices & Hostname Reconciliation
    const docxHost = docxMetadata?.hostname?.trim();
    const cliHost = cliDetectedHostname?.trim();
    const serial = docxMetadata?.serialNumber?.trim();

    const devices: ReconciledDevice[] = [];
    let isAmbiguous = false;
    let ambiguityReason: string | undefined;

    // If existing devices passed in, use them as baseline
    if (existingDevices && existingDevices.length > 0) {
      for (const d of existingDevices) {
        devices.push({
          hostname: d.hostname,
          model: d.model || model || undefined,
          serialNumber: d.serialNumber || serial || undefined,
          role: d.role || "Primary",
          source: "DOCX",
        });
      }
    }

    if (docxHost && cliHost) {
      const normDocx = docxHost.toLowerCase().replace(/[\-_ \.]/g, "");
      const normCli = cliHost.toLowerCase().replace(/[\-_ \.]/g, "");

      if (normDocx === normCli || normDocx.includes(normCli) || normCli.includes(normDocx)) {
        // Matched cleanly
        if (devices.length === 0) {
          devices.push({
            hostname: docxHost,
            model: model || undefined,
            serialNumber: serial || undefined,
            role: "Primary",
            source: "BOTH",
          });
        } else {
          // Update source
          devices[0].source = "BOTH";
        }
      } else {
        // Conflict / Ambiguity: DOCX hostname != CLI hostname
        isAmbiguous = true;
        ambiguityReason = `CLI log prompt hostname ("${cliHost}") does not match Word document hostname ("${docxHost}").`;

        if (devices.length === 0) {
          devices.push({
            hostname: docxHost,
            model: model || undefined,
            serialNumber: serial || undefined,
            role: "Primary",
            source: "DOCX",
          });
          devices.push({
            hostname: cliHost,
            model: model || undefined,
            role: "Secondary",
            source: "CLI",
          });
        } else {
          // Check if cliHost already in devices
          const exists = devices.some(
            (d) => d.hostname.toLowerCase() === cliHost.toLowerCase()
          );
          if (!exists) {
            devices.push({
              hostname: cliHost,
              model: model || undefined,
              role: "Secondary",
              source: "CLI",
            });
          }
        }
      }
    } else if (docxHost) {
      if (devices.length === 0) {
        devices.push({
          hostname: docxHost,
          model: model || undefined,
          serialNumber: serial || undefined,
          role: "Primary",
          source: "DOCX",
        });
      }
    } else if (cliHost) {
      const match = devices.find(
        (d) => d.hostname.toLowerCase().replace(/[\-_ \.]/g, "") === cliHost.toLowerCase().replace(/[\-_ \.]/g, "")
      );
      if (match) {
        match.source = "BOTH";
      } else if (devices.length === 0) {
        devices.push({
          hostname: cliHost,
          model: model || undefined,
          serialNumber: serial || undefined,
          role: "Primary",
          source: "CLI",
        });
      } else {
        devices.push({
          hostname: cliHost,
          model: model || undefined,
          role: "Secondary",
          source: "CLI",
        });
      }
    }

    if (devices.length === 0) {
      missingFields.push("devices");
    }

    return {
      customer,
      pmDate,
      engineerName,
      model,
      devices,
      isAmbiguous,
      ambiguityReason,
      missingFields,
    };
  }
}

export const metadataReconciler = new MetadataReconciler();
