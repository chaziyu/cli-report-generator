import { VendorId, CollectionState, CheckStatus } from "@/vendors/types";

// ============================================================================
// Vendor-Independent Logical Metric Contracts
// ============================================================================

export interface SystemStatusMetrics {
  hostname?: string;
  version?: string;
  buildNumber?: string;
  serialNumber?: string;
  operationMode?: string;
  virtualDomain?: string;
  haMode?: string;
  isMatureRelease?: boolean;
}

export interface PerformanceMetrics {
  cpuUserPct: number;
  cpuSystemPct: number;
  cpuIdlePct: number;
  totalCpuUtilizationPct: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryFreeBytes: number;
  memoryUtilizationPct: number;
  activeSessionsCount?: number;
  uptimeSeconds?: number;
  uptimeString?: string;
  isHistoricalAverage?: boolean;
  measurementPeriod?: string;
  isCpuParsed?: boolean;
  isMemoryParsed?: boolean;
}

export interface DiskPartitionMetric {
  filesystem: string;
  total1kBlocks: number;
  used1kBlocks: number;
  available1kBlocks: number;
  usedPct: number;
  mountPoint: string;
}

export interface DiskSpaceMetrics {
  isEquipped: boolean;
  partitions: DiskPartitionMetric[];
  highestUsedPct: number;
  statusNote?: string;
}

export interface PhysicalInterfaceMetric {
  name: string;
  linkStatus: "UP" | "DOWN" | "UNKNOWN";
  speed?: string;
  duplex?: "FULL" | "HALF" | "AUTO" | "UNKNOWN";
  txPackets?: number;
  rxPackets?: number;
  txErrors?: number;
  rxErrors?: number;
}

export interface InterfaceMetrics {
  interfaces: PhysicalInterfaceMetric[];
  totalPorts: number;
  portsInUse: number;
  portsDown: number;
}

export interface LicenseFeatureContract {
  name: string;
  status: "VALID" | "EXPIRED" | "UNAVAILABLE" | "NOT_SUBSCRIBED";
  expiryDate?: string;
  daysRemaining?: number;
}

export interface LicenseMetrics {
  fortiCareSupport: LicenseFeatureContract;
  antivirus?: LicenseFeatureContract;
  ips?: LicenseFeatureContract;
  webFiltering?: LicenseFeatureContract;
  antiSpam?: LicenseFeatureContract;
  industrialSecurity?: LicenseFeatureContract;
  isFortiCareValid: boolean;
  isUtmValid: boolean;
}

export interface VpnTunnelSummary {
  name: string;
  peerIp?: string;
  status: "UP" | "DOWN";
  selectorsTotal: number;
  selectorsUp: number;
}

export interface VpnMetrics {
  totalTunnels: number;
  activeTunnels: number;
  inactiveTunnels: number;
  tunnels: VpnTunnelSummary[];
}

export interface RouteEntry {
  prefix: string;
  gateway?: string;
  interface?: string;
  protocol: string; // e.g. "S" (static), "C" (connected), "B" (bgp), "O" (ospf)
  isDefault: boolean;
}

export interface RoutingMetrics {
  totalRoutes: number;
  hasDefaultRoute: boolean;
  defaultGateway?: string;
  defaultInterface?: string;
  routes: RouteEntry[];
}

export interface HaMemberMetric {
  hostname: string;
  serialNumber: string;
  role: "MASTER" | "SLAVE" | "STANDALONE";
  clusterIndex?: number;
}

export interface HaClusterMetrics {
  haMode: "STANDALONE" | "ACTIVE_PASSIVE" | "ACTIVE_ACTIVE" | "UNKNOWN";
  isCluster: boolean;
  isSynchronized: boolean;
  healthStatus?: string;
  members: HaMemberMetric[];
  heartbeatStatus?: string;
}

export interface SignaturesMetrics {
  avEngine?: string;
  avDefinitionsVersion?: string;
  avDefinitionsDate?: string;
  ipsEngine?: string;
  ipsDefinitionsVersion?: string;
  ipsDefinitionsDate?: string;
  appDefinitionsVersion?: string;
  appDefinitionsDate?: string;
}

export interface NtpMetrics {
  isSynchronized: boolean;
  activeServer?: string;
  stratum?: number;
  offsetSeconds?: number;
  jitterSeconds?: number;
  timezone?: string;
}

export interface ConnectivityMetrics {
  target: string;
  transmitted: number;
  received: number;
  packetLossPct: number;
  rttMinMs?: number;
  rttAvgMs?: number;
  rttMaxMs?: number;
  isReachable: boolean;
}

export interface LogManagerMetrics {
  targetIp?: string;
  connectionState: "CONNECTED" | "UNREACHABLE" | "UNCONFIGURED";
  sslHandshakeOk: boolean;
  registrationStatus?: string;
}

// Union of all logical parsed values
export type ExtractedMetricsValue =
  | SystemStatusMetrics
  | PerformanceMetrics
  | DiskSpaceMetrics
  | InterfaceMetrics
  | LicenseMetrics
  | VpnMetrics
  | RoutingMetrics
  | HaClusterMetrics
  | SignaturesMetrics
  | NtpMetrics
  | ConnectivityMetrics
  | LogManagerMetrics
  | Record<string, unknown>;

export interface ParsedCommandOutput {
  commandId: string;
  rawCommand: string;
  parseStatus: "SUCCESS" | "FAILED" | "EMPTY" | "UNSUPPORTED";
  errorMessage?: string;
  metrics: ExtractedMetricsValue;
}

// Vendor-independent parser contract
export interface IVendorParser {
  readonly vendorId: VendorId;
  canParse(commandId: string): boolean;
  parseCommandOutput(commandId: string, rawOutput: string): ParsedCommandOutput;
}
