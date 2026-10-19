import { VendorCheckItemDefinition } from "../types";

const guide = (section: string, tableRow: number) => ({
  document: "Juniper SRX Preventive Maintenance.docx",
  section,
  tableRow,
});

function item(
  id: string,
  taskName: string,
  description: string,
  group: string,
  commands: string[],
  sourceType: VendorCheckItemDefinition["sourceType"],
  tableRow: number,
  evaluationPolicy: string,
  targetAppendix?: string,
  itemNumber?: string,
  collectionInstructions?: string
): VendorCheckItemDefinition {
  return {
    id,
    itemNumber,
    taskName,
    description,
    group,
    commands,
    sourceType,
    evidenceRequired: true,
    targetSection: group,
    targetAppendix,
    guideSource: guide(group, tableRow),
    evaluationPolicy,
    collectionInstructions,
  };
}

export const JUNIPER_SRX_CHECKLIST: VendorCheckItemDefinition[] = [
  item("srx-gui-access", "GUI Accessibility", "Verify successful login to the firewall dashboard.", "Management Access", [], "GUI_MANUAL", 2, "Require engineer confirmation and a mapped GUI screenshot.", "Appendix 1 – GUI Accessibility", "1.1", "Log in through J-Web and attach a dashboard screenshot."),
  item("srx-chassis-hardware", "Chassis Hardware Info", "Check hardware model, serial numbers and installed components.", "Hardware Status", ["srx-chassis-hardware"], "CLI", 3, "Engineer review of the reported chassis and components.", "Appendix 2 – Chassis Hardware", "2.1"),
  item("srx-cpu-usage", "CPU Usage", "Check current CPU utilization on both nodes.", "Hardware Status", ["srx-routing-engine"], "CLI", 4, "Review each applicable node; the guide provides no numeric threshold.", "Appendix 3 – Routing Engine CPU", "2.2"),
  item("srx-memory-usage", "Memory Usage", "Check current memory utilization on both nodes.", "Hardware Status", ["srx-routing-engine"], "CLI", 5, "Review each applicable node; the guide provides no numeric threshold.", "Appendix 4 – Routing Engine Memory", "2.3"),
  item("srx-storage-utilization", "Storage Utilization", "Check filesystem usage on both nodes.", "Hardware Status", ["srx-system-storage"], "CLI", 6, "Review both applicable nodes; the guide provides no numeric threshold.", "Appendix 5 – Storage Utilization", "2.4"),
  item("srx-chassis-health", "Hardware / Chassis Health", "Check temperatures, fans and hardware status.", "Hardware Status", ["srx-chassis-environment"], "CLI", 7, "Engineer review against device-specific health criteria.", "Appendix 6 – Chassis Environment", "2.5"),
  item("srx-power-supply", "Power Supply Status", "Verify installed power supplies are operational.", "Hardware Status", ["srx-power-supply"], "CLI", 8, "Engineer review of all installed power supplies.", "Appendix 7 – Power Supply", "2.6"),
  item("srx-license-status", "License Status", "Verify installed licenses and expiration dates.", "Licensing", ["srx-license-detail"], "CLI", 10, "Engineer review of applicable licenses and expiry dates.", "Appendix 8 – License Detail", "3.1"),
  item("srx-firmware-version", "Firmware Version", "Check installed Junos version on both nodes.", "Firmware", ["srx-version"], "CLI", 11, "Record version on each applicable node; do not infer lifecycle status.", "Appendix 9 – Software Version", "4.1"),
  item("srx-firmware-lifecycle", "Firmware Lifecycle", "Verify software support and EOS status.", "Firmware", [], "EXTERNAL_REFERENCE", 12, "Require a current Juniper reference and engineer review; show version alone is insufficient.", "Appendix 10 – Lifecycle Reference", "4.2", "Check the Juniper official lifecycle reference for the installed release."),
  item("srx-chassis-alarms", "System Alarm", "Check for active major or minor chassis alarms.", "Alarms", ["srx-chassis-alarms"], "CLI", 14, "Engineer review of active alarm severity and context.", "Appendix 11 – Chassis Alarms", "5.1"),
  item("srx-system-alarms", "System-Level Alarm", "Check active system alarms.", "Alarms", ["srx-system-alarms"], "CLI", 15, "Engineer review of active system alarms.", "Appendix 12 – System Alarms", "5.2"),
  item("srx-cluster-status", "Chassis Cluster Status", "Verify cluster nodes, redundancy groups and failover status.", "Chassis Cluster", ["srx-cluster-status"], "CLI", 16, "Confirm topology and review all nodes and redundancy groups.", "Appendix 13 – Chassis Cluster Status", "6.1"),
  item("srx-cluster-interfaces", "Chassis Cluster Interfaces", "Verify control, fabric and monitored interfaces.", "Chassis Cluster", ["srx-cluster-interfaces"], "CLI", 17, "Engineer review of applicable control, fabric, and monitored links.", "Appendix 14 – Chassis Cluster Interfaces", "6.2"),
  item("srx-log-messages", "Log Messages (Last 50)", "Review the latest 50 system log entries for errors and warnings.", "Logging", ["srx-system-messages"], "CLI", 19, "Engineer review of the latest 50 messages.", "Appendix 15 – System Messages", "7.1"),
  item("srx-config-backup", "Configuration Backup", "Export the configuration and verify the downloaded file.", "Configuration Backup", [], "GUI_MANUAL", 20, "Require engineer confirmation of a downloaded backup and mapped screenshot.", "Appendix 16 – Configuration Backup", "8.1", "Export the configuration in J-Web and attach the download confirmation screenshot."),
];
