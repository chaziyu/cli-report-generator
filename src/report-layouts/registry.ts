import { ReportLayoutDefinition } from "./types";
import { ctcFortiGateLayoutV1_1 } from "./ctc-fortigate-v1_1";

export class ReportLayoutRegistry {
  private layouts = new Map<string, ReportLayoutDefinition>();

  constructor() {
    this.register(ctcFortiGateLayoutV1_1);
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

  detectLayout(
    documentXml: string,
    textSummary: string
  ): ReportLayoutDefinition | undefined {
    for (const layout of this.layouts.values()) {
      if (layout.canHandle(documentXml, textSummary)) {
        return layout;
      }
    }
    return undefined;
  }
}

export const reportLayoutRegistry = new ReportLayoutRegistry();
