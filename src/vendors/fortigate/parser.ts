import {
  IVendorParser,
  ParsedCommandOutput,
  ExtractedMetricsValue,
  SystemStatusMetrics,
  PerformanceMetrics,
  DiskSpaceMetrics,
  DiskPartitionMetric,
  InterfaceMetrics,
  PhysicalInterfaceMetric,
  LicenseMetrics,
  LicenseFeatureContract,
  VpnMetrics,
  VpnTunnelSummary,
  RoutingMetrics,
  RouteEntry,
  HaClusterMetrics,
  HaMemberMetric,
  SignaturesMetrics,
  NtpMetrics,
  ConnectivityMetrics,
  LogManagerMetrics,
} from "@/core/checks/types";

export class FortiGateParser implements IVendorParser {
  readonly vendorId = "fortigate" as const;

  private supportedCommandIds = new Set([
    "cmd-fg-sys-status",
    "cmd-fg-sys-perf",
    "cmd-fg-hw-disk",
    "cmd-fg-intf-phys",
    "cmd-fg-lic-contract",
    "cmd-fg-vpn-tunnel",
    "cmd-fg-route-table",
    "cmd-fg-ha-status",
    "cmd-fg-autoupdate-ver",
    "cmd-fg-ntp-status",
    "cmd-fg-ping-internet",
    "cmd-fg-faz-test",
    "cmd-fg-log-display",
    "cmd-fg-admin-status",
  ]);

  canParse(commandId: string): boolean {
    return this.supportedCommandIds.has(commandId);
  }

  parseCommandOutput(commandId: string, rawOutput: string): ParsedCommandOutput {
    if (!rawOutput || rawOutput.trim().length === 0) {
      return {
        commandId,
        rawCommand: "",
        parseStatus: "EMPTY",
        metrics: {},
      };
    }

    try {
      let metrics: ExtractedMetricsValue = {};

      switch (commandId) {
        case "cmd-fg-sys-status":
          metrics = this.parseSystemStatus(rawOutput);
          break;
        case "cmd-fg-sys-perf":
          metrics = this.parsePerformanceStatus(rawOutput);
          break;
        case "cmd-fg-hw-disk":
          metrics = this.parseDiskSpace(rawOutput);
          break;
        case "cmd-fg-intf-phys":
          metrics = this.parsePhysicalInterfaces(rawOutput);
          break;
        case "cmd-fg-lic-contract":
          metrics = this.parseLicensingContract(rawOutput);
          break;
        case "cmd-fg-vpn-tunnel":
          metrics = this.parseVpnTunnels(rawOutput);
          break;
        case "cmd-fg-route-table":
          metrics = this.parseRoutingTable(rawOutput);
          break;
        case "cmd-fg-ha-status":
          metrics = this.parseHaStatus(rawOutput);
          break;
        case "cmd-fg-autoupdate-ver":
          metrics = this.parseAutoupdateVersions(rawOutput);
          break;
        case "cmd-fg-ntp-status":
          metrics = this.parseNtpStatus(rawOutput);
          break;
        case "cmd-fg-ping-internet":
          metrics = this.parsePingOutput(rawOutput);
          break;
        case "cmd-fg-faz-test":
          metrics = this.parseFazConnectivity(rawOutput);
          break;
        default:
          return {
            commandId,
            rawCommand: "",
            parseStatus: "UNSUPPORTED",
            metrics: { rawText: rawOutput.slice(0, 500) },
          };
      }

      return {
        commandId,
        rawCommand: "",
        parseStatus: "SUCCESS",
        metrics,
      };
    } catch (err: unknown) {
      return {
        commandId,
        rawCommand: "",
        parseStatus: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Failed to parse command output",
        metrics: {},
      };
    }
  }

  // --------------------------------------------------------------------------
  // Command Parsers
  // --------------------------------------------------------------------------

  private parseSystemStatus(output: string): SystemStatusMetrics {
    const versionMatch = output.match(/Version:\s*(.+)/i);
    const serialMatch = output.match(/Serial-Number:\s*([A-Za-z0-9_\-]+)/i);
    const hostnameMatch = output.match(/Hostname:\s*([A-Za-z0-9_\-\.]+)/i);
    const opModeMatch = output.match(/Operation Mode:\s*([A-Za-z0-9_\-]+)/i);
    const vdomMatch = output.match(/Current virtual domain:\s*([A-Za-z0-9_\-]+)/i);
    const haMatch = output.match(/Current HA mode:\s*(.+)/i);
    const branchMatch = output.match(/Branch point:\s*(\d+)/i);

    const versionStr = versionMatch ? versionMatch[1].trim() : undefined;
    const isMature = versionStr
      ? versionStr.includes("GA.M") || versionStr.includes("Mature")
      : undefined;

    return {
      version: versionStr,
      serialNumber: serialMatch ? serialMatch[1].trim() : undefined,
      hostname: hostnameMatch ? hostnameMatch[1].trim() : undefined,
      operationMode: opModeMatch ? opModeMatch[1].trim() : undefined,
      virtualDomain: vdomMatch ? vdomMatch[1].trim() : undefined,
      haMode: haMatch ? haMatch[1].trim() : undefined,
      buildNumber: branchMatch ? branchMatch[1].trim() : undefined,
      isMatureRelease: isMature,
    };
  }

  private parsePerformanceStatus(output: string): PerformanceMetrics {
    // CPU states: 0% user 1% system 0% nice 99% idle
    const cpuMatch = output.match(
      /CPU states:\s*(\d+)%\s*user\s*(\d+)%\s*system\s*(\d+)%\s*nice\s*(\d+)%\s*idle/i
    );

    const isCpuParsed = Boolean(cpuMatch);
    let cpuUserPct = 0;
    let cpuSystemPct = 0;
    let cpuIdlePct = 100;

    if (cpuMatch) {
      cpuUserPct = parseInt(cpuMatch[1], 10);
      cpuSystemPct = parseInt(cpuMatch[2], 10);
      cpuIdlePct = parseInt(cpuMatch[4], 10);
    }

    const totalCpuUtilizationPct = cpuUserPct + cpuSystemPct;

    // Memory: 16384000k total, 5406720k used (33%), 10977280k free (67%)
    const memMatch = output.match(
      /Memory:\s*(\d+)k\s*total,\s*(\d+)k\s*used\s*\((\d+)%\)/i
    );

    const isMemoryParsed = Boolean(memMatch);
    let memoryTotalBytes = 0;
    let memoryUsedBytes = 0;
    let memoryFreeBytes = 0;
    let memoryUtilizationPct = 0;

    if (memMatch) {
      const totalK = parseInt(memMatch[1], 10);
      const usedK = parseInt(memMatch[2], 10);
      memoryUtilizationPct = parseInt(memMatch[3], 10);
      memoryTotalBytes = totalK * 1024;
      memoryUsedBytes = usedK * 1024;
      memoryFreeBytes = Math.max(0, memoryTotalBytes - memoryUsedBytes);
    }

    // Average sessions: 1845 concurrent sessions
    const sessMatch = output.match(/Average sessions:\s*(\d+)/i);
    const activeSessionsCount = sessMatch ? parseInt(sessMatch[1], 10) : undefined;

    // Uptime: 177 days, 14 hours, 24 minutes
    const uptimeMatch = output.match(/Uptime:\s*(.+)/i);
    const uptimeString = uptimeMatch ? uptimeMatch[1].trim() : undefined;
    const uptimeSeconds = uptimeString ? this.parseUptimeToSeconds(uptimeString) : undefined;

    if (!isCpuParsed && !isMemoryParsed && !uptimeString && !sessMatch) {
      throw new Error("Unable to parse CPU, Memory, or Uptime from performance status output.");
    }

    return {
      cpuUserPct,
      cpuSystemPct,
      cpuIdlePct,
      totalCpuUtilizationPct,
      memoryTotalBytes,
      memoryUsedBytes,
      memoryFreeBytes,
      memoryUtilizationPct,
      activeSessionsCount,
      uptimeSeconds,
      uptimeString,
      isCpuParsed,
      isMemoryParsed,
    };
  }

  private parseDiskSpace(output: string): DiskSpaceMetrics {
    // Header: Filesystem 1k-blocks Used Available Use% Mounted on
    const lines = output.split("\n");
    const partitions: DiskPartitionMetric[] = [];

    for (const line of lines) {
      const match = line.trim().match(
        /^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(.+)$/
      );
      if (match) {
        partitions.push({
          filesystem: match[1],
          total1kBlocks: parseInt(match[2], 10),
          used1kBlocks: parseInt(match[3], 10),
          available1kBlocks: parseInt(match[4], 10),
          usedPct: parseInt(match[5], 10),
          mountPoint: match[6].trim(),
        });
      }
    }

    let highestUsedPct = 0;
    for (const p of partitions) {
      if (p.usedPct > highestUsedPct) {
        highestUsedPct = p.usedPct;
      }
    }

    // In FortiOS, devices without log disk only mount ramfs/tmpfs
    const hasLogPartition = partitions.some(
      (p) => p.mountPoint === "/var/log" || p.mountPoint.includes("log")
    );

    return {
      isEquipped: hasLogPartition,
      partitions,
      highestUsedPct,
      statusNote: hasLogPartition
        ? `Log partition active (${highestUsedPct}% utilized)`
        : "Device is not equipped with hard disk (flash storage only)",
    };
  }

  private parsePhysicalInterfaces(output: string): InterfaceMetrics {
    // Pattern:
    // ==[port1]
    // mode: physical
    // speed: 1000Mbps (Duplex: full)
    // link: up
    // tx_packets: ...
    const blocks = output.split(/==\[([^\]]+)\]/g);
    const interfaces: PhysicalInterfaceMetric[] = [];

    for (let i = 1; i < blocks.length; i += 2) {
      const portName = blocks[i].trim();
      const blockBody = blocks[i + 1] || "";

      const linkMatch = blockBody.match(/link:\s*([a-zA-Z]+)/i);
      const speedMatch = blockBody.match(/speed:\s*([^(\n]+)/i);
      const duplexMatch = blockBody.match(/Duplex:\s*([a-zA-Z]+)/i);
      const txMatch = blockBody.match(/tx_packets:\s*(\d+)/i);
      const rxMatch = blockBody.match(/rx_packets:\s*(\d+)/i);
      const txErrMatch = blockBody.match(/tx_errors:\s*(\d+)/i);
      const rxErrMatch = blockBody.match(/rx_errors:\s*(\d+)/i);

      const linkStatus =
        linkMatch && linkMatch[1].toLowerCase() === "up"
          ? ("UP" as const)
          : ("DOWN" as const);

      let duplex: "FULL" | "HALF" | "AUTO" | "UNKNOWN" = "UNKNOWN";
      if (duplexMatch) {
        const d = duplexMatch[1].toLowerCase();
        if (d === "full") duplex = "FULL";
        else if (d === "half") duplex = "HALF";
        else if (d === "auto") duplex = "AUTO";
      }

      interfaces.push({
        name: portName,
        linkStatus,
        speed: speedMatch ? speedMatch[1].trim() : undefined,
        duplex,
        txPackets: txMatch ? parseInt(txMatch[1], 10) : undefined,
        rxPackets: rxMatch ? parseInt(rxMatch[1], 10) : undefined,
        txErrors: txErrMatch ? parseInt(txErrMatch[1], 10) : undefined,
        rxErrors: rxErrMatch ? parseInt(rxErrMatch[1], 10) : undefined,
      });
    }

    const portsInUse = interfaces.filter((i) => i.linkStatus === "UP").length;
    const portsDown = interfaces.filter((i) => i.linkStatus === "DOWN").length;

    return {
      interfaces,
      totalPorts: interfaces.length,
      portsInUse,
      portsDown,
    };
  }

  private parseLicensingContract(output: string): LicenseMetrics {
    const parseContractBlock = (featureName: string): LicenseFeatureContract => {
      const regex = new RegExp(
        `${featureName}:[\\s\\S]*?Contract:\\s*([A-Za-z0-9_\\-]+)(?:[\\s\\S]*?Expires:\\s*([0-9\\-]+))?`,
        "i"
      );
      const match = output.match(regex);

      if (!match) {
        return { name: featureName, status: "NOT_SUBSCRIBED" };
      }

      const rawStatus = match[1].toUpperCase();
      const expiryDate = match[2]?.trim();
      const daysRemaining = expiryDate ? this.calculateDaysRemaining(expiryDate) : undefined;

      let status: "VALID" | "EXPIRED" | "UNAVAILABLE" = "UNAVAILABLE";
      if (rawStatus === "VALID") status = "VALID";
      else if (rawStatus === "EXPIRED") status = "EXPIRED";

      return {
        name: featureName,
        status,
        expiryDate,
        daysRemaining,
      };
    };

    const fortiCare = parseContractBlock("FortiCare Support");
    const av = parseContractBlock("Antivirus");
    const ips = parseContractBlock("IPS");
    const web = parseContractBlock("Web Filtering");
    const spam = parseContractBlock("Anti-Spam");
    const industrial = parseContractBlock("Industrial Security");

    const isFortiCareValid = fortiCare.status === "VALID";
    const isUtmValid =
      av.status === "VALID" &&
      ips.status === "VALID" &&
      web.status === "VALID";

    return {
      fortiCareSupport: fortiCare,
      antivirus: av,
      ips,
      webFiltering: web,
      antiSpam: spam,
      industrialSecurity: industrial,
      isFortiCareValid,
      isUtmValid,
    };
  }

  private parseVpnTunnels(output: string): VpnMetrics {
    const lines = output.split("\n");
    const tunnels: VpnTunnelSummary[] = [];

    for (const line of lines) {
      // 'vpn_hq_dr' 10.200.1.1:0 selectors(total,up): 1/1
      const match = line.match(
        /'([^']+)'\s+([0-9\.]+:\d+)?\s+selectors\(total,up\):\s*(\d+)\/(\d+)/i
      );
      if (match) {
        const name = match[1];
        const peerIp = match[2];
        const selectorsTotal = parseInt(match[3], 10);
        const selectorsUp = parseInt(match[4], 10);

        tunnels.push({
          name,
          peerIp,
          status: selectorsUp > 0 ? "UP" : "DOWN",
          selectorsTotal,
          selectorsUp,
        });
      }
    }

    const activeTunnels = tunnels.filter((t) => t.status === "UP").length;
    const inactiveTunnels = tunnels.filter((t) => t.status === "DOWN").length;

    return {
      totalTunnels: tunnels.length,
      activeTunnels,
      inactiveTunnels,
      tunnels,
    };
  }

  private parseRoutingTable(output: string): RoutingMetrics {
    const lines = output.split("\n");
    const routes: RouteEntry[] = [];
    let defaultGateway: string | undefined = undefined;
    let defaultInterface: string | undefined = undefined;
    let hasDefaultRoute = false;

    for (const line of lines) {
      // S* 0.0.0.0/0 [10/0] via 192.168.1.1, port1
      // C 10.10.0.0/24 is directly connected, port2
      const defaultMatch = line.match(
        /S\*\s+0\.0\.0\.0\/0.*?via\s+([0-9\.]+),\s*(\S+)/i
      );
      if (defaultMatch) {
        hasDefaultRoute = true;
        defaultGateway = defaultMatch[1];
        defaultInterface = defaultMatch[2].replace(/[,]/g, "");
      }

      const routeMatch = line.match(
        /^([A-Z]\*?)\s+([0-9\.]+\/\d+)(?:.*?via\s+([0-9\.]+))?(?:.*?(?:connected,|port\S*|via\s+\S*))?/
      );
      if (routeMatch) {
        routes.push({
          protocol: routeMatch[1].replace("*", "").trim(),
          prefix: routeMatch[2].trim(),
          gateway: routeMatch[3]?.trim(),
          isDefault: routeMatch[2] === "0.0.0.0/0",
        });
      }
    }

    return {
      totalRoutes: routes.length,
      hasDefaultRoute,
      defaultGateway,
      defaultInterface,
      routes,
    };
  }

  private parseHaStatus(output: string): HaClusterMetrics {
    const modeMatch = output.match(/Mode:\s*([a-zA-Z0-9_\-]+)/i);
    const healthMatch = output.match(/HA Health Status:\s*([a-zA-Z0-9_\-]+)/i);
    const syncMatch = output.match(/Configuration status:\s*([a-zA-Z0-9_\-]+)/i);

    const isExplicitStandalone =
      /standalone|ha is not enabled|not enabled|ha mode:\s*standalone/i.test(output);

    let haMode: "STANDALONE" | "ACTIVE_PASSIVE" | "ACTIVE_ACTIVE" | "UNKNOWN" = "UNKNOWN";

    if (modeMatch) {
      const rawMode = modeMatch[1].toLowerCase();
      if (rawMode.includes("a-p") || rawMode.includes("active-passive")) {
        haMode = "ACTIVE_PASSIVE";
      } else if (rawMode.includes("a-a") || rawMode.includes("active-active")) {
        haMode = "ACTIVE_ACTIVE";
      } else if (rawMode.includes("standalone") || rawMode.includes("disable")) {
        haMode = "STANDALONE";
      }
    } else if (isExplicitStandalone) {
      haMode = "STANDALONE";
    }

    const isCluster = haMode === "ACTIVE_PASSIVE" || haMode === "ACTIVE_ACTIVE";
    const isSynchronized = syncMatch
      ? syncMatch[1].toLowerCase() === "in-sync"
      : (haMode === "STANDALONE");

    const members: HaMemberMetric[] = [];
    const masterMatch = output.match(
      /Master:\s*([A-Za-z0-9_\-\.]+),\s*([A-Za-z0-9_\-]+)/i
    );
    if (masterMatch) {
      members.push({
        hostname: masterMatch[1],
        serialNumber: masterMatch[2],
        role: "MASTER",
      });
    }

    const slaveMatch = output.match(
      /Slave:\s*([A-Za-z0-9_\-\.]+),\s*([A-Za-z0-9_\-]+)/i
    );
    if (slaveMatch) {
      members.push({
        hostname: slaveMatch[1],
        serialNumber: slaveMatch[2],
        role: "SLAVE",
      });
    }

    return {
      haMode,
      isCluster,
      isSynchronized,
      healthStatus: healthMatch ? healthMatch[1] : undefined,
      members,
    };
  }

  private parseAutoupdateVersions(output: string): SignaturesMetrics {
    const avEngineMatch = output.match(/AV Engine:\s*([0-9\.]+)/i);
    const virusMatch = output.match(/Virus Definitions:\s*([0-9\.]+)\s*(?:\(([^)]+)\))?/i);
    const ipsEngineMatch = output.match(/IPS Engine:\s*([0-9\.]+)/i);
    const ipsAttackMatch = output.match(/IPS Attack Definitions:\s*([0-9\.]+)\s*(?:\(([^)]+)\))?/i);
    const appMatch = output.match(/Application Definitions:\s*([0-9\.]+)\s*(?:\(([^)]+)\))?/i);

    return {
      avEngine: avEngineMatch ? avEngineMatch[1] : undefined,
      avDefinitionsVersion: virusMatch ? virusMatch[1] : undefined,
      avDefinitionsDate: virusMatch ? virusMatch[2] : undefined,
      ipsEngine: ipsEngineMatch ? ipsEngineMatch[1] : undefined,
      ipsDefinitionsVersion: ipsAttackMatch ? ipsAttackMatch[1] : undefined,
      ipsDefinitionsDate: ipsAttackMatch ? ipsAttackMatch[2] : undefined,
      appDefinitionsVersion: appMatch ? appMatch[1] : undefined,
      appDefinitionsDate: appMatch ? appMatch[2] : undefined,
    };
  }

  private parseNtpStatus(output: string): NtpMetrics {
    const syncMatch = output.match(/synchronized:\s*(yes|no)/i);
    const stratumMatch = output.match(/stratum\s*(\d+)/i);
    const offsetMatch = output.match(/offset\s*([0-9\.\-]+)/i);
    const jitterMatch = output.match(/jitter\s*([0-9\.\-]+)/i);
    const serverMatch = output.match(/server:\s*([0-9\.]+)/i);
    const tzMatch = output.match(/time zone:\s*(.+)/i);

    return {
      isSynchronized: syncMatch ? syncMatch[1].toLowerCase() === "yes" : false,
      stratum: stratumMatch ? parseInt(stratumMatch[1], 10) : undefined,
      offsetSeconds: offsetMatch ? parseFloat(offsetMatch[1]) : undefined,
      jitterSeconds: jitterMatch ? parseFloat(jitterMatch[1]) : undefined,
      activeServer: serverMatch ? serverMatch[1] : undefined,
      timezone: tzMatch ? tzMatch[1].trim() : undefined,
    };
  }

  private parsePingOutput(output: string): ConnectivityMetrics {
    // 5 packets transmitted, 5 packets received, 0% packet loss
    const statsMatch = output.match(
      /(\d+)\s+packets transmitted,\s+(\d+)\s+packets received,\s*(\d+)%\s+packet loss/i
    );
    // round-trip min/avg/max = 4.1/4.18/4.3 ms
    const rttMatch = output.match(
      /round-trip\s+min\/avg\/max\s*=\s*([0-9\.]+)\/([0-9\.]+)\/([0-9\.]+)/i
    );

    let transmitted = 0;
    let received = 0;
    let packetLossPct = 100;

    if (statsMatch) {
      transmitted = parseInt(statsMatch[1], 10);
      received = parseInt(statsMatch[2], 10);
      packetLossPct = parseInt(statsMatch[3], 10);
    }

    return {
      target: "8.8.8.8",
      transmitted,
      received,
      packetLossPct,
      rttMinMs: rttMatch ? parseFloat(rttMatch[1]) : undefined,
      rttAvgMs: rttMatch ? parseFloat(rttMatch[2]) : undefined,
      rttMaxMs: rttMatch ? parseFloat(rttMatch[3]) : undefined,
      isReachable: packetLossPct === 0 || received > 0,
    };
  }

  private parseFazConnectivity(output: string): LogManagerMetrics {
    const ipMatch = output.match(/(?:FortiAnalyzer IP|IP Address|Server IP|IP):\s*([0-9\.]+)/i);
    const connMatch = output.match(/(?:Connection state|Connectivity status|Status|State):\s*([a-zA-Z\/-]+)/i);
    const sslMatch = output.match(/SSL handshake:\s*([a-zA-Z]+)/i);
    const regMatch = output.match(/Registration status:\s*([a-zA-Z]+)/i);

    const isExplicitlyUnconfigured =
      /not configured|disabled|no fortianalyzer|unconfigured/i.test(output);

    let connectionState: "CONNECTED" | "UNREACHABLE" | "UNCONFIGURED" = "UNCONFIGURED";
    if (isExplicitlyUnconfigured || (!ipMatch && !connMatch)) {
      connectionState = "UNCONFIGURED";
    } else if (connMatch && connMatch[1].toLowerCase().includes("connected") && !connMatch[1].toLowerCase().includes("unconnected")) {
      connectionState = "CONNECTED";
    } else {
      connectionState = "UNREACHABLE";
    }

    return {
      targetIp: ipMatch ? ipMatch[1] : undefined,
      connectionState,
      sslHandshakeOk: sslMatch ? sslMatch[1].toLowerCase() === "ok" : false,
      registrationStatus: regMatch ? regMatch[1] : undefined,
    };
  }

  // --------------------------------------------------------------------------
  // Utility Helpers
  // --------------------------------------------------------------------------

  private parseUptimeToSeconds(uptimeStr: string): number {
    let seconds = 0;
    const daysMatch = uptimeStr.match(/(\d+)\s*days?/i);
    const hoursMatch = uptimeStr.match(/(\d+)\s*hours?/i);
    const minsMatch = uptimeStr.match(/(\d+)\s*minutes?/i);

    if (daysMatch) seconds += parseInt(daysMatch[1], 10) * 86400;
    if (hoursMatch) seconds += parseInt(hoursMatch[1], 10) * 3600;
    if (minsMatch) seconds += parseInt(minsMatch[1], 10) * 60;

    return seconds;
  }

  private calculateDaysRemaining(expiryDateStr: string): number {
    try {
      const expiry = new Date(expiryDateStr).getTime();
      const now = new Date().getTime();
      const diffMs = expiry - now;
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  }
}

export const fortiGateParser = new FortiGateParser();
