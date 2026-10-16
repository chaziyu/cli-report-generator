import { VendorCommandDefinition } from "../types";

/**
 * Approved FortiGate CLI Commands for Preventive Maintenance (PM).
 *
 * Requirements:
 * - Read-only commands only (never modify firewall configuration).
 * - Stable command IDs.
 * - Map directly to CTC PM checklist items.
 * - One command can fulfill multiple checklist items (e.g. `get system performance status`
 *   provides CPU usage, Memory usage, and System uptime).
 */
export const FORTIGATE_COMMANDS: VendorCommandDefinition[] = [
  {
    id: "cmd-fg-sys-status",
    command: "get system status",
    description:
      "Retrieve system information, firmware version, serial number, hostname, operation mode, and license status.",
    group: "System",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Version",
      "Virus-DB",
      "Serial-Number",
      "License Status",
      "Hostname",
      "Operation Mode",
      "Current Virtual Domain",
    ],
    evidenceRequired: true,
    targetSection: "Product Life Cycle",
    targetAppendix: "Appendix 5 - Firmware Version",
    mappedCheckIds: ["fg-fw-version", "fg-mgmt-cli"],
    notes:
      "Primary command for verifying FortiOS release version, build number, and serial number.",
  },
  {
    id: "cmd-fg-sys-perf",
    command: "get system performance status",
    description:
      "Retrieve real-time CPU states, memory usage percentage, system uptime, and average concurrent sessions.",
    group: "Performance",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "CPU states (usr, sys, idle)",
      "Memory (used, total, free)",
      "Uptime",
      "Average sessions",
      "Virus / IPS sessions",
    ],
    evidenceRequired: true,
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 1 - CPU Usage & Appendix 2 - Memory Usage",
    mappedCheckIds: ["fg-hw-cpu", "fg-hw-mem", "fg-sys-uptime"],
    notes:
      "Key performance command. Fulfills CPU Usage (< 80%), Memory Usage (< 80%), and System Uptime in a single execution.",
  },
  {
    id: "cmd-fg-hw-disk",
    command: "fnsysctl df",
    description:
      "Display internal flash and hard disk partition filesystem utilization.",
    group: "Performance",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Filesystem",
      "1k-blocks",
      "Used",
      "Available",
      "Use %",
      "Mounted on",
    ],
    evidenceRequired: true,
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 1: Hard Disk Space (If equipped)",
    mappedCheckIds: ["fg-hw-disk"],
    notes:
      "If the firewall model has no hard disk (flash-only like 60F, 80F, 200F), report as N/A: 'Device is not equipped with hard disk'.",
  },
  {
    id: "cmd-fg-intf-phys",
    command: "get system interface physical",
    description:
      "Retrieve physical port link status, speed, duplex, in-use count, and interface transmission statistics.",
    group: "Interfaces",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Interface name",
      "Speed",
      "Duplex",
      "Link status (up/down)",
      "Tx/Rx packets",
      "Errors",
    ],
    evidenceRequired: true,
    targetSection: "Hardware Status",
    targetAppendix: "Appendix 3 - Interface",
    mappedCheckIds: ["fg-hw-interface"],
    notes:
      "Cross-checks active physical connections against customer firewall topology.",
  },
  {
    id: "cmd-fg-lic-contract",
    command: "diagnose test update info contract",
    description:
      "Query FortiCare registration and UTM service contracts (Antivirus, IPS, Web Filtering, Anti-Spam).",
    group: "Licensing",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "FortiCare Contract expiration date",
      "Contract status",
      "Antivirus license & expiry",
      "IPS license & expiry",
      "Web Filtering license & expiry",
      "Anti-Spam license & expiry",
    ],
    evidenceRequired: true,
    targetSection: "Product Licensing",
    targetAppendix: "Appendix 4 - License Info",
    mappedCheckIds: ["fg-lic-forticare", "fg-lic-utm"],
    notes:
      "Provides granular expiration dates for FortiCare 24x7 support and all individual UTM bundle features.",
  },
  {
    id: "cmd-fg-vpn-tunnel",
    command: "get vpn ipsec tunnel summary",
    description:
      "Display IPSec VPN tunnel summary including total tunnels, active (UP) and inactive (DOWN) tunnel count.",
    group: "VPN",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Total VPN Tunnel(s)",
      "Active VPN Tunnel(s)",
      "Inactive VPN Tunnel(s)",
      "Gateway selector status",
    ],
    evidenceRequired: true,
    targetSection: "VPN Status",
    targetAppendix: "Appendix 6 - VPN Tunnels",
    mappedCheckIds: ["fg-vpn-tunnel"],
    notes:
      "Captures active and standby IPSec site-to-site and dialup tunnels.",
  },
  {
    id: "cmd-fg-route-table",
    command: "get router info routing-table all",
    description:
      "Display complete routing table with active routes, gateway next-hops, interfaces, and protocol origins.",
    group: "Routing",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Destination subnet",
      "Gateway / next-hop IP",
      "Output interface",
      "Routing protocol codes (S, C, B, O)",
      "Administrative distance / Metric",
    ],
    evidenceRequired: true,
    targetSection: "Routing Status",
    targetAppendix: "Appendix 7 - Static Routes & Routing Table",
    mappedCheckIds: ["fg-net-routing"],
    notes:
      "Ensures the default gateway (0.0.0.0/0) and essential static/BGP routes are active and next-hops are reachable.",
  },
  {
    id: "cmd-fg-ha-status",
    command: "get system ha status",
    description:
      "Inspect High Availability cluster status, heartbeat health, synchronized members, and priority.",
    group: "HA",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "HA Mode (Standalone, Active-Passive, Active-Active)",
      "Cluster state",
      "Member serials and hostnames",
      "Sync status (in-sync / out-of-sync)",
      "Heartbeat interfaces",
    ],
    evidenceRequired: true,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 13 - HA Status",
    mappedCheckIds: ["fg-sys-ha"],
    notes:
      "For standalone firewalls, evaluate as N/A with remark: 'The firewall is a standalone firewall'. For clusters, ensure in-sync.",
  },
  {
    id: "cmd-fg-autoupdate-ver",
    command: "diagnose autoupdate versions",
    description:
      "Display security signatures and engine versions for AV, IPS, Application Control, and Industrial database.",
    group: "Updates",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "AV Engine & Definitions version",
      "IPS Engine & Definitions version",
      "Attack Definitions",
      "Malicious URL database",
      "Last updated timestamp",
    ],
    evidenceRequired: true,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 11 - Signatures",
    mappedCheckIds: ["fg-sec-signatures"],
    notes:
      "Verifies that signature packages are receiving automated updates from FortiGuard.",
  },
  {
    id: "cmd-fg-ntp-status",
    command: "diagnose sys ntp status",
    description:
      "Check NTP synchronization status, active NTP server, stratum, offset, jitter, and reachability.",
    group: "NTP",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "NTP Server IP/FQDN",
      "Stratum",
      "Synchronization state (synchronized/unsynchronized)",
      "Offset",
      "Delay",
      "Jitter",
      "Polling interval",
    ],
    evidenceRequired: true,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 12 - NTP Status",
    mappedCheckIds: ["fg-sys-ntp"],
    notes:
      "Assess synchronization state, not merely configured server addresses. CTC standard timezone is GMT +8 (Asia/Kuala Lumpur).",
  },
  {
    id: "cmd-fg-ping-internet",
    command: "execute ping 8.8.8.8",
    description:
      "Diagnostic ICMP ping test to verify outbound internet reachability and packet loss.",
    group: "Connectivity",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Packets transmitted",
      "Packets received",
      "Packet loss percentage",
      "Round-trip time (min/avg/max)",
    ],
    evidenceRequired: true,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 10 - Internet Access / Ping",
    mappedCheckIds: ["fg-net-connectivity"],
    notes:
      "Validates firewall egress reachability with 0% packet loss.",
  },
  {
    id: "cmd-fg-faz-test",
    command: "execute log fortianalyzer test-connectivity",
    description:
      "Test connectivity to configured FortiAnalyzer log manager including registration and SSL handshake.",
    group: "Logging",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "FortiAnalyzer server IP",
      "Connection status (connected/unreachable)",
      "SSL handshake verification",
      "Registration state",
    ],
    evidenceRequired: true,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 15 - Log Manager Setting",
    mappedCheckIds: ["fg-sys-faz"],
    notes:
      "Confirms real-time log forwarding to central FortiAnalyzer / FortiCloud.",
  },
  {
    id: "cmd-fg-log-display",
    command: "execute log display",
    description:
      "Display recent system event log entries to check for critical hardware or operational warnings.",
    group: "Logging",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Log timestamp",
      "Event log category",
      "Log level (critical/warning/error)",
      "Log message",
    ],
    evidenceRequired: true,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 14 - Event Log",
    mappedCheckIds: ["fg-sys-log"],
    notes:
      "Used to evaluate whether critical errors or system crashes have occurred in the last 3 months.",
  },
  {
    id: "cmd-fg-admin-status",
    command: "get system admin status",
    description:
      "View currently connected administrative sessions, protocols, and access origins.",
    group: "System",
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [
      "Administrator username",
      "Connection type (GUI/SSH)",
      "Source IP address",
      "Login time",
    ],
    evidenceRequired: false,
    targetSection: "Configuration & HA",
    targetAppendix: "Appendix 10 - Management Access",
    mappedCheckIds: ["fg-mgmt-cli"],
    notes: "Confirms active management session and security compliance.",
  },
];

/**
 * Returns a FortiGate command definition by its stable ID.
 */
export function getFortiGateCommandById(id: string): VendorCommandDefinition | undefined {
  return FORTIGATE_COMMANDS.find((cmd) => cmd.id === id);
}

/**
 * Returns all FortiGate commands belonging to a specific group.
 */
export function getFortiGateCommandsByGroup(group: string): VendorCommandDefinition[] {
  return FORTIGATE_COMMANDS.filter(
    (cmd) => cmd.group.toLowerCase() === group.toLowerCase()
  );
}

/**
 * Generates an engineer-ready copyable PuTTY collection script.
 * Includes terminal guidance, pagination suspension (`config system console -> set output standard`),
 * and section comments.
 */
export function generateFortiGateCollectionScript(
  commands: VendorCommandDefinition[] = FORTIGATE_COMMANDS
): string {
  const lines: string[] = [
    "# ====================================================================",
    "# CTC Global - FortiGate Preventive Maintenance (PM) CLI Collector",
    "# Customer authenticated session. Read-only commands only.",
    "# PuTTY Settings: Session > Logging > 'All session output' checked",
    "# ====================================================================",
    "",
    "# 1. Temporarily disable terminal pagination so all outputs flow cleanly:",
    "config system console",
    "  set output standard",
    "end",
    "",
  ];

  const grouped = new Map<string, VendorCommandDefinition[]>();
  for (const cmd of commands) {
    if (!grouped.has(cmd.group)) {
      grouped.set(cmd.group, []);
    }
    grouped.get(cmd.group)!.push(cmd);
  }

  for (const [group, cmds] of grouped.entries()) {
    lines.push(`# --- Group: ${group} ---`);
    for (const cmd of cmds) {
      lines.push(`${cmd.command}`);
    }
    lines.push("");
  }

  lines.push("# 2. Restore default pagination if desired (optional):");
  lines.push("config system console");
  lines.push("  set output more");
  lines.push("end");
  lines.push("");
  lines.push("# End of PM Collection Script");

  return lines.join("\n");
}
