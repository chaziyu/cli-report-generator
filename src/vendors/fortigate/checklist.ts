import { VendorCheckItemDefinition } from "../types";
import { FORTIGATE_COMMANDS } from "./commands";

/**
 * Standard CTC Global FortiGate PM Checklist Definitions (QMS-P09-F01 v1.1).
 *
 * Covers all 6 standard report sections and 16 appendices:
 * 1. Hardware Status (Disk, CPU, Memory, Interfaces)
 * 2. Product Licensing (FortiCare Support, UTM Bundle)
 * 3. Product Life Cycle (Firmware Version, FFR, EOS)
 * 4. VPN Status (IPSec / SSL VPN Tunnels)
 * 5. Routing Status (Routing Table, Next Hop Reachability)
 * 6. Configuration & HA (Uptime, GUI, CLI, Signatures, NTP, Internet, HA, Logging, Log Manager, Backup)
 */
export const FORTIGATE_CHECKLIST: VendorCheckItemDefinition[] = [
  // ==========================================
  // Section 1: Hardware Status
  // ==========================================
  {
    id: "fg-hw-disk",
    itemNumber: "1.1",
    taskName: "Hard disk space (If any)",
    description:
      "Hard disk space should not be more than 80%. If device has no physical log disk, mark as N/A.",
    group: "Hardware Status",
    commands: ["cmd-fg-hw-disk"],
    sourceType: "CLI",
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 1: Hard Disk Space (If equipped)",
    thresholdDescription: "Disk usage < 80%",
    expectedStatusOptions: ["Healthy", "Unhealthy", "N/A"],
    collectionInstructions:
      "Run 'fnsysctl df'. If disk space is utilized above 80%, flag as Unhealthy. If the FortiGate model has flash memory only (e.g. 60F, 80F, 200F without log disk), evaluate as N/A with note: 'Device is not equipped with hard disk'.",
  },
  {
    id: "fg-hw-cpu",
    itemNumber: "1.2",
    taskName: "CPU Usage",
    description: "CPU should within average below 80% for the past 1 hour.",
    group: "Hardware Status",
    commands: ["cmd-fg-sys-perf"],
    sourceType: "CLI",
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 1 - CPU Usage",
    thresholdDescription: "Average CPU usage < 80%",
    expectedStatusOptions: ["Healthy", "Unhealthy", "N/A"],
    collectionInstructions:
      "Run 'get system performance status'. Check CPU percentage states (usr + sys). If sustained above 80%, recommend process investigation.",
  },
  {
    id: "fg-hw-mem",
    itemNumber: "1.3",
    taskName: "Memory Usage",
    description: "Memory should keep below 80% for the past 1 hour.",
    group: "Hardware Status",
    commands: ["cmd-fg-sys-perf"],
    sourceType: "CLI",
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 2 - Memory Usage",
    thresholdDescription: "Memory usage < 80%",
    expectedStatusOptions: ["Healthy", "Unhealthy", "N/A"],
    collectionInstructions:
      "Run 'get system performance status'. Extract Memory usage percentage. If utilization exceeds 80% (or conserve mode is triggered), flag as Unhealthy.",
  },
  {
    id: "fg-hw-interface",
    itemNumber: "1.4",
    taskName: "Interface Monitoring",
    description:
      "Physical Connection to be cross check with the Firewall interface.",
    group: "Hardware Status",
    commands: ["cmd-fg-intf-phys"],
    sourceType: "CLI",
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 3 - Interface",
    thresholdDescription: "Physical port status Up, no CRC errors/collisions",
    expectedStatusOptions: ["Healthy", "Unhealthy", "N/A"],
    collectionInstructions:
      "Run 'get system interface physical'. Confirm active ports match customer cabling diagram and record total ports in-use.",
  },

  // ==========================================
  // Section 2: Product Licensing
  // ==========================================
  {
    id: "fg-lic-forticare",
    itemNumber: "2.1",
    taskName: "FortiCare Support",
    description:
      "Check the License Validity and Contract Expiration Date.",
    group: "Product Licensing",
    commands: ["cmd-fg-lic-contract"],
    sourceType: "CLI",
    targetSection: "Product Licensing",
    targetAppendix: "Appendix 4 - License Info",
    thresholdDescription: "Support contract is active and not expired",
    expectedStatusOptions: ["Valid", "Expired", "N/A"],
    collectionInstructions:
      "Run 'diagnose test update info contract'. Verify FortiCare 24x7 / ASE contract expiration date. If contract expires within 30 days, raise warning.",
  },
  {
    id: "fg-lic-utm",
    itemNumber: "2.2",
    taskName: "UTM Bundle Update: Antivirus IPS Web Filtering Anti-Spam Etc.",
    description:
      "Check AV, IPS, Web Filtering, Anti-Spam and other UTM feature contract validity.",
    group: "Product Licensing",
    commands: ["cmd-fg-lic-contract"],
    sourceType: "CLI",
    targetSection: "Product Licensing",
    targetAppendix: "Appendix 4 - License Info",
    thresholdDescription:
      "All subscribed security features (AV, IPS, Web, Spam) are Valid",
    expectedStatusOptions: ["Valid", "Expired", "N/A"],
    collectionInstructions:
      "Inspect individual contract lines for Antivirus, IPS, Web Filtering, and Anti-Spam in the contract diagnostics output.",
  },

  // ==========================================
  // Section 3: Product Life Cycle
  // ==========================================
  {
    id: "fg-fw-version",
    itemNumber: "3.1",
    taskName: "Firewall Firmware Version",
    description:
      "Check the Firewall firmware version against recommended vendor releases.",
    group: "Product Life Cycle",
    commands: ["cmd-fg-sys-status"],
    sourceType: "CLI",
    targetSection: "Product Life Cycle",
    targetAppendix: "Appendix 5 - Firmware Version",
    thresholdDescription: "Running recommended mature FortiOS release",
    expectedStatusOptions: ["Up-to-Date", "Out-of-Date", "N/A"],
    collectionInstructions:
      "Run 'get system status' to record FortiOS version and build. Cross-check against CTC approved mature firmware list.",
  },
  {
    id: "fg-life-ffr",
    itemNumber: "3.2",
    taskName: "Final Firmware Release (FFR)",
    description:
      "The last release of firmware operationally supported on a specific hardware product. FFR firmware is in a must-fix support phase until the EOS date.",
    group: "Product Life Cycle",
    commands: [],
    sourceType: "EXTERNAL_REFERENCE",
    targetSection: "Product Life Cycle",
    thresholdDescription: "FFR release designated or pending from vendor",
    expectedStatusOptions: ["Valid", "Expired", "N/A"],
    collectionInstructions:
      "Check Fortinet Product Life Cycle portal (support.fortinet.com/Information/ProductLifeCycle.aspx) for this hardware model.",
  },
  {
    id: "fg-life-eos",
    itemNumber: "3.3",
    taskName: "End of Support Date (EOS)",
    description:
      "The final milestone in the product lifecycle is the End of Support date (hardware EOS typically 60 months after End of Order).",
    group: "Product Life Cycle",
    commands: [],
    sourceType: "EXTERNAL_REFERENCE",
    targetSection: "Product Life Cycle",
    thresholdDescription: "Hardware EOS date is in the future",
    expectedStatusOptions: ["Valid", "Expired", "N/A"],
    collectionInstructions:
      "Lookup model lifecycle on Fortinet Support portal or endoflife.date/fortios. Record official EOS date in report.",
  },

  // ==========================================
  // Section 4: VPN Status
  // ==========================================
  {
    id: "fg-vpn-tunnel",
    itemNumber: "4.1",
    taskName: "Check Number Of tunnel",
    description:
      "To check total number of VPN Tunnel(s). Along with the number of active and inactive VPN tunnel(s).",
    group: "VPN Status",
    commands: ["cmd-fg-vpn-tunnel"],
    sourceType: "CLI",
    targetSection: "VPN Status",
    targetAppendix: "Appendix 6 - VPN Tunnels",
    thresholdDescription:
      "All required customer IPsec tunnels are in Active (UP) state",
    expectedStatusOptions: ["Healthy", "Unhealthy", "N/A"],
    collectionInstructions:
      "Run 'get vpn ipsec tunnel summary'. Count total tunnels, active tunnels, and inactive tunnels. If customer does not use VPN, mark N/A.",
  },

  // ==========================================
  // Section 5: Routing Status
  // ==========================================
  {
    id: "fg-net-routing",
    itemNumber: "5.1",
    taskName: "Firewall Routing Table",
    description:
      "To capture the Routing Table Information and ensure the next hop reachable.",
    group: "Routing Status",
    commands: ["cmd-fg-route-table"],
    sourceType: "CLI",
    targetSection: "Routing Status",
    targetAppendix: "Appendix 7 - Static Routes & Routing Table",
    thresholdDescription:
      "Default gateway and essential static/BGP routes active and valid",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "Run 'get router info routing-table all'. Ensure active default gateway route (0.0.0.0/0) exists and expected internal subnets are routed.",
  },

  // ==========================================
  // Section 6: Configuration & HA
  // ==========================================
  {
    id: "fg-sys-uptime",
    itemNumber: "6.1",
    taskName: "Firewall System Uptime",
    description: "Firewall system uptime and stability verification.",
    group: "Configuration & HA",
    commands: ["cmd-fg-sys-perf"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 8 - Firewall System Uptime",
    thresholdDescription: "Stable uptime with no unexpected recent reboots",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "Extract uptime string from 'get system performance status'. Verify that no unexpected power outage or kernel crash occurred recently.",
  },
  {
    id: "fg-mgmt-gui",
    itemNumber: "6.2",
    taskName: "Accessibility of FortiGate via GUI",
    description: "Check the accessibility of the firewall via web browser HTTPS.",
    group: "Configuration & HA",
    commands: [],
    sourceType: "GUI_MANUAL",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 9 - Web GUI Access",
    thresholdDescription: "Web GUI loads cleanly over HTTPS on management port",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "Open management IP in browser. Verify login page renders without timeout or SSL negotiation failure.",
  },
  {
    id: "fg-mgmt-cli",
    itemNumber: "6.3",
    taskName: "Accessibility of FortiGate via CLI",
    description: "Check the accessibility of the firewall via SSH.",
    group: "Configuration & HA",
    commands: ["cmd-fg-sys-status"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 10 - CLI Access (SSH)",
    thresholdDescription: "SSH connection succeeds with authorized credentials",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "SSH into firewall. Successful command prompt response validates CLI accessibility.",
  },
  {
    id: "fg-sec-signatures",
    itemNumber: "6.4",
    taskName: "Signatures version",
    description: "Check the security signatures version and update status.",
    group: "Configuration & HA",
    commands: ["cmd-fg-autoupdate-ver"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 11 - Signatures",
    thresholdDescription: "Antivirus, IPS, and App Control signatures Up-to-Date",
    expectedStatusOptions: ["Up-to-Date", "Out-of-Date", "N/A"],
    collectionInstructions:
      "Run 'diagnose autoupdate versions'. Verify that AV, IPS, and Attack Definition versions have been refreshed recently.",
  },
  {
    id: "fg-sys-ntp",
    itemNumber: "6.5",
    taskName: "Firewall Date & Time",
    description:
      "Date and time should be sync with NTP Server and correct for reviewing logs. Time zone should select or set as GMT +8 or Asia/Kuala Lumpur.",
    group: "Configuration & HA",
    commands: ["cmd-fg-ntp-status"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 12 - NTP Status",
    thresholdDescription: "NTP state is synchronized, timezone is GMT +8",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "Run 'diagnose sys ntp status'. Confirm synchronization state is active with valid upstream NTP server (FortiGuard NTP or customer NTP).",
  },
  {
    id: "fg-net-connectivity",
    itemNumber: "6.6",
    taskName: "Firewall Internet Access",
    description: "Check the internet connection for the Firewall (ping 8.8.8.8).",
    group: "Configuration & HA",
    commands: ["cmd-fg-ping-internet"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 10 / Appendix 13 - Internet Access",
    thresholdDescription: "Outbound ping has 0% packet loss",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "Run 'execute ping 8.8.8.8'. Verify 5 packets transmitted with 0% packet loss and low latency.",
  },
  {
    id: "fg-sys-ha",
    itemNumber: "6.7",
    taskName: "High Availability (if any)",
    description: "Check the status of the HA cluster.",
    group: "Configuration & HA",
    commands: ["cmd-fg-ha-status"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 13 - HA Status",
    thresholdDescription:
      "HA cluster members in-sync (or Standalone firewall marked N/A)",
    expectedStatusOptions: ["Pass", "Failed", "N/A"],
    collectionInstructions:
      "Run 'get system ha status'. If unit is standalone, mark as N/A with remark: 'The firewall is a standalone firewall'. For HA clusters, verify heartbeat status and sync status.",
  },
  {
    id: "fg-sys-log",
    itemNumber: "6.8",
    taskName: "Logging (Event Log)",
    description:
      "Check the logging for any critical error / warning within the past 3 months.",
    group: "Configuration & HA",
    commands: ["cmd-fg-log-display"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 14 - Event Log",
    thresholdDescription: "Logging operational, no unacknowledged critical errors",
    expectedStatusOptions: ["Available", "Unavailable", "N/A"],
    collectionInstructions:
      "Run 'execute log display'. Check for persistent hardware errors, conserve mode triggers, or link flapping.",
  },
  {
    id: "fg-sys-faz",
    itemNumber: "6.9",
    taskName: "Log Manager (if any)",
    description:
      "Check the connectivity of the FortiGate to FortiAnalyzer / FortiCloud.",
    group: "Configuration & HA",
    commands: ["cmd-fg-faz-test"],
    sourceType: "CLI",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 15 - Log Manager Setting",
    thresholdDescription:
      "Connection to FortiAnalyzer or FortiCloud is Healthy (or N/A if unconfigured)",
    expectedStatusOptions: ["Healthy", "Unhealthy", "N/A"],
    collectionInstructions:
      "Run 'execute log fortianalyzer test-connectivity'. If FortiAnalyzer is in use, verify connectivity status and TLS handshake.",
  },
  {
    id: "fg-sys-backup",
    itemNumber: "6.10",
    taskName: "Backup Configurations",
    description: "Check the backup function for the configuration.",
    group: "Configuration & HA",
    commands: [],
    sourceType: "GUI_MANUAL",
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 16 - Backup Configuration",
    thresholdDescription:
      "Current configuration (.conf) successfully downloaded and backed up",
    expectedStatusOptions: ["Passed", "Failed"],
    collectionInstructions:
      "Download current configuration file from System > Maintenance > Backup or CLI 'show full-configuration' and archive with the PM deliverables.",
  },
];

/**
 * Returns a FortiGate checklist item by its stable ID.
 */
export function getFortiGateCheckItemById(id: string): VendorCheckItemDefinition | undefined {
  return FORTIGATE_CHECKLIST.find((item) => item.id === id);
}

/**
 * Returns all checklist items that depend on a given command ID.
 */
export function getChecklistItemsForCommand(commandId: string): VendorCheckItemDefinition[] {
  return FORTIGATE_CHECKLIST.filter((item) => item.commands.includes(commandId));
}

/**
 * Validation function ensuring mapping integrity between commands and checklist items.
 */
export function validateFortiGateMapping(): {
  isValid: boolean;
  errors: string[];
  commandCount: number;
  checkItemCount: number;
  cliCheckCount: number;
} {
  const errors: string[] = [];
  const commandIdSet = new Set(FORTIGATE_COMMANDS.map((c) => c.id));
  const checkIdSet = new Set(FORTIGATE_CHECKLIST.map((i) => i.id));

  // 1. Verify all CLI checks map to existing command IDs
  for (const item of FORTIGATE_CHECKLIST) {
    if (item.sourceType === "CLI") {
      if (item.commands.length === 0) {
        errors.push(`CLI check "${item.id}" (${item.taskName}) has no mapped commands.`);
      }
      for (const cmdId of item.commands) {
        if (!commandIdSet.has(cmdId)) {
          errors.push(
            `Check "${item.id}" references non-existent command ID "${cmdId}".`
          );
        }
      }
    }
  }

  // 2. Verify all command mappedCheckIds reference existing checklist IDs
  for (const cmd of FORTIGATE_COMMANDS) {
    if (cmd.mappedCheckIds) {
      for (const checkId of cmd.mappedCheckIds) {
        if (!checkIdSet.has(checkId)) {
          errors.push(
            `Command "${cmd.id}" references non-existent check ID "${checkId}".`
          );
        }
      }
    }
  }

  const cliCheckCount = FORTIGATE_CHECKLIST.filter((i) => i.sourceType === "CLI").length;

  return {
    isValid: errors.length === 0,
    errors,
    commandCount: FORTIGATE_COMMANDS.length,
    checkItemCount: FORTIGATE_CHECKLIST.length,
    cliCheckCount,
  };
}
