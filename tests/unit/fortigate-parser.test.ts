import { describe, it, expect } from "vitest";
import { fortiGateParser } from "@/vendors/fortigate/parser";
import {
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

describe("FortiGateParser Logical Metrics Extraction", () => {
  it("parses get system status into SystemStatusMetrics", () => {
    const raw = `
Version: FortiGate-200F v7.4.11,build2878,250815 (GA.M)
Firmware Signature: certified
Serial-Number: FG200FTK21004812
Hostname: FGT200F-HQ-PRI
Operation Mode: NAT
Current virtual domain: root
Current HA mode: a-p, master
Branch point: 2878
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-sys-status", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as SystemStatusMetrics;
    expect(metrics.hostname).toBe("FGT200F-HQ-PRI");
    expect(metrics.serialNumber).toBe("FG200FTK21004812");
    expect(metrics.version).toContain("FortiGate-200F v7.4.11");
    expect(metrics.buildNumber).toBe("2878");
    expect(metrics.isMatureRelease).toBe(true);
    expect(metrics.operationMode).toBe("NAT");
    expect(metrics.virtualDomain).toBe("root");
  });

  it("parses get system performance status into PerformanceMetrics", () => {
    const raw = `
CPU states: 0% user 1% system 0% nice 99% idle 0% iowait 0% irq 0% softirq
Memory: 16384000k total, 5406720k used (33%), 10977280k free (67%)
Average sessions: 1845 concurrent sessions, 42 sessions/sec
Uptime: 177 days,  14 hours,  24 minutes
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-sys-perf", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as PerformanceMetrics;
    expect(metrics.cpuUserPct).toBe(0);
    expect(metrics.cpuSystemPct).toBe(1);
    expect(metrics.cpuIdlePct).toBe(99);
    expect(metrics.totalCpuUtilizationPct).toBe(1);
    expect(metrics.memoryUtilizationPct).toBe(33);
    expect(metrics.activeSessionsCount).toBe(1845);
    expect(metrics.uptimeString).toBe("177 days,  14 hours,  24 minutes");
    expect(metrics.uptimeSeconds).toBeGreaterThan(15000000);
  });

  it("parses fnsysctl df into DiskSpaceMetrics", () => {
    const raw = `
Filesystem           1k-blocks      Used Available Use% Mounted on
none                    819200       124    819076   0% /tmp
none                   8192000    421040   7770960   5% /dev/shm
/dev/nodev             2097152    184320   1912832   9% /var/log
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-hw-disk", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as DiskSpaceMetrics;
    expect(metrics.isEquipped).toBe(true);
    expect(metrics.partitions.length).toBe(3);
    expect(metrics.highestUsedPct).toBe(9);
    expect(metrics.partitions[2].mountPoint).toBe("/var/log");
  });

  it("identifies flash-only FortiGate models without log disks as not equipped", () => {
    const flashOnlyRaw = `
Filesystem           1k-blocks      Used Available Use% Mounted on
none                    819200       124    819076   0% /tmp
none                   8192000    421040   7770960   5% /dev/shm
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-hw-disk", flashOnlyRaw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as DiskSpaceMetrics;
    expect(metrics.isEquipped).toBe(false);
    expect(metrics.statusNote).toContain("Device is not equipped with hard disk");
  });

  it("parses get system interface physical into InterfaceMetrics", () => {
    const raw = `
==[port1]
        mode: physical
        speed: 1000Mbps (Duplex: full)
        link: up
        tx_packets: 14920412
        rx_packets: 18402911
        tx_errors: 0
        rx_errors: 0
==[port2]
        mode: physical
        speed: 1000Mbps (Duplex: full)
        link: up
==[port3]
        mode: physical
        speed: auto
        link: down
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-intf-phys", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as InterfaceMetrics;
    expect(metrics.totalPorts).toBe(3);
    expect(metrics.portsInUse).toBe(2);
    expect(metrics.portsDown).toBe(1);
    expect(metrics.interfaces[0].name).toBe("port1");
    expect(metrics.interfaces[0].linkStatus).toBe("UP");
    expect(metrics.interfaces[0].duplex).toBe("FULL");
  });

  it("parses diagnose test update info contract into LicenseMetrics", () => {
    const raw = `
Contract info:
FortiCare Support:
  Contract: Valid
  Expires: 2028-04-12
Antivirus:
  Contract: Valid
  Expires: 2028-04-12
IPS:
  Contract: Valid
  Expires: 2028-04-12
Web Filtering:
  Contract: Valid
  Expires: 2028-04-12
Anti-Spam:
  Contract: Valid
  Expires: 2028-04-12
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-lic-contract", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as LicenseMetrics;
    expect(metrics.isFortiCareValid).toBe(true);
    expect(metrics.isUtmValid).toBe(true);
    expect(metrics.fortiCareSupport.status).toBe("VALID");
    expect(metrics.fortiCareSupport.expiryDate).toBe("2028-04-12");
  });

  it("parses get vpn ipsec tunnel summary into VpnMetrics", () => {
    const raw = `
'vpn_hq_dr' 10.200.1.1:0  selectors(total,up): 1/1  rx(pkt,err): 481029/0  tx(pkt,err): 512019/0
'vpn_branch_north' 10.200.2.1:0  selectors(total,up): 1/1  rx(pkt,err): 210491/0  tx(pkt,err): 230192/0
'vpn_down_peer' 10.200.3.1:0  selectors(total,up): 1/0  rx(pkt,err): 0/0  tx(pkt,err): 0/0
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-vpn-tunnel", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as VpnMetrics;
    expect(metrics.totalTunnels).toBe(3);
    expect(metrics.activeTunnels).toBe(2);
    expect(metrics.inactiveTunnels).toBe(1);
    expect(metrics.tunnels[0].name).toBe("vpn_hq_dr");
    expect(metrics.tunnels[0].status).toBe("UP");
  });

  it("parses get router info routing-table all into RoutingMetrics", () => {
    const raw = `
S*      0.0.0.0/0 [10/0] via 192.168.1.1, port1
C       10.10.0.0/24 is directly connected, port2
C       192.168.1.0/24 is directly connected, port1
S       10.20.0.0/16 [10/0] via 10.10.0.254, port2
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-route-table", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as RoutingMetrics;
    expect(metrics.hasDefaultRoute).toBe(true);
    expect(metrics.defaultGateway).toBe("192.168.1.1");
    expect(metrics.defaultInterface).toBe("port1");
    expect(metrics.totalRoutes).toBeGreaterThanOrEqual(4);
  });

  it("parses get system ha status into HaClusterMetrics", () => {
    const raw = `
HA Health Status: OK
Model: FortiGate-200F
Mode: a-p
Group: 10
Master: FGT200F-HQ-PRI, FG200FTK21004812, cluster index: 0
Slave:  FGT200F-HQ-SEC, FG200FTK21004899, cluster index: 1
Configuration status: in-sync
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-ha-status", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as HaClusterMetrics;
    expect(metrics.haMode).toBe("ACTIVE_PASSIVE");
    expect(metrics.isCluster).toBe(true);
    expect(metrics.isSynchronized).toBe(true);
    expect(metrics.members.length).toBe(2);
    expect(metrics.members[0].hostname).toBe("FGT200F-HQ-PRI");
    expect(metrics.members[0].role).toBe("MASTER");
  });

  it("parses diagnose sys ntp status into NtpMetrics", () => {
    const raw = `
synchronized: yes, stratum 2, offset 0.001241, jitter 0.000412
server: 208.91.112.63, stratum 1, reach 377, delay 0.014201
time zone: GMT+8 (Asia/Kuala_Lumpur)
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-ntp-status", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as NtpMetrics;
    expect(metrics.isSynchronized).toBe(true);
    expect(metrics.stratum).toBe(2);
    expect(metrics.activeServer).toBe("208.91.112.63");
    expect(metrics.timezone).toContain("GMT+8");
  });

  it("parses execute ping 8.8.8.8 into ConnectivityMetrics", () => {
    const raw = `
PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=118 time=4.2 ms
--- 8.8.8.8 ping statistics ---
5 packets transmitted, 5 packets received, 0% packet loss
round-trip min/avg/max = 4.1/4.18/4.3 ms
`;
    const result = fortiGateParser.parseCommandOutput("cmd-fg-ping-internet", raw);

    expect(result.parseStatus).toBe("SUCCESS");
    const metrics = result.metrics as ConnectivityMetrics;
    expect(metrics.transmitted).toBe(5);
    expect(metrics.received).toBe(5);
    expect(metrics.packetLossPct).toBe(0);
    expect(metrics.isReachable).toBe(true);
    expect(metrics.rttAvgMs).toBe(4.18);
  });

  it("handles empty output and unsupported command safely", () => {
    const emptyResult = fortiGateParser.parseCommandOutput("cmd-fg-sys-status", "");
    expect(emptyResult.parseStatus).toBe("EMPTY");

    const unsupportedResult = fortiGateParser.parseCommandOutput(
      "cmd-unknown",
      "some random output"
    );
    expect(unsupportedResult.parseStatus).toBe("UNSUPPORTED");
  });
});
