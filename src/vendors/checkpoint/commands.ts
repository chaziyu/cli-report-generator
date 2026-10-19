import { VendorCommandDefinition } from "../types";

const guide = (section: string, tableRow: number) => ({
  document: "Check Point 7000M Preventive Maintenance.docx",
  section,
  tableRow,
});

function command(
  id: string,
  cli: string,
  description: string,
  group: string,
  checkIds: string[],
  tableRow: number,
  options: Partial<VendorCommandDefinition> = {}
): VendorCommandDefinition {
  return {
    id,
    command: cli,
    description,
    group,
    isReadOnly: true,
    requiresContext: false,
    expectedOutputs: [],
    evidenceRequired: true,
    targetSection: group,
    mappedCheckIds: checkIds,
    executionContext: "Gaia Clish (as labeled in the guide)",
    contextVerification: "GUIDE_SPECIFIED",
    guideSource: guide(group, tableRow),
    ...options,
  };
}

const verifyContext = "The guide labels this command Gaia Clish; verify the required CLI execution mode on the target Gaia version before use.";

export const CHECKPOINT_COMMANDS: VendorCommandDefinition[] = [
  command("cp-os-version", "show version all", "Review Gaia OS version and build.", "System", ["cp-os-version"], 2),
  command("cp-hotfix-take", "show installer cpinfo", "Review installed hotfix and patch information.", "System", ["cp-hotfix-take"], 3, { contextVerification: "VERIFY_REQUIRED", notes: verifyContext }),
  command("cp-uptime", "show uptime", "Review system uptime.", "System", ["cp-system-uptime"], 4),
  command("cp-cpu", "cpstat os -f cpu", "Collect CPU utilization statistics.", "Performance", ["cp-cpu-usage"], 6, { contextVerification: "VERIFY_REQUIRED", notes: verifyContext }),
  command("cp-memory", "cpstat os -f memory", "Collect memory utilization statistics.", "Performance", ["cp-memory-usage"], 7, { contextVerification: "VERIFY_REQUIRED", notes: verifyContext }),
  command("cp-disk-usage", "show system disk usage", "Review filesystem and local log-storage utilization.", "Storage", ["cp-disk-space", "cp-local-log-storage"], 8, { guideSource: guide("Storage", 8) }),
  command("cp-lvm-overview", "show system lvm overview", "Review logical volume utilization.", "Storage", ["cp-disk-space"], 8),
  command("cp-hardware-health", "show sysenv all", "Review hardware sensor, temperature, fan, and power information.", "Hardware Status", ["cp-hardware-health"], 9),
  command("cp-interfaces", "show interfaces all", "Review interface link status and ports in use.", "Hardware Status", ["cp-interface-monitoring"], 10),
  command("cp-licenses", "cplic print", "Review installed licenses, features, and expiry dates.", "Licensing", ["cp-license-information"], 12, { contextVerification: "VERIFY_REQUIRED", notes: verifyContext }),
  command("cp-clock", "show clock", "Collect system date and time.", "Time Synchronization", ["cp-date-time"], 16),
  command("cp-timezone", "show timezone", "Collect the configured timezone.", "Time Synchronization", ["cp-date-time"], 16),
  command("cp-ntp-active", "show ntp active", "Review the active NTP server.", "Time Synchronization", ["cp-ntp-synchronization"], 17),
  command("cp-ntp-current", "show ntp current", "Review current NTP synchronization details.", "Time Synchronization", ["cp-ntp-synchronization"], 17),
  command("cp-dns", "show dns", "Review configured DNS servers.", "Network", ["cp-dns-configuration"], 18),
  command("cp-routes", "show route all", "Review routes and next hops.", "Network", ["cp-routing-table"], 19),
  command("cp-cluster-state", "show cluster state", "Review cluster state and virtual-system distribution evidence.", "Clustering", ["cp-cluster-status", "cp-vsx-load-sharing"], 23, { notes: "The guide identifies this as partial evidence for VSX load sharing." }),
  command("cp-cluster-sync", "show cluster statistics sync", "Review cluster synchronization statistics.", "Clustering", ["cp-ha-synchronization"], 24),
  command("cp-watchdog", "cpwd_admin list", "Review WatchDog monitored process state.", "System Health", ["cp-watchdog-processes"], 26, { contextVerification: "VERIFY_REQUIRED", notes: verifyContext }),
  command("cp-vsx-systems", "show virtual-system all", "Review VSX virtual systems and operational state.", "VSX", ["cp-vsx-status"], 27),
  command("cp-connections", "fw ctl pstat", "Collect firewall connection and capacity statistics.", "Performance", ["cp-concurrent-connections"], 29, {
    executionContext: "Expert shell (verify on target version)",
    contextVerification: "VERIFY_REQUIRED",
    notes: "The guide does not specify the shell context for this command. Verify the required context on the target Gaia version before use.",
  }),
];
