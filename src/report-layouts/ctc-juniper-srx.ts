import { createHash } from "crypto";
import {
  ReportLayoutDefinition,
  DocumentMetadata,
  EditableChecklistRowTarget,
  AppendixContainerTarget,
  ProtectedSection,
  CheckboxOption,
} from "./types";
import { JUNIPER_SRX_CHECKLIST } from "@/vendors/juniper_srx/checklist";

function stripXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * CTC Global Juniper SRX Preventive Maintenance Report Layout.
 *
 * Implements robust table, row, and appendix mapping for Juniper SRX PM Word reports.
 */
export class CtcJuniperSrxLayout implements ReportLayoutDefinition {
  readonly id = "ctc-juniper-srx-v1";
  readonly name = "CTC Juniper SRX PM Report";
  readonly vendorId = "juniper_srx" as const;
  readonly qmsCode = "QMS-P09-F01";
  readonly version = "1.0";

  canHandle(documentXml: string, textSummary: string): boolean {
    const textLower = textSummary.toLowerCase();
    const hasPm =
      textLower.includes("preventive maintenance") ||
      textLower.includes("pm report") ||
      textLower.includes("qms-p09-f01");
    const hasJuniper =
      textLower.includes("juniper") ||
      textLower.includes("junos") ||
      textLower.includes("srx");
    const hasOtherVendor =
      textLower.includes("fortigate") ||
      textLower.includes("fortios") ||
      textLower.includes("palo alto") ||
      textLower.includes("pan-os") ||
      textLower.includes("checkpoint") ||
      textLower.includes("check point");

    // Require actual checklist table structure to distinguish approved reports from maintenance guides
    const hasChecklistTable =
      documentXml.includes("w:tbl") &&
      (textLower.includes("chassis hardware") ||
        textLower.includes("routing engine") ||
        textLower.includes("j-web") ||
        (textLower.includes("hardware status") && textLower.includes("status") && textLower.includes("remarks")));

    return hasPm && hasJuniper && !hasOtherVendor && hasChecklistTable;
  }

  extractMetadata(documentXml: string, tables: string[]): DocumentMetadata {
    const metadata: DocumentMetadata = {
      qmsDocumentNumber: "QMS-P09-F01",
      qmsVersion: "1.0",
    };

    for (let i = 0; i < Math.min(tables.length, 3); i++) {
      const tText = stripXml(tables[i]);
      if (tText.includes("Author") || tText.includes("Designation")) {
        const nameMatch = tText.match(/Name\s*[:\s]+([^:\r\n]+?)(?:Designation|Date|Signature|$)/i);
        if (nameMatch) metadata.engineerName = nameMatch[1].trim();

        const desigMatch = tText.match(/Designation\s*[:\s]+([^:\r\n]+?)(?:Date|Name|Signature|$)/i);
        if (desigMatch) metadata.designation = desigMatch[1].trim();

        const dateMatch = tText.match(/Date\s*[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i);
        if (dateMatch) metadata.reportDate = dateMatch[1].trim();
      }
    }

    for (let i = 0; i < Math.min(tables.length, 5); i++) {
      const tText = stripXml(tables[i]);
      if (tText.includes("Hostname") || tText.includes("Model") || tText.includes("Serial")) {
        const hostMatch = tText.match(/Hostname\s*[:\s]+([A-Za-z0-9_\-]+)/i);
        if (hostMatch) metadata.hostname = hostMatch[1].trim();

        const modelMatch = tText.match(/Model\s*[:\s]+(SRX[A-Za-z0-9_\-]+|Juniper[A-Za-z0-9_\-\s]+?)(?:Serial|Contract|Hostname|$)/i);
        if (modelMatch) metadata.model = modelMatch[1].trim();

        const serialMatch = tText.match(/(?:Serial\s*No|Serial\s*Number|Serial)\s*[:\s]+([A-Za-z0-9_\-]+)/i);
        if (serialMatch) metadata.serialNumber = serialMatch[1].trim();
      }
    }

    const allText = stripXml(documentXml);
    const custMatch = allText.match(/(?:Customer|Client)\s*[:\s]+([A-Za-z0-9\s.,&()\-]+?)(?:PM Date|Location|Prepared|FSMS|$)/i);
    if (custMatch) {
      metadata.customerName = custMatch[1].trim();
    }

    return metadata;
  }

  mapChecklistRows(tables: string[]): EditableChecklistRowTarget[] {
    const targets: EditableChecklistRowTarget[] = [];

    const checkItemMap: { checkId: string; taskKeyword: string; itemNum: string }[] = [
      { checkId: "srx-gui-access", taskKeyword: "gui", itemNum: "1.1" },
      { checkId: "srx-chassis-hardware", taskKeyword: "chassis hardware", itemNum: "2.1" },
      { checkId: "srx-cpu-usage", taskKeyword: "cpu", itemNum: "2.2" },
      { checkId: "srx-memory-usage", taskKeyword: "memory", itemNum: "2.3" },
      { checkId: "srx-storage-utilization", taskKeyword: "storage", itemNum: "2.4" },
      { checkId: "srx-chassis-health", taskKeyword: "chassis health", itemNum: "2.5" },
      { checkId: "srx-power-supply", taskKeyword: "power supply", itemNum: "2.6" },
      { checkId: "srx-license-status", taskKeyword: "license", itemNum: "3.1" },
      { checkId: "srx-firmware-version", taskKeyword: "firmware version", itemNum: "4.1" },
      { checkId: "srx-firmware-lifecycle", taskKeyword: "firmware lifecycle", itemNum: "4.2" },
      { checkId: "srx-chassis-alarms", taskKeyword: "system alarm", itemNum: "5.1" },
      { checkId: "srx-system-alarms", taskKeyword: "system-level alarm", itemNum: "5.2" },
      { checkId: "srx-cluster-status", taskKeyword: "cluster status", itemNum: "6.1" },
      { checkId: "srx-cluster-interfaces", taskKeyword: "cluster interface", itemNum: "6.2" },
      { checkId: "srx-log-messages", taskKeyword: "log messages", itemNum: "7.1" },
      { checkId: "srx-config-backup", taskKeyword: "backup", itemNum: "8.1" },
    ];

    const mappedCheckIds = new Set<string>();

    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const tableXml = tables[tIdx];
      const rows = tableXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const rowXml = rows[rIdx];
        const rowText = stripXml(rowXml).toLowerCase();
        const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
        if (cells.length < 3) continue;

        for (const item of checkItemMap) {
          if (mappedCheckIds.has(item.checkId)) continue;

          const taskCell = stripXml(cells[1] || "").toLowerCase();
          const descCell = stripXml(cells[2] || "").toLowerCase();
          const matchesTask =
            taskCell.includes(item.taskKeyword) ||
            descCell.includes(item.taskKeyword) ||
            rowText.includes(item.taskKeyword);

          if (matchesTask) {
            mappedCheckIds.add(item.checkId);
            const def = JUNIPER_SRX_CHECKLIST.find((c) => c.id === item.checkId);

            const statusCellIdx = cells.length >= 5 ? 3 : cells.length - 2;
            const remarksCellIdx = cells.length >= 5 ? 4 : cells.length - 1;

            const statusCellXml = cells[statusCellIdx];
            const remarksCellXml = cells[remarksCellIdx];

            const currentRemarks = stripXml(remarksCellXml);
            const checkboxOptions = this.parseCheckboxes(statusCellXml);
            const currentStatus = this.determineCurrentStatus(checkboxOptions, currentRemarks);

            targets.push({
              itemNumber: def?.itemNumber || item.itemNum,
              checkId: item.checkId,
              taskName: def?.taskName || stripXml(cells[1]),
              sectionName: def?.group || "General",
              tableIndex: tIdx,
              rowIndex: rIdx,
              statusCellIndex: statusCellIdx,
              remarksCellIndex: remarksCellIdx,
              currentStatus,
              currentRemarks,
              checkboxOptions,
            });
            break;
          }
        }
      }
    }

    return targets;
  }

  mapAppendixContainers(
    documentXml: string,
    relsXml?: string
  ): AppendixContainerTarget[] {
    const containers: AppendixContainerTarget[] = [];
    const relsMap = new Map<string, string>();
    if (relsXml) {
      const relMatches = relsXml.matchAll(
        /<Relationship[^>]*Id="([^"]+)"[^>]*Type="[^"]*image"[^>]*Target="([^"]+)"/g
      );
      for (const m of relMatches) {
        relsMap.set(m[1], m[2]);
      }
    }

    const tableMatches = documentXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) || [];

    for (let tIdx = 0; tIdx < tableMatches.length; tIdx++) {
      const tableXml = tableMatches[tIdx];
      const rows = tableXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const rowXml = rows[rIdx];
        const rowText = stripXml(rowXml);

        const appMatches = rowText.matchAll(
          /Appendix\s*(\d+)\s*[-–:]\s*([^<\r\n]+)/gi
        );

        for (const appMatch of appMatches) {
          const appNum = parseInt(appMatch[1], 10);
          const appTitle = appMatch[2].trim();

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

          const { checkIds, commandId } = this.getAppendixCheckMapping(appNum);

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
    }

    return containers;
  }

  identifyProtectedSections(tables: string[]): ProtectedSection[] {
    const protectedSections: ProtectedSection[] = [];
    const getNormText = (tableXml: string) =>
      stripXml(tableXml).replace(/\s+/g, " ").trim();

    for (let i = 0; i < Math.min(tables.length, 4); i++) {
      const normText = getNormText(tables[i]);
      const normLower = normText.toLowerCase();

      if (normLower.includes("author’s details") || normLower.includes("author's details") || normLower.includes("technical engineer")) {
        const rows = tables[i].match(/<w:tr[\s>]/g) || [];
        const cells = tables[i].match(/<w:tc[\s>]/g) || [];

        protectedSections.push({
          name: "Author Details & Technical Sign-Off",
          type: "TABLE",
          tableIndex: i,
          reason: "Preserves official engineer credentials and sign-offs.",
          contentHash: createHash("sha256").update(normText).digest("hex"),
          normalizedText: normText,
          rowCount: rows.length,
          cellCount: cells.length,
        });
      } else if (normLower.includes("customer satisfaction survey") || normLower.includes("level of the ctc")) {
        const rows = tables[i].match(/<w:tr[\s>]/g) || [];
        const cells = tables[i].match(/<w:tc[\s>]/g) || [];

        protectedSections.push({
          name: "Customer Satisfaction Survey",
          type: "TABLE",
          tableIndex: i,
          reason: "Customer evaluation form must remain untouched.",
          contentHash: createHash("sha256").update(normText).digest("hex"),
          normalizedText: normText,
          rowCount: rows.length,
          cellCount: cells.length,
        });
      }
    }

    return protectedSections;
  }

  private parseCheckboxes(statusCellXml: string): CheckboxOption[] {
    const options: CheckboxOption[] = [];
    const sdts = statusCellXml.match(/<w:sdt[\s>][\s\S]*?<\/w:sdt>/g) || [];

    for (const sdt of sdts) {
      const isCheckedMatch = sdt.match(/<w14:checked\s+w14:val="([01])"/);
      const isChecked = isCheckedMatch ? isCheckedMatch[1] === "1" : sdt.includes("☒");
      const sdtText = stripXml(sdt);
      const label = sdtText.replace(/[☐☒☑]/g, "").trim();
      const sdtIdMatch = sdt.match(/<w:id\s+w:val="([^"]+)"/);

      options.push({
        status: label,
        label: label || "Option",
        isChecked,
        sdtId: sdtIdMatch ? sdtIdMatch[1] : undefined,
      });
    }

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

  private determineCurrentStatus(
    options: CheckboxOption[],
    remarks: string
  ): string {
    const checked = options.filter((o) => o.isChecked);
    if (checked.length === 1) {
      const label = checked[0].label.toUpperCase();
      if (label.includes("PASS") || label.includes("HEALTHY") || label.includes("VALID") || label.includes("UP-TO-DATE") || label.includes("AVAILABLE")) return "PASS";
      if (label.includes("FAIL") || label.includes("UNHEALTHY") || label.includes("EXPIRED") || label.includes("OUT-OF-DATE") || label.includes("UN-AVAILABLE")) return "FAIL";
      if (label.includes("N/A") || label.includes("NA")) return "NA";
    }

    const rUpper = remarks.toUpperCase();
    if (rUpper.includes("N/A") || rUpper.includes("NOT APPLICABLE")) return "NA";
    if (rUpper.includes("PASSED") || rUpper.includes("PASS")) return "PASS";
    if (rUpper.includes("FAILED") || rUpper.includes("FAIL")) return "FAIL";

    return "NA";
  }

  private getAppendixCheckMapping(appendixNumber: number): {
    checkIds: string[];
    commandId?: string;
  } {
    const map: Record<number, { checkIds: string[]; commandId?: string }> = {
      1: { checkIds: ["srx-gui-access"] },
      2: { checkIds: ["srx-chassis-hardware"], commandId: "srx-chassis-hardware" },
      3: { checkIds: ["srx-cpu-usage"], commandId: "srx-routing-engine" },
      4: { checkIds: ["srx-memory-usage"], commandId: "srx-routing-engine" },
      5: { checkIds: ["srx-storage-utilization"], commandId: "srx-system-storage" },
      6: { checkIds: ["srx-chassis-health"], commandId: "srx-chassis-environment" },
      7: { checkIds: ["srx-power-supply"], commandId: "srx-power-supply" },
      8: { checkIds: ["srx-license-status"], commandId: "srx-license-detail" },
      9: { checkIds: ["srx-firmware-version"], commandId: "srx-version" },
      10: { checkIds: ["srx-firmware-lifecycle"] },
      11: { checkIds: ["srx-chassis-alarms"], commandId: "srx-chassis-alarms" },
      12: { checkIds: ["srx-system-alarms"], commandId: "srx-system-alarms" },
      13: { checkIds: ["srx-cluster-status"], commandId: "srx-cluster-status" },
      14: { checkIds: ["srx-cluster-interfaces"], commandId: "srx-cluster-interfaces" },
      15: { checkIds: ["srx-log-messages"], commandId: "srx-system-messages" },
      16: { checkIds: ["srx-config-backup"] },
    };

    return map[appendixNumber] || { checkIds: [] };
  }
}

export const ctcJuniperSrxLayout = new CtcJuniperSrxLayout();
