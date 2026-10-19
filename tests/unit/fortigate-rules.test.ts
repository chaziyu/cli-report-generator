import { describe, it, expect } from "vitest";
import { FORTIGATE_RULES } from "@/vendors/fortigate/rules";
import {
  DiskSpaceMetrics,
  PerformanceMetrics,
  LicenseMetrics,
  HaClusterMetrics,
  NtpMetrics,
  ConnectivityMetrics,
  InterfaceMetrics,
} from "@/core/checks/types";

describe("FortiGate Deterministic PM Rules", () => {
  describe("Rule: fg-hw-disk (Hard disk space)", () => {
    const rule = FORTIGATE_RULES["fg-hw-disk"];

    it("returns PENDING and reviewRequired when execution or metrics are missing", () => {
      const res = rule(undefined, { hasExecution: false });
      expect(res.evaluationStatus).toBe("PENDING");
      expect(res.collectionState).toBe("MISSING");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("Evidence missing");
    });

    it("evaluates diskless models (flash-only) as NA, not FAIL", () => {
      const metrics: DiskSpaceMetrics = {
        isEquipped: false,
        partitions: [],
        highestUsedPct: 0,
      };
      const res = rule(metrics, { hasExecution: true, rawOutput: "No hard disk" });
      expect(res.evaluationStatus).toBe("NA");
      expect(res.collectionState).toBe("COMPLETE");
      expect(res.currentValue).toBe("N/A");
      expect(res.reviewRequired).toBe(false);
      expect(res.remarks).toContain("flash storage only");
    });

    it("evaluates disk usage under 80% (79%) as PASS", () => {
      const metrics: DiskSpaceMetrics = {
        isEquipped: true,
        partitions: [
          {
            filesystem: "/dev/root",
            total1kBlocks: 30000000,
            used1kBlocks: 23700000,
            available1kBlocks: 6300000,
            usedPct: 79,
            mountPoint: "/var/log",
          },
        ],
        highestUsedPct: 79,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.reviewRequired).toBe(false);
      expect(res.currentValue).toBe("79%");
    });

    it("evaluates disk usage at boundary (80%) as FAIL with reviewRequired", () => {
      const metrics: DiskSpaceMetrics = {
        isEquipped: true,
        partitions: [
          {
            filesystem: "/dev/root",
            total1kBlocks: 30000000,
            used1kBlocks: 24000000,
            available1kBlocks: 6000000,
            usedPct: 80,
            mountPoint: "/var/log",
          },
        ],
        highestUsedPct: 80,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
      expect(res.currentValue).toBe("80%");
      expect(res.remarks).toContain("exceeds 80% threshold");
    });
  });

  describe("Rule: fg-hw-cpu (CPU Usage snapshot)", () => {
    const rule = FORTIGATE_RULES["fg-hw-cpu"];

    it("evaluates instantaneous CPU < 80% (79%) as REVIEW (insufficient historical evidence) with reviewRequired: true", () => {
      const metrics: PerformanceMetrics = {
        cpuUserPct: 50,
        cpuSystemPct: 29,
        cpuIdlePct: 21,
        totalCpuUtilizationPct: 79,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 819200,
        memoryFreeBytes: 1228800,
        memoryUtilizationPct: 40,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("79%");
      expect(res.currentValue).toContain("79%");
    });

    it("evaluates historical average CPU < 80% as PASS with reviewRequired: false", () => {
      const metrics: PerformanceMetrics = {
        cpuUserPct: 20,
        cpuSystemPct: 15,
        cpuIdlePct: 65,
        totalCpuUtilizationPct: 35,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 819200,
        memoryFreeBytes: 1228800,
        memoryUtilizationPct: 40,
        isHistoricalAverage: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.reviewRequired).toBe(false);
      expect(res.remarks).toContain("35%");
    });

    it("evaluates multiple instantaneous CPU observations preserving readings without invented timestamps", () => {
      const metrics1: PerformanceMetrics = {
        cpuUserPct: 10,
        cpuSystemPct: 10,
        cpuIdlePct: 80,
        totalCpuUtilizationPct: 20,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 819200,
        memoryFreeBytes: 1228800,
        memoryUtilizationPct: 40,
      };
      const metrics2: PerformanceMetrics = {
        cpuUserPct: 20,
        cpuSystemPct: 15,
        cpuIdlePct: 65,
        totalCpuUtilizationPct: 35,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 819200,
        memoryFreeBytes: 1228800,
        memoryUtilizationPct: 40,
      };
      const res = rule(metrics1, {
        hasExecution: true,
        allMetrics: [metrics1, metrics2],
      });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.reviewRequired).toBe(true);
      expect(res.currentValue).toContain("20%");
      expect(res.currentValue).toContain("35%");
      expect(res.remarks).toContain("Captured 2 instantaneous CPU observations");
    });

    it("evaluates CPU >= 80% (80%) as FAIL with reviewRequired", () => {
      const metrics: PerformanceMetrics = {
        cpuUserPct: 60,
        cpuSystemPct: 20,
        cpuIdlePct: 20,
        totalCpuUtilizationPct: 80,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 819200,
        memoryFreeBytes: 1228800,
        memoryUtilizationPct: 40,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
      expect(res.currentValue).toContain("80%");
    });

    it("returns PENDING if execution missing", () => {
      const res = rule(undefined, { hasExecution: false });
      expect(res.evaluationStatus).toBe("PENDING");
      expect(res.collectionState).toBe("MISSING");
    });
  });

  describe("Rule: fg-hw-mem (Memory Usage)", () => {
    const rule = FORTIGATE_RULES["fg-hw-mem"];

    it("evaluates instantaneous Memory < 80% (45%) as REVIEW (insufficient historical evidence) with reviewRequired: true", () => {
      const metrics: PerformanceMetrics = {
        cpuUserPct: 10,
        cpuSystemPct: 5,
        cpuIdlePct: 85,
        totalCpuUtilizationPct: 15,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 921600,
        memoryFreeBytes: 1126400,
        memoryUtilizationPct: 45,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.reviewRequired).toBe(true);
      expect(res.currentValue).toContain("45%");
    });

    it("evaluates historical average Memory < 80% as PASS", () => {
      const metrics: PerformanceMetrics = {
        cpuUserPct: 10,
        cpuSystemPct: 5,
        cpuIdlePct: 85,
        totalCpuUtilizationPct: 15,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 921600,
        memoryFreeBytes: 1126400,
        memoryUtilizationPct: 45,
        isHistoricalAverage: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.reviewRequired).toBe(false);
      expect(res.currentValue).toContain("45%");
    });

    it("evaluates Memory >= 80% (80%) as FAIL", () => {
      const metrics: PerformanceMetrics = {
        cpuUserPct: 10,
        cpuSystemPct: 5,
        cpuIdlePct: 85,
        totalCpuUtilizationPct: 15,
        memoryTotalBytes: 2048000,
        memoryUsedBytes: 1638400,
        memoryFreeBytes: 409600,
        memoryUtilizationPct: 80,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
    });
  });

  describe("Rule: fg-lic-forticare (FortiCare Support)", () => {
    const rule = FORTIGATE_RULES["fg-lic-forticare"];

    it("evaluates license valid with > 30 days remaining (31 days) as PASS", () => {
      const metrics: LicenseMetrics = {
        fortiCareSupport: {
          name: "FortiCare Support",
          status: "VALID",
          expiryDate: "2027-05-15",
          daysRemaining: 31,
        },
        isFortiCareValid: true,
        isUtmValid: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.reviewRequired).toBe(false);
      expect(res.currentValue).toContain("Valid");
    });

    it("evaluates license valid with <= 30 days (30 days) as WARNING", () => {
      const metrics: LicenseMetrics = {
        fortiCareSupport: {
          name: "FortiCare Support",
          status: "VALID",
          expiryDate: "2026-11-15",
          daysRemaining: 30,
        },
        isFortiCareValid: true,
        isUtmValid: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("WARNING");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("30 days remaining");
    });

    it("evaluates expired license as FAIL", () => {
      const metrics: LicenseMetrics = {
        fortiCareSupport: {
          name: "FortiCare Support",
          status: "EXPIRED",
          expiryDate: "2026-10-01",
          daysRemaining: -15,
        },
        isFortiCareValid: false,
        isUtmValid: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
    });
  });

  describe("Rule: fg-sys-ha (HA Cluster Status)", () => {
    const rule = FORTIGATE_RULES["fg-sys-ha"];

    it("evaluates Standalone HA as NA", () => {
      const metrics: HaClusterMetrics = {
        haMode: "STANDALONE",
        isCluster: false,
        isSynchronized: true,
        members: [
          {
            hostname: "FW-01",
            serialNumber: "FG100E00000001",
            role: "STANDALONE",
          },
        ],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("NA");
      expect(res.remarks).toContain("standalone firewall");
      expect(res.reviewRequired).toBe(false);
    });

    it("evaluates synchronized Active-Passive cluster as PASS", () => {
      const metrics: HaClusterMetrics = {
        haMode: "ACTIVE_PASSIVE",
        isCluster: true,
        isSynchronized: true,
        members: [
          {
            hostname: "FW-01",
            serialNumber: "FG100E00000001",
            role: "MASTER",
          },
          {
            hostname: "FW-02",
            serialNumber: "FG100E00000002",
            role: "SLAVE",
          },
        ],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.currentValue).toContain("in-sync");
      expect(res.reviewRequired).toBe(false);
    });

    it("evaluates unsynchronized cluster as FAIL", () => {
      const metrics: HaClusterMetrics = {
        haMode: "ACTIVE_PASSIVE",
        isCluster: true,
        isSynchronized: false,
        members: [
          {
            hostname: "FW-01",
            serialNumber: "FG100E00000001",
            role: "MASTER",
          },
        ],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("OUT-OF-SYNC");
    });
  });

  describe("Rule: fg-sys-ntp (NTP Date & Time)", () => {
    const rule = FORTIGATE_RULES["fg-sys-ntp"];

    it("evaluates synchronized NTP server as PASS", () => {
      const metrics: NtpMetrics = {
        isSynchronized: true,
        activeServer: "208.91.112.53",
        stratum: 2,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.reviewRequired).toBe(false);
      expect(res.currentValue).toContain("Synchronized");
    });

    it("evaluates unsynchronized NTP as FAIL", () => {
      const metrics: NtpMetrics = {
        isSynchronized: false,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
    });
  });

  describe("Rule: fg-net-connectivity (Internet Access Ping)", () => {
    const rule = FORTIGATE_RULES["fg-net-connectivity"];

    it("evaluates 0% packet loss as PASS", () => {
      const metrics: ConnectivityMetrics = {
        target: "8.8.8.8",
        transmitted: 5,
        received: 5,
        packetLossPct: 0,
        isReachable: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.currentValue).toContain("0% packet loss");
      expect(res.reviewRequired).toBe(false);
    });

    it("evaluates > 0% packet loss (20%) as FAIL", () => {
      const metrics: ConnectivityMetrics = {
        target: "8.8.8.8",
        transmitted: 5,
        received: 4,
        packetLossPct: 20,
        isReachable: true,
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.currentValue).toContain("20% packet loss");
      expect(res.reviewRequired).toBe(true);
    });
  });

  describe("Rule: fg-life-ffr (External Reference / Lifecycle)", () => {
    const rule = FORTIGATE_RULES["fg-life-ffr"];

    it("evaluates manual lifecycle check as REVIEW with UNSUPPORTED state", () => {
      const res = rule(undefined, { hasExecution: false });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.collectionState).toBe("UNSUPPORTED");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("Product Life Cycle portal");
    });
  });

  describe("Rule: fg-hw-interface (Interface Monitoring)", () => {
    const rule = FORTIGATE_RULES["fg-hw-interface"];

    it("evaluates 0 errors and operational ports as PASS", () => {
      const metrics: InterfaceMetrics = {
        totalPorts: 4,
        portsInUse: 4,
        portsDown: 0,
        interfaces: [
          { name: "port1", linkStatus: "UP", txErrors: 0, rxErrors: 0 },
          { name: "port2", linkStatus: "UP", txErrors: 0, rxErrors: 0 },
        ],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.currentValue).toContain("4 port(s)");
    });

    it("evaluates errors > 0 as WARNING", () => {
      const metrics: InterfaceMetrics = {
        totalPorts: 4,
        portsInUse: 4,
        portsDown: 0,
        interfaces: [
          { name: "port1", linkStatus: "UP", txErrors: 12, rxErrors: 0 },
        ],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("WARNING");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("errors detected");
    });

    it("evaluates 0 parsed interfaces as REVIEW requiring engineer check", () => {
      const metrics: InterfaceMetrics = {
        totalPorts: 0,
        portsInUse: 0,
        portsDown: 0,
        interfaces: [],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("Physical interface metrics could not be parsed");
    });
  });

  describe("Rule: fg-sys-uptime (Uptime and reboot detection)", () => {
    const rule = FORTIGATE_RULES["fg-sys-uptime"];

    it("evaluates recent reboot (< 24 hours) as REVIEW", () => {
      const metrics = {
        uptimeSeconds: 3600, // 1 hour
        uptimeString: "1 hour, 0 minutes",
      } as PerformanceMetrics;
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("uptime is short");
    });

    it("evaluates uptime > 24 hours as PASS", () => {
      const metrics = {
        uptimeSeconds: 86400 * 10,
        uptimeString: "10 days",
      } as PerformanceMetrics;
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("PASS");
      expect(res.reviewRequired).toBe(false);
    });
  });

  describe("Rule: fg-sys-ha (HA Cluster Status)", () => {
    const rule = FORTIGATE_RULES["fg-sys-ha"];

    it("evaluates unknown HA mode as REVIEW requiring engineer verification", () => {
      const metrics: HaClusterMetrics = {
        haMode: "UNKNOWN",
        isCluster: false,
        isSynchronized: false,
        members: [],
      };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("REVIEW");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("High Availability mode could not be determined");
    });
  });

  describe("Rule: fg-sys-faz (FortiAnalyzer Logging)", () => {
    const rule = FORTIGATE_RULES["fg-sys-faz"];

    it("evaluates unconfigured FortiAnalyzer as NA", () => {
      const metrics = { connectionState: "UNCONFIGURED" as const, sslHandshakeOk: false };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("NA");
      expect(res.reviewRequired).toBe(false);
      expect(res.remarks).toContain("not configured");
    });

    it("evaluates unreachable FortiAnalyzer as FAIL with reviewRequired", () => {
      const metrics = { connectionState: "UNREACHABLE" as const, targetIp: "10.0.0.1", sslHandshakeOk: false };
      const res = rule(metrics, { hasExecution: true });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("unreachable");
    });
  });

  describe("Rule: fg-sys-log (System Event Logging)", () => {
    const rule = FORTIGATE_RULES["fg-sys-log"];

    it("evaluates crash/panic keywords as WARNING", () => {
      const raw = `date=2026-10-10 logid="0100022001" msg="System entered conserve mode"`;
      const res = rule(undefined, { hasExecution: true, rawOutput: raw });
      expect(res.evaluationStatus).toBe("WARNING");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("Critical system event logs");
    });
  });

  describe("Rule: fg-mgmt-cli (CLI Accessibility)", () => {
    const rule = FORTIGATE_RULES["fg-mgmt-cli"];

    it("evaluates failed command executions as FAIL", () => {
      const res = rule(undefined, {
        hasExecution: true,
        hasFailedExecution: true,
        executions: [
          { commandId: "cmd-1", parseStatus: "FAILED" },
          { commandId: "cmd-2", parseStatus: "FAILED" },
        ],
      });
      expect(res.evaluationStatus).toBe("FAIL");
      expect(res.reviewRequired).toBe(true);
      expect(res.remarks).toContain("execution errors");
    });
  });
});
