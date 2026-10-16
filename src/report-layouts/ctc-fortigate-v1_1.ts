import {
  ReportLayoutDefinition,
  DocumentMetadata,
  EditableChecklistRowTarget,
  AppendixContainerTarget,
  ProtectedSection,
  CheckboxOption,
} from "./types";
import { FORTIGATE_CHECKLIST } from "@/vendors/fortigate/checklist";

function stripXml(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * CTC Global FortiGate Preventive Maintenance Report Layout (QMS-P09-F01 v1.1).
 *
 * Implements robust table, row, and appendix mapping for FortiGate PM Word reports.
 */
export class CtcFortiGateLayoutV1_1 implements ReportLayoutDefinition {
  readonly id = "ctc-fortigate-v1_1";
  readonly name = "CTC FortiGate PM Report (QMS-P09-F01 v1.1)";
  readonly vendorId = "fortigate" as const;
  readonly qmsCode = "QMS-P09-F01";
  readonly version = "1.1";

  /**
   * Identifies whether this layout matches the document.
   */
  canHandle(documentXml: string, textSummary: string): boolean {
    const textLower = textSummary.toLowerCase();
    const hasQmsOrPm =
      textLower.includes("qms-p09-f01") ||
      textLower.includes("preventive maintenance") ||
      textLower.includes("pm report");
    const hasFortiGate =
      textLower.includes("fortigate") ||
      textLower.includes("fortios") ||
      textLower.includes("fortinet");

    return hasQmsOrPm && hasFortiGate;
  }

  /**
   * Extracts metadata from document header tables and text.
   */
  extractMetadata(documentXml: string, tables: string[]): DocumentMetadata {
    const metadata: DocumentMetadata = {
      qmsDocumentNumber: "QMS-P09-F01",
      qmsVersion: "1.1",
    };

    // 1. Author & Engineer details (usually in Table 0)
    if (tables.length > 0) {
      const authorText = stripXml(tables[0]);
      const nameMatch = authorText.match(/Name\s*:\s*([^:\r\n]+?)(?:Designation|Date|$)/i);
      if (nameMatch) {
        metadata.engineerName = nameMatch[1].trim();
      }

      const desigMatch = authorText.match(/Designation\s*:\s*([^:\r\n]+?)(?:Date|Name|$)/i);
      if (desigMatch) {
        metadata.designation = desigMatch[1].trim();
      }

      const dateMatch = authorText.match(/Date\s*:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i);
      if (dateMatch) {
        metadata.reportDate = dateMatch[1].trim();
      }
    }

    // 2. Device info table (usually in Table 2)
    for (let i = 1; i < Math.min(tables.length, 5); i++) {
      const tText = stripXml(tables[i]);
      if (tText.includes("Model") || tText.includes("Serial") || tText.includes("Hostname")) {
        const modelMatch = tText.match(/Model\s*[:\s]+(Forti[A-Za-z0-9_\-\s]+?)(?:Hostname|Serial|PM Date|$)/i);
        if (modelMatch) {
          metadata.model = modelMatch[1].trim();
        }

        const hostMatch = tText.match(/Hostname\s*[:\s]+([A-Za-z0-9_\-]+)/i);
        if (hostMatch) {
          metadata.hostname = hostMatch[1].trim();
        }

        const serialMatch = tText.match(/(?:Serial\s*No|Serial\s*Number|Serial)\s*[:\s]+([A-Za-z0-9_\-]+)/i);
        if (serialMatch) {
          metadata.serialNumber = serialMatch[1].trim();
        }

        const pmDateMatch = tText.match(/PM\s*Date\s*[:\s]+([^\r\n]+?)(?:Model|Hostname|Serial|$)/i);
        if (pmDateMatch && !metadata.reportDate) {
          metadata.reportDate = pmDateMatch[1].trim();
        }
      }
    }

    // 3. Customer name (extracted from document text or author table)
    const allText = stripXml(documentXml);
    const custMatch = allText.match(/(?:Customer|Client)\s*[:\s]+([A-Za-z0-9\s.,&()\-]+?)(?:PM Date|Location|Prepared|$)/i);
    if (custMatch) {
      metadata.customerName = custMatch[1].trim();
    }

    return metadata;
  }

  /**
   * Maps all 21 checklist table rows in the document.
   */
  mapChecklistRows(tables: string[]): EditableChecklistRowTarget[] {
    const targets: EditableChecklistRowTarget[] = [];

    // Map each item number to its canonical check definition
    const defByItemNum = new Map(
      FORTIGATE_CHECKLIST.filter((i) => Boolean(i.itemNumber)).map((i) => [
        i.itemNumber!,
        i,
      ])
    );

    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const tableXml = tables[tIdx];
      const rows = tableXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const rowXml = rows[rIdx];
        const rowText = stripXml(rowXml);

        const itemNumMatch = rowText.match(/^(\d+\.\d+)\b/);
        if (!itemNumMatch) continue;

        const itemNum = itemNumMatch[1];
        const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
        if (cells.length < 4) continue;

        // In CTC standard template:
        // cells[0]: Item number (e.g. "1.1")
        // cells[1]: Task name
        // cells[2]: Description
        // cells[3]: Status (checkboxes)
        // cells[4]: Remarks
        const statusCellIdx = cells.length >= 5 ? 3 : cells.length - 2;
        const remarksCellIdx = cells.length >= 5 ? 4 : cells.length - 1;

        const statusCellXml = cells[statusCellIdx];
        const remarksCellXml = cells[remarksCellIdx];

        const taskName = stripXml(cells[1]);
        const currentRemarks = stripXml(remarksCellXml);

        // Parse checkboxes
        const checkboxOptions = this.parseCheckboxes(statusCellXml);
        const currentStatus = this.determineCurrentStatus(checkboxOptions, currentRemarks);

        // Find canonical definition
        const def = defByItemNum.get(itemNum);
        let checkId = def?.id || `fg-item-${itemNum.replace(".", "-")}`;

        // Disambiguate 1.2 and 1.3 based on task name (CPU vs Memory)
        if (itemNum === "1.2" && taskName.toLowerCase().includes("memory")) {
          checkId = "fg-hw-mem";
        } else if (itemNum === "1.2" && taskName.toLowerCase().includes("cpu")) {
          checkId = "fg-hw-cpu";
        } else if (itemNum === "1.3" && taskName.toLowerCase().includes("cpu")) {
          checkId = "fg-hw-cpu";
        } else if (itemNum === "1.3" && taskName.toLowerCase().includes("memory")) {
          checkId = "fg-hw-mem";
        }

        targets.push({
          itemNumber: itemNum,
          checkId,
          taskName: def?.taskName || taskName,
          sectionName: def?.group || `Section ${itemNum.split(".")[0]}`,
          tableIndex: tIdx,
          rowIndex: rIdx,
          statusCellIndex: statusCellIdx,
          remarksCellIndex: remarksCellIdx,
          currentStatus,
          currentRemarks,
          checkboxOptions,
        });
      }
    }

    return targets;
  }

  /**
   * Maps appendix sections and image placeholders.
   */
  mapAppendixContainers(
    documentXml: string,
    relsXml?: string
  ): AppendixContainerTarget[] {
    const containers: AppendixContainerTarget[] = [];

    // Map relationship IDs to target image files (e.g. rId12 -> media/image7.png)
    const relsMap = new Map<string, string>();
    if (relsXml) {
      const relMatches = relsXml.matchAll(
        /<Relationship[^>]*Id="([^"]+)"[^>]*Type="[^"]*image"[^>]*Target="([^"]+)"/g
      );
      for (const m of relMatches) {
        relsMap.set(m[1], m[2]);
      }
    }

    // Split into tables
    const tableMatches = documentXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) || [];

    for (let tIdx = 0; tIdx < tableMatches.length; tIdx++) {
      const tableXml = tableMatches[tIdx];
      const rows = tableXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const rowXml = rows[rIdx];
        const rowText = stripXml(rowXml);

        const appMatch = rowText.match(
          /Appendix(?:[^\d\r\n]{0,35})?(\d+)\s*[-–:]\s*([^<\r\n]+)/i
        );
        if (!appMatch) continue;

        const appNum = parseInt(appMatch[1], 10);
        const appTitle = appMatch[2].trim();

        // Check if there is an image drawing inside this row or adjacent cell
        const drawingMatch = rowXml.match(/<w:drawing[\s>][\s\S]*?<\/w:drawing>/);
        let existingImageRelId: string | undefined;
        let existingImagePath: string | undefined;

        if (drawingMatch) {
          const blipMatch = drawingMatch[0].match(/<a:blip[^>]*r:embed="([^"]+)"/);
          if (blipMatch) {
            existingImageRelId = blipMatch[1];
            existingImagePath = relsMap.get(existingImageRelId);
          }
        }

        // Map appendix number to supported check IDs & commands
        const { checkIds, commandId } = this.getAppendixCheckMapping(appNum, appTitle);

        containers.push({
          appendixNumber: appNum,
          appendixTitle: `Appendix ${appNum} – ${appTitle}`,
          mappedCommandId: commandId,
          checkIds,
          tableIndex: tIdx,
          rowIndex: rIdx,
          existingImageRelId,
          existingImagePath,
        });
      }
    }

    return containers;
  }

  /**
   * Identifies sections that must remain untouched.
   */
  identifyProtectedSections(tables: string[]): ProtectedSection[] {
    const protectedSections: ProtectedSection[] = [];

    // Table 0 is Author's Details and Signatures
    if (tables.length > 0) {
      protectedSections.push({
        name: "Author Details & Technical Sign-Off",
        type: "TABLE",
        tableIndex: 0,
        reason:
          "Preserves official engineer credentials, QMS audit sign-offs, and company metadata.",
      });
    }

    // Table 1 is Customer Satisfaction Survey
    if (tables.length > 1) {
      const t1Text = stripXml(tables[1]);
      if (t1Text.toLowerCase().includes("survey") || t1Text.toLowerCase().includes("satisfied")) {
        protectedSections.push({
          name: "Customer Satisfaction Survey",
          type: "TABLE",
          tableIndex: 1,
          reason: "Customer evaluation form must remain untouched.",
        });
      }
    }

    return protectedSections;
  }

  /**
   * Parses structured `<w14:checkbox>` content controls from XML.
   */
  private parseCheckboxes(statusCellXml: string): CheckboxOption[] {
    const options: CheckboxOption[] = [];
    const sdts = statusCellXml.match(/<w:sdt[\s>][\s\S]*?<\/w:sdt>/g) || [];

    for (const sdt of sdts) {
      const isCheckedMatch = sdt.match(/<w14:checked\s+w14:val="([01])"/);
      const isChecked = isCheckedMatch ? isCheckedMatch[1] === "1" : sdt.includes("☒");

      // Extract label directly adjacent to checkbox
      const sdtText = stripXml(sdt);
      const cellRemaining = stripXml(statusCellXml);
      let label = sdtText.replace(/[☐☒☑]/g, "").trim();

      if (!label) {
        // Fallback: look at label text in following XML
        const followingMatch = statusCellXml.match(new RegExp(`${sdt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:<w:r[\\s>][\\s\\S]*?<\\/w:r>)?`));
        if (followingMatch) {
          const stripped = stripXml(followingMatch[0]).replace(/[☐☒☑]/g, "").trim();
          if (stripped) label = stripped;
        }
      }

      const sdtIdMatch = sdt.match(/<w:id\s+w:val="([^"]+)"/);

      options.push({
        status: label,
        label: label || "Option",
        isChecked,
        sdtId: sdtIdMatch ? sdtIdMatch[1] : undefined,
      });
    }

    // Fallback: if SDTs were not used, search for raw Unicode symbols: ☐, ☒, ☑
    if (options.length === 0) {
      const rawText = stripXml(statusCellXml);
      const symbols = rawText.matchAll(/([☐☒☑])\s*([A-Za-z0-9\/\-]+)/g);
      for (const m of symbols) {
        options.push({
          status: m[2],
          label: m[2],
          isChecked: m[1] === "☒" || m[1] === "☑",
        });
      }
    }

    return options;
  }

  /**
   * Determines logical status from checked options.
   */
  private determineCurrentStatus(
    options: CheckboxOption[],
    remarks: string
  ): string {
    const checkedOption = options.find((o) => o.isChecked);
    if (!checkedOption) {
      if (remarks.toLowerCase().includes("not equipped") || remarks.toLowerCase().includes("standalone")) {
        return "NA";
      }
      return "PENDING";
    }

    const val = checkedOption.label.toUpperCase();
    if (val.includes("HEALTHY") || val.includes("VALID") || val.includes("UP TO DATE") || val.includes("PASS")) {
      return "PASS";
    }
    if (val.includes("UNHEALTHY") || val.includes("EXPIRED") || val.includes("OUT-OF-DATE") || val.includes("FAIL")) {
      return "FAIL";
    }
    if (val.includes("N/A") || val.includes("NA")) {
      return "NA";
    }
    return val;
  }

  /**
   * Maps appendix number to commands and checks.
   */
  private getAppendixCheckMapping(
    appNum: number,
    title: string
  ): { checkIds: string[]; commandId?: string } {
    const titleLower = title.toLowerCase();
    if (titleLower.includes("disk")) {
      return { checkIds: ["fg-hw-disk"], commandId: "cmd-fg-hw-disk" };
    }
    if (titleLower.includes("memory")) {
      return { checkIds: ["fg-hw-mem"], commandId: "cmd-fg-sys-perf" };
    }
    if (titleLower.includes("cpu")) {
      return { checkIds: ["fg-hw-cpu"], commandId: "cmd-fg-sys-perf" };
    }
    if (titleLower.includes("interface")) {
      return { checkIds: ["fg-hw-interface"], commandId: "cmd-fg-intf-phys" };
    }
    if (titleLower.includes("license")) {
      return { checkIds: ["fg-lic-forticare", "fg-lic-utm"], commandId: "cmd-fg-lic-contract" };
    }
    if (titleLower.includes("firmware")) {
      return { checkIds: ["fg-fw-version"], commandId: "cmd-fg-sys-status" };
    }
    if (titleLower.includes("vpn")) {
      return { checkIds: ["fg-vpn-tunnel"], commandId: "cmd-fg-vpn-tunnel" };
    }
    if (titleLower.includes("route") || titleLower.includes("routing")) {
      return { checkIds: ["fg-net-routing"], commandId: "cmd-fg-route-table" };
    }
    if (titleLower.includes("uptime")) {
      return { checkIds: ["fg-sys-uptime"], commandId: "cmd-fg-sys-perf" };
    }
    if (titleLower.includes("signatures")) {
      return { checkIds: ["fg-sec-signatures"], commandId: "cmd-fg-autoupdate-ver" };
    }
    if (titleLower.includes("date") || titleLower.includes("ntp") || titleLower.includes("time")) {
      return { checkIds: ["fg-sys-ntp"], commandId: "cmd-fg-ntp-status" };
    }
    if (titleLower.includes("internet") || titleLower.includes("connectivity")) {
      return { checkIds: ["fg-net-connectivity"], commandId: "cmd-fg-ping-internet" };
    }
    if (titleLower.includes("ha")) {
      return { checkIds: ["fg-sys-ha"], commandId: "cmd-fg-ha-status" };
    }
    if (titleLower.includes("event") || titleLower.includes("log")) {
      return { checkIds: ["fg-sys-log"], commandId: "cmd-fg-log-display" };
    }
    if (titleLower.includes("manager") || titleLower.includes("faz")) {
      return { checkIds: ["fg-sys-faz"], commandId: "cmd-fg-faz-test" };
    }

    return { checkIds: [] };
  }
}

export const ctcFortiGateLayoutV1_1 = new CtcFortiGateLayoutV1_1();
