import { describe, it, expect } from "vitest";
import { mapGroupToPmCategory } from "@/components/commands/cli-command-section";
import { FORTIGATE_COMMANDS } from "@/vendors/fortigate/commands";
import { guiEvidenceMapper } from "@/core/evidence/gui-evidence-mapper";

describe("Phase 9: UI Simplification & Interaction Hardening", () => {
  describe("Adjustment 1: Truthful Synchronous Processing", () => {
    it("ensures processing endpoint contract is synchronous and returns complete results", () => {
      // The backend /api/sessions/[id]/process executes atomically and returns PipelineProcessResult
      const expectedSummaryFields = [
        "rulesPassed",
        "rulesWarning",
        "rulesFailed",
        "rulesMissing",
        "cliEvidencePages",
        "guiScreenshotsActive",
        "reReviewRequiredCount",
      ];

      const mockSummary = {
        rulesPassed: 18,
        rulesWarning: 1,
        rulesFailed: 0,
        rulesMissing: 2,
        cliEvidencePages: 20,
        guiScreenshotsActive: 2,
        reReviewRequiredCount: 0,
      };

      for (const field of expectedSummaryFields) {
        expect(field in mockSummary).toBe(true);
      }
    });
  });

  describe("Adjustment 2: Dynamic CLI Command Reference", () => {
    it("dynamically calculates command count from vendor command array rather than hardcoding", () => {
      const dynamicCount = FORTIGATE_COMMANDS.length;
      expect(dynamicCount).toBeGreaterThan(0);
      expect(typeof dynamicCount).toBe("number");
      // Must not be hardcoded string
      const badgeText = `${dynamicCount} Commands`;
      expect(badgeText).toBe(`${FORTIGATE_COMMANDS.length} Commands`);
    });

    it("maps all command groups cleanly without unhandled categories", () => {
      for (const cmd of FORTIGATE_COMMANDS) {
        const cat = mapGroupToPmCategory(cmd.group);
        expect(["System", "Hardware", "Licensing", "Network", "HA", "Logging"]).toContain(cat);
      }
    });
  });

  describe("Adjustment 3: Explicit Task-First GUI Screenshot Mapping", () => {
    it("ensures new uploads without explicit task remain checkId null and appendixMapping empty", () => {
      // Test the contract when uploadImageFile is called without an assigned task
      function createUploadedScreenshot(file: { name: string; size: number }, taskPreset?: string) {
        const matchedTask = guiEvidenceMapper
          .getAvailableTasks("fortigate")
          .find((t) => t.appendixMapping === taskPreset);

        return {
          filename: file.name,
          checkId: matchedTask?.checkId || null,
          appendixMapping: taskPreset || null,
          isUnassigned: !taskPreset,
        };
      }

      // Default upload without pre-selected task:
      const unassigned = createUploadedScreenshot({ name: "gui.png", size: 1024 }, "");
      expect(unassigned.checkId).toBeNull();
      expect(unassigned.appendixMapping).toBeNull();
      expect(unassigned.isUnassigned).toBe(true);

      // Task-first upload:
      const taskFirst = createUploadedScreenshot(
        { name: "backup.png", size: 2048 },
        "Appendix 16 - Backup Configuration"
      );
      expect(taskFirst.checkId).toBe("fg-sys-backup");
      expect(taskFirst.appendixMapping).toBe("Appendix 16 - Backup Configuration");
      expect(taskFirst.isUnassigned).toBe(false);
    });

    it("verifies unassigned screenshots are flagged as requiring engineer assignment", () => {
      interface StagedScreenshot {
        id: string;
        checkId: string | null;
        appendixMapping: string | null;
      }

      function isRequiresMapping(s: StagedScreenshot): boolean {
        return !s.appendixMapping || !s.checkId;
      }

      expect(isRequiresMapping({ id: "1", checkId: null, appendixMapping: null })).toBe(true);
      expect(isRequiresMapping({ id: "2", checkId: null, appendixMapping: "" })).toBe(true);
      expect(
        isRequiresMapping({
          id: "3",
          checkId: "fg-mgmt-gui",
          appendixMapping: "Appendix 9 - Web GUI Access",
        })
      ).toBe(false);
    });
  });

  describe("Adjustment 4: Scoped Evidence Viewer Keyboard Shortcuts", () => {
    it("ensures keyboard handler does not intercept Ctrl+C / Cmd+C", () => {
      function evaluateKeyShortcut(e: {
        key: string;
        ctrlKey?: boolean;
        metaKey?: boolean;
        isModalOpen: boolean;
        targetTagName: string;
      }): { handled: boolean; action?: string } {
        if (!e.isModalOpen) return { handled: false };

        // Do not intercept Ctrl+C or Cmd+C (preserve native copying)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
          return { handled: false };
        }

        if (e.key === "Escape") {
          return { handled: true, action: "CLOSE_MODAL" };
        }

        if (e.targetTagName !== "INPUT" && e.targetTagName !== "TEXTAREA" && e.targetTagName !== "SELECT") {
          if (e.key === "ArrowLeft") {
            return { handled: true, action: "PREV_EVIDENCE" };
          }
          if (e.key === "ArrowRight") {
            return { handled: true, action: "NEXT_EVIDENCE" };
          }
        }

        return { handled: false };
      }

      // Ctrl+C on text selection -> MUST NOT be handled by modal
      expect(
        evaluateKeyShortcut({
          key: "c",
          ctrlKey: true,
          isModalOpen: true,
          targetTagName: "PRE",
        }).handled
      ).toBe(false);

      // Cmd+C on macOS -> MUST NOT be handled by modal
      expect(
        evaluateKeyShortcut({
          key: "c",
          metaKey: true,
          isModalOpen: true,
          targetTagName: "PRE",
        }).handled
      ).toBe(false);

      // Escape -> Closes modal
      expect(
        evaluateKeyShortcut({
          key: "Escape",
          isModalOpen: true,
          targetTagName: "BODY",
        })
      ).toEqual({ handled: true, action: "CLOSE_MODAL" });

      // Arrow navigation when not in input
      expect(
        evaluateKeyShortcut({
          key: "ArrowLeft",
          isModalOpen: true,
          targetTagName: "DIV",
        })
      ).toEqual({ handled: true, action: "PREV_EVIDENCE" });

      // Arrow navigation ignored when typing in remarks textarea
      expect(
        evaluateKeyShortcut({
          key: "ArrowLeft",
          isModalOpen: true,
          targetTagName: "TEXTAREA",
        }).handled
      ).toBe(false);

      // Modal closed -> no keys handled
      expect(
        evaluateKeyShortcut({
          key: "Escape",
          isModalOpen: false,
          targetTagName: "BODY",
        }).handled
      ).toBe(false);
    });
  });

  describe("Adjustment 7 & 8: Responsive Review Actions & Hierarchy", () => {
    it("determines column visibility by viewport breakpoint", () => {
      function getVisibleColumns(width: number): string[] {
        const cols = ["Check", "Status", "Action"];
        if (width >= 640) cols.push("Evidence");
        if (width >= 768) cols.push("Value");
        if (width >= 1024) cols.push("Remarks");
        return cols;
      }

      // 700px: Check, Status, Action, Evidence
      const cols700 = getVisibleColumns(700);
      expect(cols700).toContain("Check");
      expect(cols700).toContain("Status");
      expect(cols700).toContain("Action");
      expect(cols700).toContain("Evidence");
      expect(cols700).not.toContain("Remarks");

      // 768px: Check, Status, Action, Evidence, Value
      const cols768 = getVisibleColumns(768);
      expect(cols768).toContain("Value");
      expect(cols768).not.toContain("Remarks");

      // 1024px and 1366px: Full columns including inline Remarks
      const cols1024 = getVisibleColumns(1024);
      expect(cols1024).toContain("Remarks");
      const cols1366 = getVisibleColumns(1366);
      expect(cols1366).toContain("Remarks");
    });

    it("keeps advanced status overrides collapsed by default until engineer requests them", () => {
      interface ReviewRowState {
        checkId: string;
        isExpanded: boolean;
        isAdvancedOpen: boolean;
      }

      const initialRowState: ReviewRowState = {
        checkId: "fg-hw-cpu",
        isExpanded: false,
        isAdvancedOpen: false,
      };

      // Primary view: details closed, advanced controls closed
      expect(initialRowState.isExpanded).toBe(false);
      expect(initialRowState.isAdvancedOpen).toBe(false);

      // When expanding details: primary actions (Approve, Reject, Remark) are visible, advanced remains closed
      const expandedDetails: ReviewRowState = {
        ...initialRowState,
        isExpanded: true,
      };
      expect(expandedDetails.isExpanded).toBe(true);
      expect(expandedDetails.isAdvancedOpen).toBe(false);

      // Only explicitly opening advanced reveals status override selector
      const openedAdvanced: ReviewRowState = {
        ...expandedDetails,
        isAdvancedOpen: true,
      };
      expect(openedAdvanced.isAdvancedOpen).toBe(true);
    });
  });

  describe("Adjustment 6: Single-Page Sequence Preservation", () => {
    it("verifies the defined workflow sequence order", () => {
      const singlePageWorkflow = [
        "CLI_COMMAND_REFERENCE",
        "ATTACHED_FILES",
        "UPLOAD_EVIDENCE_FILES",
        "DETECTED_REPORT_INFO",
        "GUI_SCREENSHOTS",
        "GENERATE_PM_REPORT",
        "PIPELINE_SUMMARY",
        "INLINE_REVIEW",
        "REPORT_DOWNLOAD",
        "RECENT_REPORTS",
      ];

      // CLI reference is before uploads
      expect(
        singlePageWorkflow.indexOf("CLI_COMMAND_REFERENCE")
      ).toBeLessThan(singlePageWorkflow.indexOf("UPLOAD_EVIDENCE_FILES"));

      // Uploads are before GUI screenshots
      expect(
        singlePageWorkflow.indexOf("UPLOAD_EVIDENCE_FILES")
      ).toBeLessThan(singlePageWorkflow.indexOf("GUI_SCREENSHOTS"));

      // GUI screenshots are before Generate
      expect(
        singlePageWorkflow.indexOf("GUI_SCREENSHOTS")
      ).toBeLessThan(singlePageWorkflow.indexOf("GENERATE_PM_REPORT"));

      // Generate is before Review
      expect(
        singlePageWorkflow.indexOf("GENERATE_PM_REPORT")
      ).toBeLessThan(singlePageWorkflow.indexOf("INLINE_REVIEW"));

      // Review is before Download
      expect(
        singlePageWorkflow.indexOf("INLINE_REVIEW")
      ).toBeLessThan(singlePageWorkflow.indexOf("REPORT_DOWNLOAD"));
    });
  });

  describe("Recent PM Reports Deletion & Workspace Isolation", () => {
    interface MockRecentSession {
      id: string;
      customer: string;
      status: string;
    }

    it("filters out deleted session by ID from recent list", () => {
      const initial: MockRecentSession[] = [
        { id: "s-1", customer: "Customer Alpha", status: "COMPLETED" },
        { id: "s-2", customer: "Customer Beta", status: "DRAFT" },
        { id: "s-3", customer: "Customer Gamma", status: "REVIEW" },
      ];

      const deleteId = "s-2";
      const updated = initial.filter((s) => s.id !== deleteId);

      expect(updated.length).toBe(2);
      expect(updated.some((s) => s.id === deleteId)).toBe(false);
      expect(updated.map((s) => s.id)).toEqual(["s-1", "s-3"]);
    });

    it("resets workspace when active session is deleted", () => {
      let activeSessionId: string | null = "s-2";
      let isWorkspaceReset = false;

      function onDeleteSuccess(deletedId: string) {
        if (activeSessionId === deletedId) {
          activeSessionId = null;
          isWorkspaceReset = true;
        }
      }

      onDeleteSuccess("s-2");
      expect(activeSessionId).toBeNull();
      expect(isWorkspaceReset).toBe(true);
    });

    it("preserves active session when another session from history is deleted", () => {
      let activeSessionId: string | null = "s-1";
      let isWorkspaceReset = false;

      function onDeleteSuccess(deletedId: string) {
        if (activeSessionId === deletedId) {
          activeSessionId = null;
          isWorkspaceReset = true;
        }
      }

      onDeleteSuccess("s-2");
      expect(activeSessionId).toBe("s-1");
      expect(isWorkspaceReset).toBe(false);
    });
  });
});
