import { VendorId } from "@/vendors/types";
import { ReportLayoutDefinition } from "./types";
import { ctcFortiGateLayoutV1_1 } from "./ctc-fortigate-v1_1";
import { ctcPaloAltoLayout } from "./ctc-paloalto";
import { ctcJuniperSrxLayout } from "./ctc-juniper-srx";
import { ctcCheckPointLayout } from "./ctc-checkpoint";

export class ReportLayoutRegistry {
  private layouts = new Map<string, ReportLayoutDefinition>();

  constructor() {
    this.register(ctcFortiGateLayoutV1_1);
    this.register(ctcPaloAltoLayout);
    this.register(ctcJuniperSrxLayout);
    this.register(ctcCheckPointLayout);
  }

  register(layout: ReportLayoutDefinition): void {
    this.layouts.set(layout.id, layout);
  }

  get(id: string): ReportLayoutDefinition | undefined {
    return this.layouts.get(id);
  }

  getAll(): ReportLayoutDefinition[] {
    return Array.from(this.layouts.values());
  }

  getLayoutsForVendor(vendorId: VendorId): ReportLayoutDefinition[] {
    return Array.from(this.layouts.values()).filter((l) => l.vendorId === vendorId);
  }

  hasLayoutForVendor(vendorId: VendorId): boolean {
    return this.getLayoutsForVendor(vendorId).length > 0;
  }

  detectLayout(
    documentXml: string,
    textSummary: string,
    preferredVendorId?: VendorId
  ): ReportLayoutDefinition | undefined {
    if (preferredVendorId) {
      const vendorLayouts = this.getLayoutsForVendor(preferredVendorId);
      for (const layout of vendorLayouts) {
        if (layout.canHandle(documentXml, textSummary)) {
          return layout;
        }
      }
    }

    for (const layout of this.layouts.values()) {
      if (layout.canHandle(documentXml, textSummary)) {
        return layout;
      }
    }
    return undefined;
  }
}

export const reportLayoutRegistry = new ReportLayoutRegistry();

