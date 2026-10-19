import { VendorCommandDefinition } from "../types";

const guide = (section: string, tableRow: number) => ({
  document: "Palo Alto Preventive Maintenance.docx",
  section,
  tableRow,
});

function command(
  id: string,
  cli: string,
  description: string,
  group: string,
  checkIds: string[],
  tableRow: number,
  options: Partial<VendorCommandDefinition> = {}
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
    guideSource: guide(group, tableRow),
    ...options,
  };
}

export const PALOALTO_COMMANDS: VendorCommandDefinition[] = [
  command("pa-disk-space", "show system disk-space", "Verify disk utilization.", "Hardware Status", ["pa-disk-space"], 2),
  command("pa-system-resources", "show system resources", "Collect CPU and memory utilization.", "Hardware Status", ["pa-cpu-usage", "pa-memory-usage"], 3),
  command("pa-resource-monitor", "show running resource-monitor minute last 1", "Collect the last-minute resource monitor output.", "Hardware Status", ["pa-cpu-usage"], 3),
  command("pa-interface-all", "show interface all", "Review interface link status and inactive ports.", "Hardware Status", ["pa-port-monitoring"], 5),
  command("pa-power-supplies", "show system environmentals power", "Review power supply status and alarms.", "Hardware Status", ["pa-power-supply"], 6),
  command("pa-support-info", "request support info", "Review hardware support contract status and expiry.", "Product Licensing", ["pa-hardware-support"], 8),
  command("pa-license-info", "request license info", "Review installed feature licenses and expiry dates.", "Product Licensing", ["pa-feature-license"], 9),
  command("pa-system-info", "show system info", "Collect system uptime and installed PAN-OS version.", "System Status", ["pa-system-uptime", "pa-firmware-version"], 11),
  command("pa-preferred-software", "request system software info preferred", "Review preferred PAN-OS software information.", "System Status", ["pa-firmware-version"], 14),
  command("pa-clock", "show clock", "Collect the firewall date and time.", "Time Synchronization", ["pa-date-time"], 15),
  command("pa-ntp", "show ntp", "Review NTP configuration and synchronization.", "Time Synchronization", ["pa-date-time"], 15),
  command("pa-internet-ping", "ping host 8.8.8.8", "Engineer-controlled connectivity check; this command generates network traffic.", "Connectivity", ["pa-internet-access"], 16, {
    isReadOnly: false,
    engineerControlled: true,
    notes: "Run only with customer authorization. This command generates ICMP traffic.",
  }),
  command("pa-ha-status", "show high-availability all", "Review HA status, peer connectivity, and synchronization.", "High Availability", ["pa-high-availability"], 17),
  command("pa-system-log", "show log system severity greater-than-or-equal medium direction equal backward", "Review warning and critical system events from the past three months.", "Logging", ["pa-event-logging"], 18),
];
