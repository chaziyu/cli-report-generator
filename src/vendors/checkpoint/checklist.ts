import { VendorCheckItemDefinition } from "../types";

const guide = (section: string, tableRow: number) => ({
  document: "Check Point 7000M Preventive Maintenance.docx",
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

export const CHECKPOINT_CHECKLIST: VendorCheckItemDefinition[] = [
  item("cp-os-version", "OS / Firmware Version", "Check installed Gaia version and build.", "System", ["cp-os-version"], "CLI", 2, "Engineer review of version and build."),
  item("cp-hotfix-take", "Hotfix / Patch Take", "Check installed Jumbo Hotfix Take and patches.", "System", ["cp-hotfix-take"], "CLI", 3, "Engineer review; verify command execution context."),
  item("cp-system-uptime", "System Uptime", "Check system uptime.", "System", ["cp-uptime"], "CLI", 4, "Engineer review; the guide defines no uptime threshold."),
  item("cp-cpu-usage", "CPU Usage", "Check CPU utilization against the approved threshold.", "Performance", ["cp-cpu"], "CLI", 6, "CTC/customer-approved CPU threshold is not supplied; engineer review is mandatory."),
  item("cp-memory-usage", "Memory Usage", "Check memory utilization is below 80%.", "Performance", ["cp-memory"], "CLI", 7, "PASS only below 80% when the command output is reliable and the required CLI context is confirmed; FAIL at 80% or above under the same conditions."),
  item("cp-disk-space", "Disk Space", "Check disk usage against approved thresholds.", "Storage", ["cp-disk-usage", "cp-lvm-overview"], "CLI", 8, "No disk threshold is supplied; engineer review is mandatory."),
  item("cp-hardware-health", "Hardware Health", "Check sensors, temperatures, fans and power supplies.", "Hardware Status", ["cp-hardware-health"], "CLI", 9, "Engineer review against model-specific health criteria."),
  item("cp-interface-monitoring", "Interface Monitoring", "Check interface link status and ports in use.", "Hardware Status", ["cp-interfaces"], "CLI", 10, "Engineer review against the expected firewall topology."),
  item("cp-license-information", "License Information", "Check installed licenses, enabled features and expiration dates.", "Licensing", ["cp-licenses"], "CLI", 12, "Engineer review of applicable features and expiry dates; verify command context."),
  item("cp-gui-access", "GUI Accessibility", "Verify successful Gaia dashboard login.", "Management Access", [], "GUI_MANUAL", 14, "Require engineer confirmation and a mapped GUI screenshot.", "Log in through the Gaia Portal and attach a dashboard screenshot."),
  item("cp-ssh-access", "SSH Accessibility", "Verify successful SSH login.", "Management Access", [], "GUI_MANUAL", 15, "Require engineer confirmation and a mapped PuTTY screenshot.", "Confirm SSH access in PuTTY and attach a session screenshot."),
  item("cp-date-time", "Date & Time", "Verify system date, time and GMT+8 timezone.", "Time Synchronization", ["cp-clock", "cp-timezone"], "CLI", 16, "Engineer review of system time and GMT+8 timezone."),
  item("cp-ntp-synchronization", "NTP Synchronization", "Check NTP server configuration and synchronization.", "Time Synchronization", ["cp-ntp-active", "cp-ntp-current"], "CLI", 17, "Engineer review of the active server and synchronization state."),
  item("cp-dns-configuration", "DNS Configuration", "Check configured DNS servers.", "Network", ["cp-dns"], "CLI", 18, "Engineer review of configured DNS servers."),
  item("cp-routing-table", "Routing Table", "Check configured routes and next hops.", "Network", ["cp-routes"], "CLI", 19, "Engineer review against the approved network design."),
  item("cp-local-log-storage", "Local Log Storage", "Check /var/log disk utilization.", "Logging", ["cp-disk-usage"], "CLI", 21, "No log-storage threshold is supplied; engineer review is mandatory."),
  item("cp-log-switch-configuration", "Log Switch Configuration", "Verify log rotation, alert and deletion settings.", "Logging", [], "GUI_MANUAL", 22, "Require management-side evidence and engineer confirmation.", "Verify rotation, alert, and deletion settings on the management side."),
  item("cp-cluster-status", "Cluster Status (if any)", "Verify cluster members are active/standby as expected.", "Clustering", ["cp-cluster-state"], "CLI", 23, "Confirm whether clustering applies; engineer review of actual member state."),
  item("cp-ha-synchronization", "HA Synchronization (if any)", "Check cluster synchronization statistics.", "Clustering", ["cp-cluster-sync"], "CLI", 24, "Confirm whether clustering applies; engineer review of synchronization statistics."),
  item("cp-watchdog-processes", "WatchDog Processes", "Verify monitored processes are running.", "System Health", ["cp-watchdog"], "CLI", 26, "Engineer review of monitored processes and execution context."),
  item("cp-vsx-status", "VSX Virtual System Status (if any)", "Check virtual systems and their operational status.", "VSX", ["cp-vsx-systems"], "CLI", 27, "Confirm whether VSX applies; engineer review of all virtual systems."),
  item("cp-vsx-load-sharing", "VSX Load Sharing (if any)", "Check cluster states and virtual-system distribution.", "VSX", ["cp-cluster-state"], "CLI", 28, "The guide labels the listed command as partial evidence; engineer review and additional approved evidence are required."),
  item("cp-concurrent-connections", "Concurrent Connections", "Check firewall connection statistics and capacity.", "Performance", ["cp-connections"], "CLI", 29, "No capacity threshold is supplied; verify the required Expert/Clish context and review manually."),
  item("cp-config-backup", "Backup Configuration", "Verify successful backup and downloaded file.", "Configuration Backup", [], "GUI_MANUAL", 31, "Require engineer confirmation of backup/export and mapped screenshot.", "Export through the Gaia GUI and attach evidence of the downloaded file."),
];
