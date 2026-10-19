import { createHash } from "crypto";
import {
  ReportLayoutDefinition,
  DocumentMetadata,
  EditableChecklistRowTarget,
  AppendixContainerTarget,
  ProtectedSection,
  CheckboxOption,
  DeviceSectionTarget,
} from "./types";
import { CHECKPOINT_CHECKLIST } from "@/vendors/checkpoint/checklist";

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
 * CTC Global Check Point Preventive Maintenance Report Layout.
 *
 * Implements robust table, row, and appendix mapping for Check Point PM Word reports,
 * supporting single-device and multi-gateway reports.
 */
export class CtcCheckPointLayout implements ReportLayoutDefinition {
  readonly id = "ctc-checkpoint-v1";
  readonly name = "CTC Check Point PM Report";
  readonly vendorId = "checkpoint" as const;
  readonly qmsCode = "QMS-P09-F01";
  readonly version = "1.0";

  canHandle(documentXml: string, textSummary: string): boolean {
    const textLower = textSummary.toLowerCase();
    const hasPm =
      textLower.includes("preventive maintenance") ||
      textLower.includes("pm report") ||
      textLower.includes("qms-p09-f01");
    const hasCheckPoint =
      textLower.includes("check point") ||
      textLower.includes("checkpoint") ||
      textLower.includes("gaia") ||
      textLower.includes("smartconsole");
    const hasOtherVendor =
      textLower.includes("fortigate") ||
      textLower.includes("fortios") ||
      textLower.includes("palo alto") ||
      textLower.includes("pan-os") ||
      textLower.includes("juniper") ||
      textLower.includes("junos");

    const hasChecklistTable =
      documentXml.includes("w:tbl") &&
      (textLower.includes("appliance status") ||
        textLower.includes("check point version") ||
        textLower.includes("expected result") ||
        textLower.includes("pass? (y/n)") ||
        textLower.includes("smartview monitor"));

    return hasPm && hasCheckPoint && !hasOtherVendor && hasChecklistTable;
  }

  detectDeviceSections(documentXml: string, tables: string[]): DeviceSectionTarget[] {
    const sections: DeviceSectionTarget[] = [];
    for (let i = 0; i < tables.length; i++) {
      const text = stripXml(tables[i]);
      if (
        text.includes("Model") &&
        (text.includes("Serial") || text.includes("Mgmt IP") || text.includes("IP Address"))
      ) {
        const hostMatch = text.match(/(?:Hostname|Mgmt IP Address|Mgmt IP|IP Address)\s*[:\s]+([A-Za-z0-9_.\-]+)/i);
        const modelMatch = text.match(/Model\s*[:\s]+([A-Za-z0-9_\-\s]+?)(?:Serial|Mgmt|IP|Contract|$)/i);
        const serialMatch = text.match(/(?:Serial\s*No|Serial\s*Number|Serial)\s*[:\s]+([A-Za-z0-9_\-]+)/i);

        sections.push({
          sectionIndex: sections.length + 1,
          tableIndex: i,
          hostname: hostMatch ? hostMatch[1].trim() : undefined,
          model: modelMatch ? modelMatch[1].trim() : undefined,
          serialNumber: serialMatch ? serialMatch[1].trim() : undefined,
          isPrimary: sections.length === 0,
        });
      }
    }
    return sections;
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

    const deviceSections = this.detectDeviceSections(documentXml, tables);
    if (deviceSections.length > 0) {
      metadata.hostname = deviceSections[0].hostname;
      metadata.model = deviceSections[0].model;
      metadata.serialNumber = deviceSections[0].serialNumber;
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
      { checkId: "cp-os-version", taskKeyword: "os version", itemNum: "1.1" },
      { checkId: "cp-hotfix-take", taskKeyword: "hotfix", itemNum: "1.2" },
      { checkId: "cp-system-uptime", taskKeyword: "uptime", itemNum: "1.3" },
      { checkId: "cp-cpu-usage", taskKeyword: "cpu", itemNum: "2.1" },
      { checkId: "cp-memory-usage", taskKeyword: "memory", itemNum: "2.2" },
      { checkId: "cp-disk-space", taskKeyword: "disk space", itemNum: "3.1" },
      { checkId: "cp-hardware-health", taskKeyword: "power supply", itemNum: "4.1" },
      { checkId: "cp-interface-monitoring", taskKeyword: "connection of lan cable", itemNum: "4.2" },
      { checkId: "cp-license-information", taskKeyword: "license status", itemNum: "5.1" },
      { checkId: "cp-gui-access", taskKeyword: "management access", itemNum: "6.1" },
      { checkId: "cp-ssh-access", taskKeyword: "ssh", itemNum: "6.2" },
      { checkId: "cp-date-time", taskKeyword: "date and time", itemNum: "7.1" },
      { checkId: "cp-ntp-synchronization", taskKeyword: "ntp", itemNum: "7.2" },
      { checkId: "cp-dns-configuration", taskKeyword: "dns", itemNum: "8.1" },
      { checkId: "cp-routing-table", taskKeyword: "routing table", itemNum: "8.2" },
      { checkId: "cp-local-log-storage", taskKeyword: "local log storage", itemNum: "9.1" },
      { checkId: "cp-log-switch-configuration", taskKeyword: "log switch", itemNum: "9.2" },
      { checkId: "cp-cluster-status", taskKeyword: "high availability", itemNum: "10.1" },
      { checkId: "cp-ha-synchronization", taskKeyword: "synchronization", itemNum: "10.2" },
      { checkId: "cp-watchdog-processes", taskKeyword: "watchdog", itemNum: "11.1" },
      { checkId: "cp-vsx-status", taskKeyword: "virtual system", itemNum: "12.1" },
      { checkId: "cp-vsx-load-sharing", taskKeyword: "load sharing", itemNum: "12.2" },
      { checkId: "cp-concurrent-connections", taskKeyword: "connections", itemNum: "13.1" },
      { checkId: "cp-config-backup", taskKeyword: "backup", itemNum: "14.1" },
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
            const def = CHECKPOINT_CHECKLIST.find((c) => c.id === item.checkId);

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

      // Check Point templates often have text like "Y" or "N"
      if (options.length === 0 && (rawText === "Y" || rawText === "N")) {
        options.push({
          status: rawText === "Y" ? "PASS" : "FAIL",
          label: rawText,
          isChecked: true,
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
      if (label === "Y" || label.includes("PASS") || label.includes("HEALTHY") || label.includes("VALID") || label.includes("AVAILABLE")) return "PASS";
      if (label === "N" || label.includes("FAIL") || label.includes("UNHEALTHY") || label.includes("EXPIRED") || label.includes("UN-AVAILABLE")) return "FAIL";
      if (label.includes("N/A") || label.includes("NA")) return "NA";
    }

    const rUpper = remarks.toUpperCase();
    if (rUpper.includes("N/A") || rUpper.includes("NOT APPLICABLE")) return "NA";
    if (rUpper.includes("PASSED") || rUpper.includes("PASS") || rUpper.startsWith("OK")) return "PASS";
    if (rUpper.includes("FAILED") || rUpper.includes("FAIL")) return "FAIL";

    return "NA";
  }

  private getAppendixCheckMapping(appendixNumber: number): {
    checkIds: string[];
    commandId?: string;
  } {
    const map: Record<number, { checkIds: string[]; commandId?: string }> = {
      1: { checkIds: ["cp-os-version"], commandId: "cp-os-version" },
      2: { checkIds: ["cp-hotfix-take", "cp-interface-monitoring"], commandId: "cp-hotfix-take" },
      3: { checkIds: ["cp-system-uptime", "cp-hardware-health"], commandId: "cp-uptime" },
      4: { checkIds: ["cp-cpu-usage", "cp-date-time"], commandId: "cp-cpu" },
      5: { checkIds: ["cp-memory-usage"], commandId: "cp-memory" },
      6: { checkIds: ["cp-disk-space"], commandId: "cp-disk-usage" },
      7: { checkIds: ["cp-log-switch-configuration"] },
      8: { checkIds: ["cp-cluster-status"], commandId: "cp-cluster-state" },
      9: { checkIds: ["cp-license-information"], commandId: "cp-licenses" },
      10: { checkIds: ["cp-config-backup"] },
      11: { checkIds: ["cp-ssh-access"] },
      12: { checkIds: ["cp-date-time"], commandId: "cp-clock" },
      13: { checkIds: ["cp-ntp-synchronization"], commandId: "cp-ntp-active" },
      14: { checkIds: ["cp-dns-configuration"], commandId: "cp-dns" },
      15: { checkIds: ["cp-routing-table"], commandId: "cp-routes" },
      16: { checkIds: ["cp-local-log-storage"], commandId: "cp-disk-usage" },
      17: { checkIds: ["cp-log-switch-configuration"] },
      18: { checkIds: ["cp-cluster-status"], commandId: "cp-cluster-state" },
      19: { checkIds: ["cp-ha-synchronization"], commandId: "cp-cluster-sync" },
      20: { checkIds: ["cp-watchdog-processes"], commandId: "cp-watchdog" },
      21: { checkIds: ["cp-vsx-status"], commandId: "cp-vsx-systems" },
      22: { checkIds: ["cp-vsx-load-sharing"], commandId: "cp-cluster-state" },
      23: { checkIds: ["cp-concurrent-connections"], commandId: "cp-connections" },
      24: { checkIds: ["cp-config-backup"] },
    };

    return map[appendixNumber] || { checkIds: [] };
  }
}

export const ctcCheckPointLayout = new CtcCheckPointLayout();
