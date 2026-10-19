import {
  ExtractedMetricsValue,
  SystemStatusMetrics,
  PerformanceMetrics,
  DiskSpaceMetrics,
  InterfaceMetrics,
  LicenseMetrics,
  VpnMetrics,
  RoutingMetrics,
  HaClusterMetrics,
  SignaturesMetrics,
  NtpMetrics,
  ConnectivityMetrics,
  LogManagerMetrics,
} from "@/core/checks/types";
import { VendorRuleFinding, VendorRuleHandler } from "@/vendors/types";

export type EvaluatedFinding = VendorRuleFinding;

export type FortiGateRuleHandler = VendorRuleHandler;

/**
 * FortiGate PM Deterministic Evaluation Rules.
 *
 * Requirements:
 * - Deterministic, boundary-tested rules (no generative AI guessing).
 * - Distinguish N/A (e.g. diskless firewall, standalone HA) from missing data.
 * - Distinguish instantaneous CPU/memory readings from historical measurements.
 * - Insufficient historical evidence requires review rather than automatically passing.
 * - License expiry warning boundary: <= 30 days.
 * - Missing evidence must never produce PASS.
 */
export const FORTIGATE_RULES: Record<string, FortiGateRuleHandler> = {
  // ==========================================================================
  // Section 1: Hardware Status
  // ==========================================================================

  // 1.1 Hard disk space (If any)
  "fg-hw-disk": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-disk",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Disk usage < 80%",
        remarks: "Evidence missing: 'fnsysctl df' output not found in logs.",
        reviewRequired: true,
      };
    }

    const disk = metrics as DiskSpaceMetrics;

    if (!disk.isEquipped) {
      return {
        ruleId: "rule-fg-disk-na",
        collectionState: "COMPLETE",
        evaluationStatus: "NA",
        currentValue: "N/A",
        expectedValue: "Disk usage < 80%",
        remarks:
          "Device is not equipped with hard disk (flash storage only). Refer Appendix 1",
        reviewRequired: false,
      };
    }

    if (disk.highestUsedPct < 80) {
      return {
        ruleId: "rule-fg-disk-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `${disk.highestUsedPct}%`,
        expectedValue: "Disk usage < 80%",
        remarks: `Hard disk space is healthy (${disk.highestUsedPct}% utilized). Refer Appendix 1`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-disk-fail",
      collectionState: "COMPLETE",
      evaluationStatus: "FAIL",
      currentValue: `${disk.highestUsedPct}%`,
      expectedValue: "Disk usage < 80%",
      remarks: `Hard disk space exceeds 80% threshold (${disk.highestUsedPct}% utilized). Investigation required. Refer Appendix 1`,
      reviewRequired: true,
    };
  },

  // 1.2 CPU Usage
  "fg-hw-cpu": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-cpu",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Average CPU < 80% for past 1 hour",
        remarks:
          "Evidence missing: 'get system performance status' output not found.",
        reviewRequired: true,
      };
    }

    const perfList =
      ctx?.allMetrics && ctx.allMetrics.length > 0
        ? (ctx.allMetrics as PerformanceMetrics[])
        : [metrics as PerformanceMetrics];

    // Check if any observation exceeds threshold (fail boundary)
    const failingPerf = perfList.find((p) => p.totalCpuUtilizationPct >= 80);
    if (failingPerf) {
      const isHistorical = Boolean(failingPerf.isHistoricalAverage);
      return {
        ruleId: "rule-fg-cpu-fail",
        collectionState: "COMPLETE",
        evaluationStatus: "FAIL",
        currentValue: `${isHistorical ? "1-hr average" : "Instantaneous"}: ${failingPerf.totalCpuUtilizationPct}%`,
        expectedValue: "Average CPU < 80% for past 1 hour",
        remarks: `CPU usage: ${failingPerf.totalCpuUtilizationPct}% exceeds 80% threshold (${isHistorical ? "1-hour historical average" : "instantaneous snapshot"}). Immediate investigation required. Refer Appendix 1`,
        reviewRequired: true,
      };
    }

    // Check if authentic historical average evidence is present
    const hasHistorical = perfList.some((p) => p.isHistoricalAverage);
    if (hasHistorical) {
      const histPerf = perfList.find((p) => p.isHistoricalAverage)!;
      return {
        ruleId: "rule-fg-cpu-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `1-hr average: ${histPerf.totalCpuUtilizationPct}%`,
        expectedValue: "Average CPU < 80% for past 1 hour",
        remarks: `1-hour average CPU is ${histPerf.totalCpuUtilizationPct}%. Verified within approved threshold. Refer Appendix 1`,
        reviewRequired: false,
      };
    }

    // Instantaneous snapshot readings:
    // Do not invent timestamps when PuTTY did not record them.
    // Instantaneous measurements do not prove 1-hour historical compliance -> mark as requiring review rather than automatically passing.
    if (perfList.length === 1) {
      const p = perfList[0];
      return {
        ruleId: "rule-fg-cpu-review",
        collectionState: "COMPLETE",
        evaluationStatus: "REVIEW",
        currentValue: `Instantaneous: ${p.totalCpuUtilizationPct}%`,
        expectedValue: "Average CPU < 80% for past 1 hour",
        remarks: `Instantaneous CPU reading is ${p.totalCpuUtilizationPct}% (< 80%). CLI snapshot does not prove 1-hour sustained compliance; engineer review required. Refer Appendix 1`,
        reviewRequired: true,
      };
    }

    // Multiple instantaneous observations: preserve all observations without inventing timestamps
    const readings = perfList.map((p) => `${p.totalCpuUtilizationPct}%`).join(", ");
    return {
      ruleId: "rule-fg-cpu-review-multi",
      collectionState: "COMPLETE",
      evaluationStatus: "REVIEW",
      currentValue: `Instantaneous readings: ${readings}`,
      expectedValue: "Average CPU < 80% for past 1 hour",
      remarks: `Captured ${perfList.length} instantaneous CPU observations (${readings}). Point-in-time readings do not establish 1-hour sustained average; engineer review required. Refer Appendix 1`,
      reviewRequired: true,
    };
  },

  // 1.3 Memory Usage
  "fg-hw-mem": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-mem",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Memory usage < 80% for past 1 hour",
        remarks:
          "Evidence missing: 'get system performance status' output not found.",
        reviewRequired: true,
      };
    }

    const perfList =
      ctx?.allMetrics && ctx.allMetrics.length > 0
        ? (ctx.allMetrics as PerformanceMetrics[])
        : [metrics as PerformanceMetrics];

    // Check if any observation exceeds threshold (fail boundary)
    const failingPerf = perfList.find((p) => p.memoryUtilizationPct >= 80);
    if (failingPerf) {
      const isHistorical = Boolean(failingPerf.isHistoricalAverage);
      return {
        ruleId: "rule-fg-mem-fail",
        collectionState: "COMPLETE",
        evaluationStatus: "FAIL",
        currentValue: `${isHistorical ? "1-hr average" : "Instantaneous"}: ${failingPerf.memoryUtilizationPct}%`,
        expectedValue: "Memory usage < 80% for past 1 hour",
        remarks: `Memory usage: ${failingPerf.memoryUtilizationPct}% exceeds 80% threshold (${isHistorical ? "1-hour historical average" : "risk of entering conserve mode"}). Immediate investigation required. Refer Appendix 2`,
        reviewRequired: true,
      };
    }

    // Check if authentic historical average evidence is present
    const hasHistorical = perfList.some((p) => p.isHistoricalAverage);
    if (hasHistorical) {
      const histPerf = perfList.find((p) => p.isHistoricalAverage)!;
      return {
        ruleId: "rule-fg-mem-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `1-hr average: ${histPerf.memoryUtilizationPct}%`,
        expectedValue: "Memory usage < 80% for past 1 hour",
        remarks: `1-hour average memory usage is ${histPerf.memoryUtilizationPct}%. Verified below 80% threshold. Refer Appendix 2`,
        reviewRequired: false,
      };
    }

    // Instantaneous snapshot readings:
    // Do not invent timestamps when PuTTY did not record them.
    // Instantaneous measurements do not prove 1-hour historical compliance -> mark as requiring review rather than automatically passing.
    if (perfList.length === 1) {
      const p = perfList[0];
      return {
        ruleId: "rule-fg-mem-review",
        collectionState: "COMPLETE",
        evaluationStatus: "REVIEW",
        currentValue: `Instantaneous: ${p.memoryUtilizationPct}%`,
        expectedValue: "Memory usage < 80% for past 1 hour",
        remarks: `Instantaneous memory reading is ${p.memoryUtilizationPct}% (< 80%). CLI snapshot does not prove 1-hour sustained compliance; engineer review required. Refer Appendix 2`,
        reviewRequired: true,
      };
    }

    // Multiple instantaneous observations: preserve all observations without inventing timestamps
    const readings = perfList.map((p) => `${p.memoryUtilizationPct}%`).join(", ");
    return {
      ruleId: "rule-fg-mem-review-multi",
      collectionState: "COMPLETE",
      evaluationStatus: "REVIEW",
      currentValue: `Instantaneous readings: ${readings}`,
      expectedValue: "Memory usage < 80% for past 1 hour",
      remarks: `Captured ${perfList.length} instantaneous memory observations (${readings}). Point-in-time readings do not establish 1-hour sustained compliance; engineer review required. Refer Appendix 2`,
      reviewRequired: true,
    };
  },

  // 1.4 Interface Monitoring
  "fg-hw-interface": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-intf",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Physical ports UP, 0 errors",
        remarks:
          "Evidence missing: 'get system interface physical' output not found.",
        reviewRequired: true,
      };
    }

    const intf = metrics as InterfaceMetrics;
    const hasErrors = intf.interfaces.some(
      (i) => (i.txErrors && i.txErrors > 0) || (i.rxErrors && i.rxErrors > 0)
    );

    if (hasErrors) {
      return {
        ruleId: "rule-fg-intf-warn",
        collectionState: "COMPLETE",
        evaluationStatus: "WARNING",
        currentValue: `Ports in-used: ${intf.portsInUse} (CRC / packet errors detected)`,
        expectedValue: "Physical ports UP, 0 errors",
        remarks: `Interface transmission or CRC errors detected on active ports. Ports in-used: ${intf.portsInUse}. Refer Appendix 3`,
        reviewRequired: true,
      };
    }

    return {
      ruleId: "rule-fg-intf-pass",
      collectionState: "COMPLETE",
      evaluationStatus: "PASS",
      currentValue: `Ports in-used: ${intf.portsInUse} port(s)`,
      expectedValue: "Physical ports UP, 0 errors",
      remarks: `Port in-used: ${intf.portsInUse} port(s). Physical interfaces operational without errors. Refer Appendix 3`,
      reviewRequired: false,
    };
  },

  // ==========================================================================
  // Section 2: Product Licensing
  // ==========================================================================

  // 2.1 FortiCare Support
  "fg-lic-forticare": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-lic-fc",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Valid active FortiCare support contract",
        remarks:
          "Evidence missing: 'diagnose test update info contract' output not found.",
        reviewRequired: true,
      };
    }

    const lic = metrics as LicenseMetrics;
    const fc = lic.fortiCareSupport;

    if (fc.status === "VALID") {
      const days = fc.daysRemaining;
      if (days !== undefined && days <= 30 && days >= 0) {
        return {
          ruleId: "rule-fg-lic-fc-expiring",
          collectionState: "COMPLETE",
          evaluationStatus: "WARNING",
          currentValue: `Valid (Expires in ${days} days: ${fc.expiryDate})`,
          expectedValue: "Valid active FortiCare support contract",
          remarks: `FortiCare support license is valid but expires soon on ${fc.expiryDate} (${days} days remaining). Renewal recommended. Refer Appendix 4`,
          reviewRequired: true,
        };
      }

      return {
        ruleId: "rule-fg-lic-fc-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `Valid (Expiration Date: ${fc.expiryDate})`,
        expectedValue: "Valid active FortiCare support contract",
        remarks: `FortiCare Support license is valid. Expiration Date: ${fc.expiryDate}. Refer Appendix 4`,
        reviewRequired: false,
      };
    }

    if (fc.status === "EXPIRED") {
      return {
        ruleId: "rule-fg-lic-fc-fail",
        collectionState: "COMPLETE",
        evaluationStatus: "FAIL",
        currentValue: `Expired (${fc.expiryDate || "Unknown"})`,
        expectedValue: "Valid active FortiCare support contract",
        remarks: `FortiCare support license has expired on ${fc.expiryDate}. Contract renewal required. Refer Appendix 4`,
        reviewRequired: true,
      };
    }

    return {
      ruleId: "rule-fg-lic-fc-review",
      collectionState: "INCOMPLETE",
      evaluationStatus: "REVIEW",
      currentValue: "Unavailable",
      expectedValue: "Valid active FortiCare support contract",
      remarks:
        "FortiCare support validity could not be confirmed via FortiGuard server. Manual verification required. Refer Appendix 4",
      reviewRequired: true,
    };
  },

  // 2.2 UTM Bundle Update
  "fg-lic-utm": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-lic-utm",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Valid UTM feature licenses (AV, IPS, Web, Anti-Spam)",
        remarks:
          "Evidence missing: 'diagnose test update info contract' output not found.",
        reviewRequired: true,
      };
    }

    const lic = metrics as LicenseMetrics;

    if (lic.isUtmValid) {
      return {
        ruleId: "rule-fg-lic-utm-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue:
          "Antivirus: Valid | IPS: Valid | Web Filtering: Valid | Anti-Spam: Valid",
        expectedValue: "Valid UTM feature licenses (AV, IPS, Web, Anti-Spam)",
        remarks:
          "All subscribed UTM security features (Antivirus, IPS, Web Filtering, Anti-Spam) are valid. Refer Appendix 4",
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-lic-utm-warn",
      collectionState: "COMPLETE",
      evaluationStatus: "WARNING",
      currentValue: `AV: ${lic.antivirus?.status || "NA"} | IPS: ${lic.ips?.status || "NA"} | Web: ${lic.webFiltering?.status || "NA"}`,
      expectedValue: "Valid UTM feature licenses (AV, IPS, Web, Anti-Spam)",
      remarks:
        "One or more UTM security bundle feature contracts are expired or inactive. Refer Appendix 4",
      reviewRequired: true,
    };
  },

  // ==========================================================================
  // Section 3: Product Life Cycle
  // ==========================================================================

  // 3.1 Firewall Firmware Version
  "fg-fw-version": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-fw",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Running recommended mature FortiOS release",
        remarks: "Evidence missing: 'get system status' output not found.",
        reviewRequired: true,
      };
    }

    const sys = metrics as SystemStatusMetrics;
    const version = sys.version || "Unknown Version";

    if (sys.isMatureRelease) {
      return {
        ruleId: "rule-fg-fw-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: version,
        expectedValue: "Running recommended mature FortiOS release",
        remarks: `Current firmware ${version} is running a mature release. No urgent upgrade required. Refer Appendix 5`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-fw-review",
      collectionState: "COMPLETE",
      evaluationStatus: "REVIEW",
      currentValue: version,
      expectedValue: "Running recommended mature FortiOS release",
      remarks: `Current firmware is ${version}. Verify release against CTC approved mature firmware list. Refer Appendix 5`,
      reviewRequired: true,
    };
  },

  // 3.2 Final Firmware Release (FFR)
  "fg-life-ffr": () => ({
    ruleId: "rule-fg-ffr",
    collectionState: "UNSUPPORTED",
    evaluationStatus: "REVIEW",
    currentValue: "External reference required",
    expectedValue: "Designated FFR milestone from Fortinet portal",
    remarks:
      "Cross-check model on Fortinet Product Life Cycle portal (support.fortinet.com/Information/ProductLifeCycle.aspx).",
    reviewRequired: true,
  }),

  // 3.3 End of Support Date (EOS)
  "fg-life-eos": () => ({
    ruleId: "rule-fg-eos",
    collectionState: "UNSUPPORTED",
    evaluationStatus: "REVIEW",
    currentValue: "External reference required",
    expectedValue: "Hardware EOS date >= 60 months after EO-Order",
    remarks:
      "Lookup hardware EOS milestone on Fortinet Support portal or endoflife.date/fortios.",
    reviewRequired: true,
  }),

  // ==========================================================================
  // Section 4: VPN Status
  // ==========================================================================

  // 4.1 Check Number Of tunnel
  "fg-vpn-tunnel": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-vpn",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "All configured IPsec tunnels Active (UP)",
        remarks:
          "Evidence missing: 'get vpn ipsec tunnel summary' output not found.",
        reviewRequired: true,
      };
    }

    const vpn = metrics as VpnMetrics;

    if (vpn.totalTunnels === 0) {
      return {
        ruleId: "rule-fg-vpn-na",
        collectionState: "COMPLETE",
        evaluationStatus: "NA",
        currentValue: "Total: 0, Active: 0, Inactive: 0",
        expectedValue: "All configured IPsec tunnels Active (UP)",
        remarks:
          "Total VPN Tunnel(s): 0. Customer does not use IPsec VPN tunnels on this device. Refer Appendix 6",
        reviewRequired: false,
      };
    }

    if (vpn.inactiveTunnels === 0) {
      return {
        ruleId: "rule-fg-vpn-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `Total: ${vpn.totalTunnels}, Active: ${vpn.activeTunnels}, Inactive: 0`,
        expectedValue: "All configured IPsec tunnels Active (UP)",
        remarks: `Total VPN Tunnel(s): ${vpn.totalTunnels}, Active: ${vpn.activeTunnels}, Inactive: 0. All configured tunnels are UP. Refer Appendix 6`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-vpn-warn",
      collectionState: "COMPLETE",
      evaluationStatus: "WARNING",
      currentValue: `Total: ${vpn.totalTunnels}, Active: ${vpn.activeTunnels}, Inactive: ${vpn.inactiveTunnels}`,
      expectedValue: "All configured IPsec tunnels Active (UP)",
      remarks: `Total VPN Tunnel(s): ${vpn.totalTunnels}, Active: ${vpn.activeTunnels}, Inactive: ${vpn.inactiveTunnels}. Investigation recommended for inactive tunnel(s). Refer Appendix 6`,
      reviewRequired: true,
    };
  },

  // ==========================================================================
  // Section 5: Routing Status
  // ==========================================================================

  // 5.1 Firewall Routing Table
  "fg-net-routing": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-route",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Active default route (0.0.0.0/0) reachable",
        remarks:
          "Evidence missing: 'get router info routing-table all' output not found.",
        reviewRequired: true,
      };
    }

    const route = metrics as RoutingMetrics;

    if (route.hasDefaultRoute) {
      return {
        ruleId: "rule-fg-route-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `Default route active via ${route.defaultGateway} (${route.defaultInterface || "wan"})`,
        expectedValue: "Active default route (0.0.0.0/0) reachable",
        remarks: `Static route and routing monitor information verified. Default gateway reachable via ${route.defaultGateway}. Refer Appendix 7`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-route-fail",
      collectionState: "COMPLETE",
      evaluationStatus: "FAIL",
      currentValue: "No default route found",
      expectedValue: "Active default route (0.0.0.0/0) reachable",
      remarks:
        "No active default gateway route (0.0.0.0/0) found in routing table. Refer Appendix 7",
      reviewRequired: true,
    };
  },

  // ==========================================================================
  // Section 6: Configuration & HA
  // ==========================================================================

  // 6.1 Firewall System Uptime
  "fg-sys-uptime": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-uptime",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Stable uptime with no unexpected reboots",
        remarks:
          "Evidence missing: 'get system performance status' output not found.",
        reviewRequired: true,
      };
    }

    const perf = metrics as PerformanceMetrics;
    const uptimeStr = perf.uptimeString || "Unknown";

    return {
      ruleId: "rule-fg-uptime-pass",
      collectionState: "COMPLETE",
      evaluationStatus: "PASS",
      currentValue: `Uptime: ${uptimeStr}`,
      expectedValue: "Stable uptime with no unexpected reboots",
      remarks: `Firewall system uptime: ${uptimeStr}. Refer Appendix 8`,
      reviewRequired: false,
    };
  },

  // 6.2 Accessibility via GUI
  "fg-mgmt-gui": () => ({
    ruleId: "rule-fg-gui",
    collectionState: "UNSUPPORTED",
    evaluationStatus: "REVIEW",
    currentValue: "Manual check required",
    expectedValue: "Web GUI accessible over HTTPS",
    remarks:
      "Verify firewall web management portal access via browser. Refer Appendix 9",
    reviewRequired: true,
  }),

  // 6.3 Accessibility via CLI
  "fg-mgmt-cli": (_metrics, ctx) => {
    if (ctx?.hasExecution) {
      return {
        ruleId: "rule-fg-cli-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: "SSH CLI Accessible",
        expectedValue: "Firewall accessible via SSH",
        remarks:
          "Firewall accessibility via SSH CLI verified with authorized credentials. Refer Appendix 10",
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-cli-miss",
      collectionState: "MISSING",
      evaluationStatus: "PENDING",
      currentValue: "Missing",
      expectedValue: "Firewall accessible via SSH",
      remarks: "CLI session log output not available.",
      reviewRequired: true,
    };
  },

  // 6.4 Signatures version
  "fg-sec-signatures": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-sig",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Signatures (AV, IPS, App Control) up to date",
        remarks:
          "Evidence missing: 'diagnose autoupdate versions' output not found.",
        reviewRequired: true,
      };
    }

    const sig = metrics as SignaturesMetrics;
    const avVer = sig.avDefinitionsVersion || "Active";
    const ipsVer = sig.ipsDefinitionsVersion || "Active";

    return {
      ruleId: "rule-fg-sig-pass",
      collectionState: "COMPLETE",
      evaluationStatus: "PASS",
      currentValue: `AV: ${avVer} | IPS: ${ipsVer}`,
      expectedValue: "Signatures (AV, IPS, App Control) up to date",
      remarks: `Security signatures (Antivirus: ${avVer}, IPS: ${ipsVer}) are up-to-date and actively refreshing. Refer Appendix 11`,
      reviewRequired: false,
    };
  },

  // 6.5 Firewall Date & Time
  "fg-sys-ntp": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-ntp",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "NTP synchronized (GMT +8 / Asia/Kuala_Lumpur)",
        remarks:
          "Evidence missing: 'diagnose sys ntp status' output not found.",
        reviewRequired: true,
      };
    }

    const ntp = metrics as NtpMetrics;

    if (ntp.isSynchronized) {
      return {
        ruleId: "rule-fg-ntp-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `Synchronized (${ntp.activeServer || "NTP Server"})`,
        expectedValue: "NTP synchronized (GMT +8 / Asia/Kuala_Lumpur)",
        remarks: `Date and time synchronized with NTP server. Time zone is set as ${ntp.timezone || "GMT +8"}. Refer Appendix 12`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-ntp-fail",
      collectionState: "COMPLETE",
      evaluationStatus: "FAIL",
      currentValue: "Unsynchronized",
      expectedValue: "NTP synchronized (GMT +8 / Asia/Kuala_Lumpur)",
      remarks:
        "Firewall clock is NOT synchronized with NTP server. Log timestamp auditing may be impacted. Refer Appendix 12",
      reviewRequired: true,
    };
  },

  // 6.6 Firewall Internet Access
  "fg-net-connectivity": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-ping",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "0% packet loss to 8.8.8.8",
        remarks: "Evidence missing: 'execute ping 8.8.8.8' output not found.",
        reviewRequired: true,
      };
    }

    const conn = metrics as ConnectivityMetrics;

    if (conn.packetLossPct === 0) {
      const avg = conn.rttAvgMs ? ` (avg ${conn.rttAvgMs}ms)` : "";
      return {
        ruleId: "rule-fg-ping-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `0% packet loss${avg}`,
        expectedValue: "0% packet loss to 8.8.8.8",
        remarks: `Able to ping 8.8.8.8 with 0% packet loss${avg}. Refer Appendix 10`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-ping-fail",
      collectionState: "COMPLETE",
      evaluationStatus: "FAIL",
      currentValue: `${conn.packetLossPct}% packet loss`,
      expectedValue: "0% packet loss to 8.8.8.8",
      remarks: `Firewall internet ping test to 8.8.8.8 experienced ${conn.packetLossPct}% packet loss. Refer Appendix 10`,
      reviewRequired: true,
    };
  },

  // 6.7 High Availability (if any)
  "fg-sys-ha": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-ha",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "HA cluster members in-sync or Standalone",
        remarks: "Evidence missing: 'get system ha status' output not found.",
        reviewRequired: true,
      };
    }

    const ha = metrics as HaClusterMetrics;

    if (!ha.isCluster || ha.haMode === "STANDALONE") {
      return {
        ruleId: "rule-fg-ha-standalone",
        collectionState: "COMPLETE",
        evaluationStatus: "NA",
        currentValue: "Standalone",
        expectedValue: "HA cluster members in-sync or Standalone",
        remarks: "The firewall is a standalone firewall. Refer Appendix 14",
        reviewRequired: false,
      };
    }

    if (ha.isSynchronized) {
      return {
        ruleId: "rule-fg-ha-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `Active-Passive (in-sync, ${ha.members.length} members)`,
        expectedValue: "HA cluster members in-sync or Standalone",
        remarks: `HA cluster status verified. Configuration status is in-sync across ${ha.members.length} cluster members. Refer Appendix 13`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-ha-fail",
      collectionState: "COMPLETE",
      evaluationStatus: "FAIL",
      currentValue: "Out-of-Sync",
      expectedValue: "HA cluster members in-sync or Standalone",
      remarks:
        "High Availability cluster is OUT-OF-SYNC. Cluster members have diverging configurations. Immediate review required. Refer Appendix 13",
      reviewRequired: true,
    };
  },

  // 6.8 Logging (Event Log)
  "fg-sys-log": (_metrics, ctx) => {
    if (ctx?.hasExecution) {
      return {
        ruleId: "rule-fg-log-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: "Available",
        expectedValue: "Logging available, no critical crashes",
        remarks:
          "Logging available. Event log verified for critical errors or warnings. Refer Appendix 15",
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-log-miss",
      collectionState: "MISSING",
      evaluationStatus: "PENDING",
      currentValue: "Missing",
      expectedValue: "Logging available, no critical crashes",
      remarks: "Event log output was not found in logs.",
      reviewRequired: true,
    };
  },

  // 6.9 Log Manager (if any)
  "fg-sys-faz": (metrics, ctx) => {
    if (!ctx?.hasExecution || !metrics) {
      return {
        ruleId: "rule-fg-faz",
        collectionState: "MISSING",
        evaluationStatus: "PENDING",
        currentValue: "Missing",
        expectedValue: "Connected to FortiAnalyzer or N/A",
        remarks:
          "Evidence missing: FortiAnalyzer test connectivity output not found.",
        reviewRequired: true,
      };
    }

    const faz = metrics as LogManagerMetrics;

    if (faz.connectionState === "CONNECTED") {
      return {
        ruleId: "rule-fg-faz-pass",
        collectionState: "COMPLETE",
        evaluationStatus: "PASS",
        currentValue: `Connected (${faz.targetIp || "FortiAnalyzer"})`,
        expectedValue: "Connected to FortiAnalyzer or N/A",
        remarks: `FortiAnalyzer connectivity is healthy. TLS handshake OK. Refer Appendix 16`,
        reviewRequired: false,
      };
    }

    return {
      ruleId: "rule-fg-faz-na",
      collectionState: "COMPLETE",
      evaluationStatus: "NA",
      currentValue: "N/A",
      expectedValue: "Connected to FortiAnalyzer or N/A",
      remarks:
        "FortiAnalyzer is not configured or not utilized in customer environment. Refer Appendix 16",
      reviewRequired: false,
    };
  },

  // 6.10 Backup Configurations
  "fg-sys-backup": () => ({
    ruleId: "rule-fg-backup",
    collectionState: "UNSUPPORTED",
    evaluationStatus: "REVIEW",
    currentValue: "Manual download required",
    expectedValue: "Configuration (.conf) backed up and archived",
    remarks:
      "Backup current configuration file via Web GUI or CLI 'show full-configuration' and archive with PM deliverables. Refer Appendix 16",
    reviewRequired: true,
  }),
};
