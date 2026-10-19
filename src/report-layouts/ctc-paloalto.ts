import { createHash } from "crypto";
import {
  ReportLayoutDefinition,
  DocumentMetadata,
  EditableChecklistRowTarget,
  AppendixContainerTarget,
  ProtectedSection,
  CheckboxOption,
} from "./types";
import { PALOALTO_CHECKLIST } from "@/vendors/paloalto/checklist";

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
 * CTC Global Palo Alto Preventive Maintenance Report Layout.
 *
 * Implements robust table, row, and appendix mapping for Palo Alto PM Word reports.
 */
export class CtcPaloAltoLayout implements ReportLayoutDefinition {
  readonly id = "ctc-paloalto-v1";
  readonly name = "CTC Palo Alto PM Report";
  readonly vendorId = "paloalto" as const;
  readonly qmsCode = "QMS-P09-F01";
  readonly version = "1.0";

  canHandle(documentXml: string, textSummary: string): boolean {
    const textLower = textSummary.toLowerCase();
    const hasPm =
      textLower.includes("preventive maintenance") ||
      textLower.includes("pm report") ||
      textLower.includes("qms-p09-f01");
    const hasPaloAlto =
      textLower.includes("palo alto") ||
      textLower.includes("pan-os") ||
      textLower.includes("pa-820") ||
      textLower.includes("pa-");
    const hasOtherVendor =
      textLower.includes("fortigate") ||
      textLower.includes("fortios") ||
      textLower.includes("juniper") ||
      textLower.includes("junos") ||
      textLower.includes("checkpoint") ||
      textLower.includes("check point");

    return hasPm && hasPaloAlto && !hasOtherVendor;
  }

  extractMetadata(documentXml: string, tables: string[]): DocumentMetadata {
    const metadata: DocumentMetadata = {
      qmsDocumentNumber: "QMS-P09-F01",
      qmsVersion: "1.0",
    };

    // Author & Engineer details (typically in Table 1 or Table 0)
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

    // Device info table (typically Table 3 or early table with Hostname/Model/Serial)
    for (let i = 0; i < Math.min(tables.length, 5); i++) {
      const tText = stripXml(tables[i]);
      if (tText.includes("Hostname") || tText.includes("Model") || tText.includes("Serial")) {
        const hostMatch = tText.match(/Hostname\s*[:\s]+([A-Za-z0-9_\-]+)/i);
        if (hostMatch) metadata.hostname = hostMatch[1].trim();

        const modelMatch = tText.match(/Model\s*[:\s]+(PA-[A-Za-z0-9_\-]+|Palo\s*Alto[A-Za-z0-9_\-\s]+?)(?:Serial|Contract|Hostname|$)/i);
        if (modelMatch) metadata.model = modelMatch[1].trim();

        const serialMatch = tText.match(/(?:Serial\s*No|Serial\s*Number|Serial)\s*[:\s]+([A-Za-z0-9_\-]+)/i);
        if (serialMatch) metadata.serialNumber = serialMatch[1].trim();
      }
    }

    // Customer name from document text
    const allText = stripXml(documentXml);
    const custMatch = allText.match(/(?:Customer|Client)\s*[:\s]+([A-Za-z0-9\s.,&()\-]+?)(?:PM Date|Location|Prepared|FSMS|$)/i);
    if (custMatch) {
      metadata.customerName = custMatch[1].trim();
    }

    return metadata;
  }

  mapChecklistRows(tables: string[]): EditableChecklistRowTarget[] {
    const targets: EditableChecklistRowTarget[] = [];

    // Map by check task keyword or ID
    const checkItemMap: { checkId: string; taskKeyword: string; itemNum: string }[] = [
      { checkId: "pa-disk-space", taskKeyword: "hard disk", itemNum: "1.1" },
      { checkId: "pa-cpu-usage", taskKeyword: "cpu", itemNum: "1.2" },
      { checkId: "pa-memory-usage", taskKeyword: "memory", itemNum: "1.3" },
      { checkId: "pa-port-monitoring", taskKeyword: "port monitoring", itemNum: "1.4" },
      { checkId: "pa-power-supply", taskKeyword: "power supply", itemNum: "1.5" },
      { checkId: "pa-hardware-support", taskKeyword: "hardware support", itemNum: "2.1" },
      { checkId: "pa-feature-license", taskKeyword: "feature license", itemNum: "2.2" },
      { checkId: "pa-system-uptime", taskKeyword: "system uptime", itemNum: "3.1" },
      { checkId: "pa-gui-access", taskKeyword: "gui", itemNum: "3.2" },
      { checkId: "pa-ssh-access", taskKeyword: "cli", itemNum: "3.3" },
      { checkId: "pa-firmware-version", taskKeyword: "firmware version", itemNum: "3.4" },
      { checkId: "pa-date-time", taskKeyword: "date & time", itemNum: "3.5" },
      { checkId: "pa-internet-access", taskKeyword: "internet access", itemNum: "3.6" },
      { checkId: "pa-high-availability", taskKeyword: "high availability", itemNum: "3.7" },
      { checkId: "pa-event-logging", taskKeyword: "event logging", itemNum: "3.8" },
      { checkId: "pa-config-backup", taskKeyword: "backup", itemNum: "3.9" },
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

          // Check if this row describes this task
          const taskCell = stripXml(cells[1] || "").toLowerCase();
          const descCell = stripXml(cells[2] || "").toLowerCase();
          const matchesTask =
            taskCell.includes(item.taskKeyword) ||
            descCell.includes(item.taskKeyword) ||
            rowText.includes(item.taskKeyword);

          if (matchesTask) {
            mappedCheckIds.add(item.checkId);
            const def = PALOALTO_CHECKLIST.find((c) => c.id === item.checkId);

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
      1: { checkIds: ["pa-disk-space"], commandId: "pa-disk-space" },
      2: { checkIds: ["pa-cpu-usage"], commandId: "pa-system-resources" },
      3: { checkIds: ["pa-memory-usage"], commandId: "pa-system-resources" },
      4: { checkIds: ["pa-port-monitoring"], commandId: "pa-interface-all" },
      5: { checkIds: ["pa-power-supply"], commandId: "pa-power-supplies" },
      6: { checkIds: ["pa-hardware-support"], commandId: "pa-support-info" },
      7: { checkIds: ["pa-feature-license"], commandId: "pa-license-info" },
      8: { checkIds: ["pa-system-uptime"], commandId: "pa-system-info" },
      9: { checkIds: ["pa-gui-access"] },
      10: { checkIds: ["pa-ssh-access"] },
      11: { checkIds: ["pa-firmware-version"], commandId: "pa-system-info" },
      12: { checkIds: ["pa-date-time"], commandId: "pa-clock" },
      13: { checkIds: ["pa-internet-access"], commandId: "pa-internet-ping" },
      14: { checkIds: ["pa-high-availability"], commandId: "pa-ha-status" },
      15: { checkIds: ["pa-event-logging"], commandId: "pa-system-log" },
      16: { checkIds: ["pa-config-backup"] },
    };

    return map[appendixNumber] || { checkIds: [] };
  }
}

export const ctcPaloAltoLayout = new CtcPaloAltoLayout();
