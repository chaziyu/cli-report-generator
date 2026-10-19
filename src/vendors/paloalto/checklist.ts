import { VendorCheckItemDefinition } from "../types";

const guide = (section: string, tableRow: number) => ({
  document: "Palo Alto Preventive Maintenance.docx",
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

export const PALOALTO_CHECKLIST: VendorCheckItemDefinition[] = [
  item("pa-disk-space", "Hard Disk Space", "Verify disk usage is below 90%.", "Hardware Status", ["pa-disk-space"], "CLI", 2, "PASS below 90%; FAIL at 90% or above; otherwise REVIEW.", "Appendix 1 – System Disk Space", "1.1"),
  item("pa-cpu-usage", "CPU Usage", "Verify CPU usage is below 80%.", "Hardware Status", ["pa-system-resources", "pa-resource-monitor"], "CLI", 3, "PASS only when both listed commands yield reliable CPU values below 80%; FAIL at 80% or above; otherwise REVIEW.", "Appendix 2 – CPU Utilization", "1.2"),
  item("pa-memory-usage", "Memory Usage", "Verify memory usage is below 90%.", "Hardware Status", ["pa-system-resources"], "CLI", 4, "PASS below 90%; FAIL at 90% or above; otherwise REVIEW.", "Appendix 3 – Memory Utilization", "1.3"),
  item("pa-port-monitoring", "Firewall Port Monitoring", "Check interface link status and identify inactive ports.", "Hardware Status", ["pa-interface-all"], "CLI", 5, "Engineer review; the guide does not define which inactive ports are expected.", "Appendix 4 – Firewall Interfaces", "1.4"),
  item("pa-power-supply", "Redundant Power Supply", "Check power supply status and alarms.", "Hardware Status", ["pa-power-supplies"], "CLI", 6, "Engineer review of all installed supplies and alarms.", "Appendix 5 – Power Supply", "1.5"),
  item("pa-hardware-support", "Hardware Support", "Verify support contract validity and expiry date.", "Product Licensing", ["pa-support-info"], "CLI", 8, "Engineer review of contract state and expiry; no expiry warning window is specified.", "Appendix 6 – Hardware Support", "2.1"),
  item("pa-feature-license", "Feature License", "Verify installed feature licenses and expiry dates.", "Product Licensing", ["pa-license-info"], "CLI", 9, "Engineer review of applicable features and expiry dates.", "Appendix 7 – Feature License", "2.2"),
  item("pa-system-uptime", "Firewall System Uptime", "Check firewall uptime and last restart information.", "System Status", ["pa-system-info"], "CLI", 11, "Engineer review; the guide gives no uptime threshold.", "Appendix 8 – Uptime", "3.1"),
  item("pa-gui-access", "GUI Accessibility", "Verify successful login through the web browser.", "Management Access", [], "GUI_MANUAL", 12, "Require engineer confirmation and a mapped GUI dashboard screenshot.", "Appendix 9 – GUI Interface", "3.2", "Log in using the customer's browser session and attach a dashboard screenshot."),
  item("pa-ssh-access", "CLI/SSH Accessibility", "Verify successful SSH login to the firewall.", "Management Access", [], "GUI_MANUAL", 13, "Require engineer confirmation and a mapped PuTTY SSH session screenshot.", "Appendix 10 – CLI Interface", "3.3", "Confirm SSH access in PuTTY and attach a screenshot showing the session."),
  item("pa-firmware-version", "Firewall Firmware Version", "Check installed PAN-OS version.", "System Status", ["pa-system-info", "pa-preferred-software"], "CLI", 14, "Record the installed and preferred versions; lifecycle status requires an external approved reference.", "Appendix 11 – Software Version", "3.4"),
  item("pa-date-time", "Firewall Date & Time", "Verify system date, GMT+8 timezone and NTP synchronization.", "Time Synchronization", ["pa-clock", "pa-ntp"], "CLI", 15, "Engineer review of date, GMT+8 timezone, and synchronization evidence.", "Appendix 12 – NTP status", "3.5"),
  item("pa-internet-access", "Firewall Internet Access", "Verify internet connectivity from the firewall.", "Connectivity", ["pa-internet-ping"], "CLI", 16, "Engineer-controlled command; review observed result and customer authorization.", "Appendix 13 – Internet Connection", "3.6"),
  item("pa-high-availability", "High Availability (if any)", "Verify HA status, peer connectivity and synchronization.", "High Availability", ["pa-ha-status"], "CLI", 17, "Confirm whether HA applies; engineer review of actual peers and synchronization.", "Appendix 14 – High Availability", "3.7"),
  item("pa-event-logging", "Event Logging", "Review warning and critical system events from the past 3 months.", "Logging", ["pa-system-log"], "CLI", 18, "Engineer review of event content and time range.", "Appendix 15 – Event Logging", "3.8"),
  item("pa-config-backup", "Backup Configurations", "Verify successful configuration export and download.", "Configuration Backup", [], "GUI_MANUAL", 19, "Require engineer confirmation of export/download and mapped screenshot.", "Appendix 16 – Backup Configuration", "3.9", "Export and download through the PAN-OS GUI; attach evidence of the completed operation."),
];
