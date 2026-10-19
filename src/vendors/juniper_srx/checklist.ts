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
  collectionInstructions?: string
): VendorCheckItemDefinition {
  return {
    id,
    taskName,
    description,
    group,
    commands,
    sourceType,
    evidenceRequired: true,
    targetSection: group,
    guideSource: guide(group, tableRow),
    evaluationPolicy,
    collectionInstructions,
  };
}

export const JUNIPER_SRX_CHECKLIST: VendorCheckItemDefinition[] = [
  item("srx-gui-access", "GUI Accessibility", "Verify successful login to the firewall dashboard.", "Management Access", [], "GUI_MANUAL", 2, "Require engineer confirmation and a mapped GUI screenshot.", "Log in through J-Web and attach a dashboard screenshot."),
  item("srx-chassis-hardware", "Chassis Hardware Info", "Check hardware model, serial numbers and installed components.", "Hardware Status", ["srx-chassis-hardware"], "CLI", 3, "Engineer review of the reported chassis and components."),
  item("srx-cpu-usage", "CPU Usage", "Check current CPU utilization on both nodes.", "Hardware Status", ["srx-routing-engine"], "CLI", 4, "Review each applicable node; the guide provides no numeric threshold."),
  item("srx-memory-usage", "Memory Usage", "Check current memory utilization on both nodes.", "Hardware Status", ["srx-routing-engine"], "CLI", 5, "Review each applicable node; the guide provides no numeric threshold."),
  item("srx-storage-utilization", "Storage Utilization", "Check filesystem usage on both nodes.", "Hardware Status", ["srx-system-storage"], "CLI", 6, "Review both applicable nodes; the guide provides no numeric threshold."),
  item("srx-chassis-health", "Hardware / Chassis Health", "Check temperatures, fans and hardware status.", "Hardware Status", ["srx-chassis-environment"], "CLI", 7, "Engineer review against device-specific health criteria."),
  item("srx-power-supply", "Power Supply Status", "Verify installed power supplies are operational.", "Hardware Status", ["srx-power-supply"], "CLI", 8, "Engineer review of all installed power supplies."),
  item("srx-license-status", "License Status", "Verify installed licenses and expiration dates.", "Licensing", ["srx-license-detail"], "CLI", 10, "Engineer review of applicable licenses and expiry dates."),
  item("srx-firmware-version", "Firmware Version", "Check installed Junos version on both nodes.", "Firmware", ["srx-version"], "CLI", 11, "Record version on each applicable node; do not infer lifecycle status."),
  item("srx-firmware-lifecycle", "Firmware Lifecycle", "Verify software support and EOS status.", "Firmware", [], "EXTERNAL_REFERENCE", 12, "Require a current Juniper reference and engineer review; show version alone is insufficient.", "Check the Juniper official lifecycle reference for the installed release."),
  item("srx-chassis-alarms", "System Alarm", "Check for active major or minor chassis alarms.", "Alarms", ["srx-chassis-alarms"], "CLI", 14, "Engineer review of active alarm severity and context."),
  item("srx-system-alarms", "System-Level Alarm", "Check active system alarms.", "Alarms", ["srx-system-alarms"], "CLI", 15, "Engineer review of active system alarms."),
  item("srx-cluster-status", "Chassis Cluster Status", "Verify cluster nodes, redundancy groups and failover status.", "Chassis Cluster", ["srx-cluster-status"], "CLI", 16, "Confirm topology and review all nodes and redundancy groups."),
  item("srx-cluster-interfaces", "Chassis Cluster Interfaces", "Verify control, fabric and monitored interfaces.", "Chassis Cluster", ["srx-cluster-interfaces"], "CLI", 17, "Engineer review of applicable control, fabric, and monitored links."),
  item("srx-log-messages", "Log Messages (Last 50)", "Review the latest 50 system log entries for errors and warnings.", "Logging", ["srx-system-messages"], "CLI", 19, "Engineer review of the latest 50 messages."),
  item("srx-config-backup", "Configuration Backup", "Export the configuration and verify the downloaded file.", "Configuration Backup", [], "GUI_MANUAL", 20, "Require engineer confirmation of a downloaded backup and mapped screenshot.", "Export the configuration in J-Web and attach the download confirmation screenshot."),
];
