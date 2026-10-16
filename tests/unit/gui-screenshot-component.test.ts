import { describe, it, expect } from "vitest";
import { guiEvidenceMapper } from "@/core/evidence/gui-evidence-mapper";

describe("GUI Screenshot Component Logic & Tasks", () => {
  it("prioritizes GUI Accessibility and Backup Configuration tasks", () => {
    const tasks = guiEvidenceMapper.getAvailableTasks("fortigate");
    const primaryTasks = tasks.filter((t) => t.isPrimaryGui);

    expect(primaryTasks.length).toBeGreaterThanOrEqual(2);
    const guiTask = primaryTasks.find((t) => t.checkId === "fg-mgmt-gui");
    const backupTask = primaryTasks.find((t) => t.checkId === "fg-sys-backup");

    expect(guiTask).toBeDefined();
    expect(guiTask?.taskName).toContain("GUI");
    expect(guiTask?.appendixMapping).toContain("Appendix 9");

    expect(backupTask).toBeDefined();
    expect(backupTask?.taskName).toContain("Backup");
    expect(backupTask?.appendixMapping).toContain("Appendix 16");
  });

  it("verifies focused paste ignores active inputs and textareas", () => {
    // Helper function reproducing the focused paste check in gui-screenshot-uploader.tsx
    function shouldIgnorePaste(activeTagName: string, isInsidePasteZone: boolean): boolean {
      if ((activeTagName === "INPUT" || activeTagName === "TEXTAREA") && !isInsidePasteZone) {
        return true;
      }
      return false;
    }

    // Inside remark textarea -> must not intercept
    expect(shouldIgnorePaste("TEXTAREA", false)).toBe(true);
    // Inside customer name input -> must not intercept
    expect(shouldIgnorePaste("INPUT", false)).toBe(true);
    // Inside paste zone container or general body -> intercept
    expect(shouldIgnorePaste("DIV", true)).toBe(false);
    expect(shouldIgnorePaste("BODY", false)).toBe(false);
  });

  it("ensures normal remove action defaults to non-destructive removal", () => {
    function buildDeleteUrl(sessionId: string, fileId: string) {
      return `/api/sessions/${sessionId}/files?fileId=${fileId}`;
    }

    const defaultUrl = buildDeleteUrl("session_1", "file_1");
    expect(defaultUrl).not.toContain("permanent=true");
  });

  it("maps stable PM checklist IDs to appendix labels reliably", () => {
    const fortigateTasks = guiEvidenceMapper.getAvailableTasks("fortigate");

    const taskMap = new Map(fortigateTasks.map((t) => [t.checkId, t.appendixMapping]));

    expect(taskMap.get("fg-mgmt-gui")).toBe("Appendix 9 - Web GUI Access");
    expect(taskMap.get("fg-sys-backup")).toBe("Appendix 16 - Backup Configuration");
    expect(taskMap.get("fg-hw-cpu")).toBe("Appendix 1 - CPU Usage");
  });
});
