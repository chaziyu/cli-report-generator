import { describe, it, expect } from "vitest";
import { FORTIGATE_RULES } from "@/vendors/fortigate/rules";
import { FORTIGATE_CHECKLIST } from "@/vendors/fortigate/checklist";
import {
  DiskSpaceMetrics,
  PerformanceMetrics,
  InterfaceMetrics,
  LicenseMetrics,
  SystemStatusMetrics,
  VpnMetrics,
  RoutingMetrics,
  SignaturesMetrics,
  NtpMetrics,
  ConnectivityMetrics,
  HaClusterMetrics,
  LogManagerMetrics,
} from "@/core/checks/types";

describe("Phase 10: FortiGate Telemetry Accuracy & Rule Determinism", () => {
  // ---------------------------------------------------------------------------
  // Checklist Completeness Verification (All 21 CTC QMS-P09-F01 v1.1 checks)
  // ---------------------------------------------------------------------------
  it("defines all 21 checklist items matching the approved CTC checklist", () => {
    expect(FORTIGATE_CHECKLIST.length).toBe(21);

    const checkIds = FORTIGATE_CHECKLIST.map((c) => c.id);
    const expectedIds = [
      "fg-hw-disk",
      "fg-hw-cpu",
      "fg-hw-mem",
      "fg-hw-interface",
      "fg-lic-forticare",
      "fg-lic-utm",
      "fg-fw-version",
      "fg-life-ffr",
      "fg-life-eos",
      "fg-vpn-tunnel",
      "fg-net-routing",
      "fg-sys-uptime",
      "fg-mgmt-gui",
      "fg-mgmt-cli",
      "fg-sec-signatures",
      "fg-sys-ntp",
      "fg-net-connectivity",
      "fg-sys-ha",
      "fg-sys-log",
      "fg-sys-faz",
      "fg-sys-backup",
    ];

    for (const id of expectedIds) {
      expect(checkIds).toContain(id);
      expect(FORTIGATE_RULES[id]).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Section 1: Hardware Status Rules
  // ---------------------------------------------------------------------------
  describe("Section 1: Hardware Status", () => {
    it("fg-hw-disk: evaluates diskless models as NA, < 80% as PASS, >= 80% as FAIL", () => {
      const rule = FORTIGATE_RULES["fg-hw-disk"];

      // Missing evidence
      const missing = rule(undefined, { hasExecution: false });
      expect(missing.collectionState).toBe("MISSING");
      expect(missing.evaluationStatus).toBe("PENDING");
      expect(missing.reviewRequired).toBe(true);

      // Diskless model (flash storage)
      const diskless: DiskSpaceMetrics = { isEquipped: false, partitions: [], highestUsedPct: 0 };
      const naRes = rule(diskless, { hasExecution: true });
      expect(naRes.collectionState).toBe("COMPLETE");
      expect(naRes.evaluationStatus).toBe("NA");
      expect(naRes.reviewRequired).toBe(false);

      // Healthy disk (79% < 80%)
      const healthy: DiskSpaceMetrics = { isEquipped: true, partitions: [], highestUsedPct: 79 };
      const passRes = rule(healthy, { hasExecution: true });
      expect(passRes.collectionState).toBe("COMPLETE");
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      // Failing disk (80% boundary)
      const boundary: DiskSpaceMetrics = { isEquipped: true, partitions: [], highestUsedPct: 80 };
      const failRes = rule(boundary, { hasExecution: true });
      expect(failRes.collectionState).toBe("COMPLETE");
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-hw-cpu: distinguishes instantaneous snapshots (REVIEW) from historical average (PASS/FAIL)", () => {
      const rule = FORTIGATE_RULES["fg-hw-cpu"];

      // Instantaneous < 80%: must be REVIEW because point-in-time does not prove 1-hour sustained compliance
      const instLow: PerformanceMetrics = {
        cpuUserPct: 1,
        cpuSystemPct: 2,
        cpuIdlePct: 97,
        totalCpuUtilizationPct: 3,
        memoryTotalBytes: 16384000,
        memoryUsedBytes: 5406720,
        memoryFreeBytes: 10977280,
        memoryUtilizationPct: 33,
      };
      const instLowRes = rule(instLow, { hasExecution: true });
      expect(instLowRes.collectionState).toBe("COMPLETE");
      expect(instLowRes.evaluationStatus).toBe("REVIEW");
      expect(instLowRes.reviewRequired).toBe(true);

      // Historical average < 80%: PASS
      const histLow: PerformanceMetrics = { ...instLow, isHistoricalAverage: true };
      const histPassRes = rule(histLow, { hasExecution: true });
      expect(histPassRes.collectionState).toBe("COMPLETE");
      expect(histPassRes.evaluationStatus).toBe("PASS");
      expect(histPassRes.reviewRequired).toBe(false);

      // Instantaneous or historical >= 80%: FAIL
      const highCpu: PerformanceMetrics = { ...instLow, totalCpuUtilizationPct: 85 };
      const failRes = rule(highCpu, { hasExecution: true });
      expect(failRes.collectionState).toBe("COMPLETE");
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-hw-mem: distinguishes instantaneous snapshots (REVIEW) from historical average (PASS/FAIL)", () => {
      const rule = FORTIGATE_RULES["fg-hw-mem"];

      const instLow: PerformanceMetrics = {
        cpuUserPct: 1,
        cpuSystemPct: 2,
        cpuIdlePct: 97,
        totalCpuUtilizationPct: 3,
        memoryTotalBytes: 16384000,
        memoryUsedBytes: 4915200,
        memoryFreeBytes: 11468800,
        memoryUtilizationPct: 30,
      };
      const instRes = rule(instLow, { hasExecution: true });
      expect(instRes.collectionState).toBe("COMPLETE");
      expect(instRes.evaluationStatus).toBe("REVIEW");
      expect(instRes.reviewRequired).toBe(true);

      const histLow: PerformanceMetrics = { ...instLow, isHistoricalAverage: true };
      const histPassRes = rule(histLow, { hasExecution: true });
      expect(histPassRes.collectionState).toBe("COMPLETE");
      expect(histPassRes.evaluationStatus).toBe("PASS");
      expect(histPassRes.reviewRequired).toBe(false);

      const highMem: PerformanceMetrics = { ...instLow, memoryUtilizationPct: 88 };
      const failRes = rule(highMem, { hasExecution: true });
      expect(failRes.collectionState).toBe("COMPLETE");
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-hw-interface: evaluates 0 errors as PASS and active packet/CRC errors as WARNING", () => {
      const rule = FORTIGATE_RULES["fg-hw-interface"];

      const cleanIntf: InterfaceMetrics = {
        totalPorts: 2,
        portsDown: 0,
        portsInUse: 2,
        interfaces: [
          { name: "port1", linkStatus: "UP", txPackets: 100, rxPackets: 100, txErrors: 0, rxErrors: 0 },
          { name: "port2", linkStatus: "UP", txPackets: 100, rxPackets: 100, txErrors: 0, rxErrors: 0 },
        ],
      };
      const cleanRes = rule(cleanIntf, { hasExecution: true });
      expect(cleanRes.collectionState).toBe("COMPLETE");
      expect(cleanRes.evaluationStatus).toBe("PASS");
      expect(cleanRes.reviewRequired).toBe(false);

      const errorIntf: InterfaceMetrics = {
        totalPorts: 1,
        portsDown: 0,
        portsInUse: 1,
        interfaces: [
          { name: "port1", linkStatus: "UP", txPackets: 100, rxPackets: 100, txErrors: 5, rxErrors: 0 },
        ],
      };
      const warnRes = rule(errorIntf, { hasExecution: true });
      expect(warnRes.collectionState).toBe("COMPLETE");
      expect(warnRes.evaluationStatus).toBe("WARNING");
      expect(warnRes.reviewRequired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Section 2: Product Licensing Rules
  // ---------------------------------------------------------------------------
  describe("Section 2: Product Licensing", () => {
    it("fg-lic-forticare: evaluates >30 days as PASS, <=30 days as WARNING, expired as FAIL", () => {
      const rule = FORTIGATE_RULES["fg-lic-forticare"];

      // > 30 days: PASS
      const validLic: LicenseMetrics = {
        isFortiCareValid: true,
        isUtmValid: true,
        fortiCareSupport: { name: "FortiCare Support", status: "VALID", expiryDate: "2028-04-12", daysRemaining: 600 },
      };
      const passRes = rule(validLic, { hasExecution: true });
      expect(passRes.collectionState).toBe("COMPLETE");
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      // <= 30 days: WARNING
      const expiringLic: LicenseMetrics = {
        isFortiCareValid: true,
        isUtmValid: true,
        fortiCareSupport: { name: "FortiCare Support", status: "VALID", expiryDate: "2026-09-01", daysRemaining: 15 },
      };
      const warnRes = rule(expiringLic, { hasExecution: true });
      expect(warnRes.collectionState).toBe("COMPLETE");
      expect(warnRes.evaluationStatus).toBe("WARNING");
      expect(warnRes.reviewRequired).toBe(true);

      // Expired: FAIL
      const expiredLic: LicenseMetrics = {
        isFortiCareValid: false,
        isUtmValid: false,
        fortiCareSupport: { name: "FortiCare Support", status: "EXPIRED", expiryDate: "2026-01-01", daysRemaining: -20 },
      };
      const failRes = rule(expiredLic, { hasExecution: true });
      expect(failRes.collectionState).toBe("COMPLETE");
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-lic-utm: evaluates all UTM features valid as PASS and inactive/expired as WARNING", () => {
      const rule = FORTIGATE_RULES["fg-lic-utm"];

      const validUtm: LicenseMetrics = {
        isFortiCareValid: true,
        isUtmValid: true,
        fortiCareSupport: { name: "FortiCare Support", status: "VALID" },
      };
      const passRes = rule(validUtm, { hasExecution: true });
      expect(passRes.collectionState).toBe("COMPLETE");
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const invalidUtm: LicenseMetrics = {
        isFortiCareValid: true,
        isUtmValid: false,
        fortiCareSupport: { name: "FortiCare Support", status: "VALID" },
        antivirus: { name: "Antivirus", status: "EXPIRED" },
      };
      const warnRes = rule(invalidUtm, { hasExecution: true });
      expect(warnRes.collectionState).toBe("COMPLETE");
      expect(warnRes.evaluationStatus).toBe("WARNING");
      expect(warnRes.reviewRequired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Section 3: Product Life Cycle
  // ---------------------------------------------------------------------------
  describe("Section 3: Product Life Cycle", () => {
    it("fg-fw-version: evaluates mature releases as PASS and non-mature as REVIEW", () => {
      const rule = FORTIGATE_RULES["fg-fw-version"];

      const matureSys: SystemStatusMetrics = {
        hostname: "FGT200F",
        version: "v7.4.11,build2878",
        serialNumber: "FG200FTK21004812",
        isMatureRelease: true,
      };
      const passRes = rule(matureSys, { hasExecution: true });
      expect(passRes.collectionState).toBe("COMPLETE");
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const nonMatureSys: SystemStatusMetrics = {
        ...matureSys,
        version: "v7.6.0,build0100",
        isMatureRelease: false,
      };
      const revRes = rule(nonMatureSys, { hasExecution: true });
      expect(revRes.collectionState).toBe("COMPLETE");
      expect(revRes.evaluationStatus).toBe("REVIEW");
      expect(revRes.reviewRequired).toBe(true);
    });

    it("fg-life-ffr and fg-life-eos: evaluated as UNSUPPORTED and REVIEW (external portal lookup)", () => {
      const ffrRes = FORTIGATE_RULES["fg-life-ffr"](undefined);
      expect(ffrRes.collectionState).toBe("UNSUPPORTED");
      expect(ffrRes.evaluationStatus).toBe("REVIEW");
      expect(ffrRes.reviewRequired).toBe(true);

      const eosRes = FORTIGATE_RULES["fg-life-eos"](undefined);
      expect(eosRes.collectionState).toBe("UNSUPPORTED");
      expect(eosRes.evaluationStatus).toBe("REVIEW");
      expect(eosRes.reviewRequired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Section 4 & 5: VPN & Routing Status
  // ---------------------------------------------------------------------------
  describe("Section 4 & 5: VPN & Routing", () => {
    it("fg-vpn-tunnel: evaluates 0 tunnels as NA, all up as PASS, inactive tunnels as WARNING", () => {
      const rule = FORTIGATE_RULES["fg-vpn-tunnel"];

      const zeroVpn: VpnMetrics = { totalTunnels: 0, activeTunnels: 0, inactiveTunnels: 0, tunnels: [] };
      const naRes = rule(zeroVpn, { hasExecution: true });
      expect(naRes.evaluationStatus).toBe("NA");
      expect(naRes.collectionState).toBe("COMPLETE");

      const allUpVpn: VpnMetrics = { totalTunnels: 4, activeTunnels: 4, inactiveTunnels: 0, tunnels: [] };
      const passRes = rule(allUpVpn, { hasExecution: true });
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const hasDownVpn: VpnMetrics = { totalTunnels: 4, activeTunnels: 3, inactiveTunnels: 1, tunnels: [] };
      const warnRes = rule(hasDownVpn, { hasExecution: true });
      expect(warnRes.evaluationStatus).toBe("WARNING");
      expect(warnRes.reviewRequired).toBe(true);
    });

    it("fg-net-routing: evaluates active default route as PASS and missing default route as FAIL", () => {
      const rule = FORTIGATE_RULES["fg-net-routing"];

      const passRoute: RoutingMetrics = {
        hasDefaultRoute: true,
        defaultGateway: "192.168.1.1",
        defaultInterface: "port1",
        totalRoutes: 12,
        routes: [],
      };
      const passRes = rule(passRoute, { hasExecution: true });
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const failRoute: RoutingMetrics = {
        hasDefaultRoute: false,
        totalRoutes: 5,
        routes: [],
      };
      const failRes = rule(failRoute, { hasExecution: true });
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Section 6: Configuration & HA
  // ---------------------------------------------------------------------------
  describe("Section 6: Configuration & HA", () => {
    it("fg-sys-ha: evaluates standalone as NA, synchronized cluster as PASS, out-of-sync as FAIL", () => {
      const rule = FORTIGATE_RULES["fg-sys-ha"];

      const standalone: HaClusterMetrics = {
        isCluster: false,
        haMode: "STANDALONE",
        isSynchronized: false,
        members: [],
      };
      const naRes = rule(standalone, { hasExecution: true });
      expect(naRes.evaluationStatus).toBe("NA");
      expect(naRes.reviewRequired).toBe(false);

      const syncedCluster: HaClusterMetrics = {
        isCluster: true,
        haMode: "ACTIVE_PASSIVE",
        isSynchronized: true,
        members: [
          { hostname: "FGT200F-HQ-PRI", serialNumber: "FG200F01", role: "MASTER" },
          { hostname: "FGT200F-HQ-SEC", serialNumber: "FG200F02", role: "SLAVE" },
        ],
      };
      const passRes = rule(syncedCluster, { hasExecution: true });
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const outOfSyncCluster: HaClusterMetrics = {
        ...syncedCluster,
        isSynchronized: false,
      };
      const failRes = rule(outOfSyncCluster, { hasExecution: true });
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-sys-ntp: evaluates NTP synchronized as PASS and unsynchronized as FAIL", () => {
      const rule = FORTIGATE_RULES["fg-sys-ntp"];

      const syncedNtp: NtpMetrics = {
        isSynchronized: true,
        activeServer: "208.91.112.63",
        timezone: "GMT+8 (Asia/Kuala_Lumpur)",
      };
      const passRes = rule(syncedNtp, { hasExecution: true });
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const unSyncedNtp: NtpMetrics = { isSynchronized: false };
      const failRes = rule(unSyncedNtp, { hasExecution: true });
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-net-connectivity: evaluates 0% packet loss as PASS and >0% packet loss as FAIL", () => {
      const rule = FORTIGATE_RULES["fg-net-connectivity"];

      const zeroLoss: ConnectivityMetrics = {
        target: "8.8.8.8",
        transmitted: 5,
        received: 5,
        packetLossPct: 0,
        isReachable: true,
        rttAvgMs: 4.18,
      };
      const passRes = rule(zeroLoss, { hasExecution: true });
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const lossConn: ConnectivityMetrics = {
        ...zeroLoss,
        received: 3,
        packetLossPct: 40,
      };
      const failRes = rule(lossConn, { hasExecution: true });
      expect(failRes.evaluationStatus).toBe("FAIL");
      expect(failRes.reviewRequired).toBe(true);
    });

    it("fg-sys-faz: evaluates connected FortiAnalyzer as PASS and unconfigured as NA", () => {
      const rule = FORTIGATE_RULES["fg-sys-faz"];

      const connectedFaz: LogManagerMetrics = {
        connectionState: "CONNECTED",
        sslHandshakeOk: true,
        targetIp: "10.10.10.50",
      };
      const passRes = rule(connectedFaz, { hasExecution: true });
      expect(passRes.evaluationStatus).toBe("PASS");
      expect(passRes.reviewRequired).toBe(false);

      const notConfiguredFaz: LogManagerMetrics = {
        connectionState: "UNCONFIGURED",
        sslHandshakeOk: false,
      };
      const naRes = rule(notConfiguredFaz, { hasExecution: true });
      expect(naRes.evaluationStatus).toBe("NA");
      expect(naRes.reviewRequired).toBe(false);
    });

    it("manual checks (fg-mgmt-gui, fg-sys-backup): evaluated as UNSUPPORTED / REVIEW", () => {
      const guiRes = FORTIGATE_RULES["fg-mgmt-gui"](undefined);
      expect(guiRes.collectionState).toBe("UNSUPPORTED");
      expect(guiRes.evaluationStatus).toBe("REVIEW");
      expect(guiRes.reviewRequired).toBe(true);

      const backupRes = FORTIGATE_RULES["fg-sys-backup"](undefined);
      expect(backupRes.collectionState).toBe("UNSUPPORTED");
      expect(backupRes.evaluationStatus).toBe("REVIEW");
      expect(backupRes.reviewRequired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Status & State Separation Integrity
  // ---------------------------------------------------------------------------
  describe("Evaluation Status vs Collection State Separation", () => {
    it("ensures missing executions never produce PASS", () => {
      for (const [checkId, rule] of Object.entries(FORTIGATE_RULES)) {
        if (checkId === "fg-life-ffr" || checkId === "fg-life-eos" || checkId === "fg-mgmt-gui" || checkId === "fg-sys-backup") {
          // Manual review items return UNSUPPORTED / REVIEW
          const res = rule(undefined);
          expect(res.evaluationStatus).not.toBe("PASS");
        } else {
          // Automated CLI checks with hasExecution: false return MISSING / PENDING
          const res = rule(undefined, { hasExecution: false });
          expect(res.collectionState).toBe("MISSING");
          expect(res.evaluationStatus).toBe("PENDING");
          expect(res.evaluationStatus).not.toBe("PASS");
          expect(res.reviewRequired).toBe(true);
        }
      }
    });
  });
});
