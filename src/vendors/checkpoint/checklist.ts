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

export const CHECKPOINT_CHECKLIST: VendorCheckItemDefinition[] = [
  item("cp-os-version", "OS / Firmware Version", "Check installed Gaia version and build.", "System", ["cp-os-version"], "CLI", 2, "Engineer review of version and build.", "Appendix 1 – Version Checking", "1.1"),
  item("cp-hotfix-take", "Hotfix / Patch Take", "Check installed Jumbo Hotfix Take and patches.", "System", ["cp-hotfix-take"], "CLI", 3, "Engineer review; verify command execution context.", "Appendix 2 – Hotfix Take", "1.2"),
  item("cp-system-uptime", "System Uptime", "Check system uptime.", "System", ["cp-uptime"], "CLI", 4, "Engineer review; the guide defines no uptime threshold.", "Appendix 3 – System Uptime", "1.3"),
  item("cp-cpu-usage", "CPU Usage", "Check CPU utilization against the approved threshold.", "Performance", ["cp-cpu"], "CLI", 6, "CTC/customer-approved CPU threshold is not supplied; engineer review is mandatory.", "Appendix 4 – CPU Utilization", "2.1"),
  item("cp-memory-usage", "Memory Usage", "Check memory utilization is below 80%.", "Performance", ["cp-memory"], "CLI", 7, "PASS only below 80% when the command output is reliable and the required CLI context is confirmed; FAIL at 80% or above under the same conditions.", "Appendix 5 – Memory Utilization", "2.2"),
  item("cp-disk-space", "Disk Space", "Check disk usage against approved thresholds.", "Storage", ["cp-disk-usage", "cp-lvm-overview"], "CLI", 8, "No disk threshold is supplied; engineer review is mandatory.", "Appendix 6 – Disk Usage", "3.1"),
  item("cp-hardware-health", "Hardware Health", "Check sensors, temperatures, fans and power supplies.", "Hardware Status", ["cp-hardware-health"], "CLI", 9, "Engineer review against model-specific health criteria.", "Appendix 7 – Hardware Health", "4.1"),
  item("cp-interface-monitoring", "Interface Monitoring", "Check interface link status and ports in use.", "Hardware Status", ["cp-interfaces"], "CLI", 10, "Engineer review against the expected firewall topology.", "Appendix 8 – Interface Monitoring", "4.2"),
  item("cp-license-information", "License Information", "Check installed licenses, enabled features and expiration dates.", "Licensing", ["cp-licenses"], "CLI", 12, "Engineer review of applicable features and expiry dates; verify command context.", "Appendix 9 – License Information", "5.1"),
  item("cp-gui-access", "GUI Accessibility", "Verify successful Gaia dashboard login.", "Management Access", [], "GUI_MANUAL", 14, "Require engineer confirmation and a mapped GUI screenshot.", "Appendix 10 – GUI Accessibility", "6.1", "Log in through the Gaia Portal and attach a dashboard screenshot."),
  item("cp-ssh-access", "SSH Accessibility", "Verify successful SSH login.", "Management Access", [], "GUI_MANUAL", 15, "Require engineer confirmation and a mapped PuTTY screenshot.", "Appendix 11 – SSH Accessibility", "6.2", "Confirm SSH access in PuTTY and attach a session screenshot."),
  item("cp-date-time", "Date & Time", "Verify system date, time and GMT+8 timezone.", "Time Synchronization", ["cp-clock", "cp-timezone"], "CLI", 16, "Engineer review of system time and GMT+8 timezone.", "Appendix 12 – Date and Time", "7.1"),
  item("cp-ntp-synchronization", "NTP Synchronization", "Check NTP server configuration and synchronization.", "Time Synchronization", ["cp-ntp-active", "cp-ntp-current"], "CLI", 17, "Engineer review of the active server and synchronization state.", "Appendix 13 – NTP Synchronization", "7.2"),
  item("cp-dns-configuration", "DNS Configuration", "Check configured DNS servers.", "Network", ["cp-dns"], "CLI", 18, "Engineer review of configured DNS servers.", "Appendix 14 – DNS Configuration", "8.1"),
  item("cp-routing-table", "Routing Table", "Check configured routes and next hops.", "Network", ["cp-routes"], "CLI", 19, "Engineer review against the approved network design.", "Appendix 15 – Routing Table", "8.2"),
  item("cp-local-log-storage", "Local Log Storage", "Check /var/log disk utilization.", "Logging", ["cp-disk-usage"], "CLI", 21, "No log-storage threshold is supplied; engineer review is mandatory.", "Appendix 16 – Local Log Storage", "9.1"),
  item("cp-log-switch-configuration", "Log Switch Configuration", "Verify log rotation, alert and deletion settings.", "Logging", [], "GUI_MANUAL", 22, "Require management-side evidence and engineer confirmation.", "Appendix 17 – Log Switch Configuration", "9.2", "Verify rotation, alert, and deletion settings on the management side."),
  item("cp-cluster-status", "Cluster Status (if any)", "Verify cluster members are active/standby as expected.", "Clustering", ["cp-cluster-state"], "CLI", 23, "Confirm whether clustering applies; engineer review of actual member state.", "Appendix 18 – Cluster Status", "10.1"),
  item("cp-ha-synchronization", "HA Synchronization (if any)", "Check cluster synchronization statistics.", "Clustering", ["cp-cluster-sync"], "CLI", 24, "Confirm whether clustering applies; engineer review of synchronization statistics.", "Appendix 19 – HA Synchronization", "10.2"),
  item("cp-watchdog-processes", "WatchDog Processes", "Verify monitored processes are running.", "System Health", ["cp-watchdog"], "CLI", 26, "Engineer review of monitored processes and execution context.", "Appendix 20 – WatchDog Processes", "11.1"),
  item("cp-vsx-status", "VSX Virtual System Status (if any)", "Check virtual systems and their operational status.", "VSX", ["cp-vsx-systems"], "CLI", 27, "Confirm whether VSX applies; engineer review of all virtual systems.", "Appendix 21 – VSX Virtual Systems", "12.1"),
  item("cp-vsx-load-sharing", "VSX Load Sharing (if any)", "Check cluster states and virtual-system distribution.", "VSX", ["cp-cluster-state"], "CLI", 28, "The guide labels the listed command as partial evidence; engineer review and additional approved evidence are required.", "Appendix 22 – VSX Load Sharing", "12.2"),
  item("cp-concurrent-connections", "Concurrent Connections", "Check firewall connection statistics and capacity.", "Performance", ["cp-connections"], "CLI", 29, "No capacity threshold is supplied; verify the required Expert/Clish context and review manually.", "Appendix 23 – Concurrent Connections", "13.1"),
  item("cp-config-backup", "Backup Configuration", "Verify successful backup and downloaded file.", "Configuration Backup", [], "GUI_MANUAL", 31, "Require engineer confirmation of backup/export and mapped screenshot.", "Appendix 24 – Backup Configuration", "14.1", "Export through the Gaia GUI and attach evidence of the downloaded file."),
];
