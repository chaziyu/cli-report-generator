import { VendorCommandDefinition } from "../types";

const guide = (section: string, tableRow: number) => ({
  document: "Juniper SRX Preventive Maintenance.docx",
  section,
  tableRow,
});

function command(
  id: string,
  cli: string,
  description: string,
  group: string,
  checkIds: string[],
  tableRow: number
): VendorCommandDefinition {
  return {
    id,
    command: cli,
    description,
    group,
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [],
    evidenceRequired: true,
    targetSection: group,
    mappedCheckIds: checkIds,
    executionContext: "Junos operational mode",
    contextVerification: "GUIDE_SPECIFIED",
    guideSource: guide(group, tableRow),
  };
}

export const JUNIPER_SRX_COMMANDS: VendorCommandDefinition[] = [
  command("srx-chassis-hardware", "show chassis hardware", "Review chassis model, serials, and installed components.", "Hardware Status", ["srx-chassis-hardware"], 3),
  command("srx-routing-engine", "show chassis routing-engine", "Collect per-node routing-engine CPU and memory observations.", "Hardware Status", ["srx-cpu-usage", "srx-memory-usage"], 4),
  command("srx-system-storage", "show system storage", "Review filesystem usage on both cluster nodes.", "Hardware Status", ["srx-storage-utilization"], 6),
  command("srx-chassis-environment", "show chassis environment", "Review chassis temperatures, fans, and component health.", "Hardware Status", ["srx-chassis-health"], 7),
  command("srx-power-supply", "show chassis environment pem", "Review power supply state.", "Hardware Status", ["srx-power-supply"], 8),
  command("srx-license-detail", "show system license detail", "Review installed license details and expiry dates.", "Licensing", ["srx-license-status"], 10),
  command("srx-version", "show version", "Collect Junos version information for both cluster nodes.", "Firmware", ["srx-firmware-version"], 11),
  command("srx-chassis-alarms", "show chassis alarms", "Review active chassis alarms.", "Alarms", ["srx-chassis-alarms"], 14),
  command("srx-system-alarms", "show system alarms", "Review active system alarms.", "Alarms", ["srx-system-alarms"], 15),
  command("srx-cluster-status", "show chassis cluster status", "Review cluster nodes, redundancy groups, and failover state.", "Chassis Cluster", ["srx-cluster-status"], 16),
  command("srx-cluster-interfaces", "show chassis cluster interfaces", "Review control, fabric, and monitored interfaces.", "Chassis Cluster", ["srx-cluster-interfaces"], 17),
  command("srx-system-messages", "show log messages | last 50", "Review the latest 50 system log entries.", "Logging", ["srx-log-messages"], 19),
];
