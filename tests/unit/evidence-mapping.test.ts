import { describe, it, expect } from "vitest";
import { reviewService } from "@/core/review";
import { VendorCheckItemDefinition } from "@/vendors/types";

describe("Evidence Mapping & Health Detection (Unit Tests)", () => {
  const mockChecklist: VendorCheckItemDefinition[] = [
    {
      id: "fg-hw-cpu",
      taskName: "CPU Usage",
      description: "CPU should stay below 80%",
      group: "Hardware Status",
      commands: ["cmd-fg-sys-perf"],
      sourceType: "CLI",
      targetSection: "Hardware Status",
      targetAppendix: "Appendix 1 - CPU Usage",
      thresholdDescription: "< 80%",
    },
    {
      id: "fg-mgmt-gui",
      taskName: "Accessibility of FortiGate via GUI",
      description: "Check Web GUI access",
      group: "Configuration",
      commands: [],
      sourceType: "GUI_MANUAL",
      targetSection: "Configuration",
      targetAppendix: "Appendix 9 - Web GUI Access",
    },
  ];

  it("prioritizes stable checkId over appendix title strings", () => {
    const evidences = [
      {
        id: "ev-1",
        checkId: "fg-hw-cpu",
        title: "Random Title Without Appendix Mention",
        appendixMapping: "Appendix 99 - Mismatched Name",
        imageReference: "evidence/cli.png",
        isRedacted: false,
        pageNumber: 1,
        totalPages: 1,
        commandExecutionId: "exec-1",
        commandExecution: {
          command: "get system performance status",
          parseStatus: "PARSED",
        },
      },
    ];

    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      evidences,
    });

    const cpuItem = items.find((i) => i.checkId === "fg-hw-cpu");
    expect(cpuItem).toBeDefined();
    expect(cpuItem?.evidence.length).toBe(1);
    expect(cpuItem?.evidence[0].id).toBe("ev-1");
    expect(cpuItem?.evidence[0].sourceType).toBe("CLI");
  });

  it("attaches multiple evidence items (CLI pages + GUI screenshot) to a single checklist item", () => {
    const evidences = [
      {
        id: "ev-page1",
        checkId: "fg-hw-cpu",
        title: "CPU Page 1",
        appendixMapping: "Appendix 1 - CPU Usage",
        imageReference: "evidence/cpu_p1.png",
        isRedacted: false,
        pageNumber: 1,
        totalPages: 2,
        commandExecutionId: "exec-1",
        commandExecution: {
          command: "get system performance status",
          parseStatus: "PARSED",
        },
      },
      {
        id: "ev-page2",
        checkId: "fg-hw-cpu",
        title: "CPU Page 2",
        appendixMapping: "Appendix 1 - CPU Usage",
        imageReference: "evidence/cpu_p2.png",
        isRedacted: true,
        pageNumber: 2,
        totalPages: 2,
        commandExecutionId: "exec-1",
        commandExecution: {
          command: "get system performance status",
          parseStatus: "PARSED",
        },
      },
      {
        id: "ev-gui-cpu",
        checkId: "fg-hw-cpu",
        title: "GUI CPU Graph Screenshot",
        appendixMapping: "Appendix 1 - CPU Usage",
        imageReference: "screenshots/cpu_gui.png",
        isRedacted: false,
        pageNumber: 1,
        totalPages: 1,
        uploadedFileId: "file-123",
        uploadedFile: {
          originalFilename: "fortiview_cpu.png",
          hashSha256: "abc1234567890def",
          sizeBytes: 154200,
        },
      },
    ];

    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      evidences,
    });

    const cpuItem = items.find((i) => i.checkId === "fg-hw-cpu");
    expect(cpuItem?.evidence.length).toBe(3);
    expect(cpuItem?.evidenceHealth.cliCount).toBe(2);
    expect(cpuItem?.evidenceHealth.guiCount).toBe(1);
    expect(cpuItem?.evidenceHealth.status).toBe("HEALTHY");

    const guiEvidence = cpuItem?.evidence.find((e) => e.sourceType === "GUI_SCREENSHOT");
    expect(guiEvidence).toBeDefined();
    expect(guiEvidence?.originalFilename).toBe("fortiview_cpu.png");
    expect(guiEvidence?.hashSha256).toBe("abc1234567890def");
  });

  it("flags excluded evidence and excludes it from active evidence counts", () => {
    const evidences = [
      {
        id: "ev-gui-excluded",
        checkId: "fg-mgmt-gui",
        title: "Accidental Screenshot",
        appendixMapping: "Appendix 9 - Web GUI Access",
        imageReference: "screenshots/wrong.png",
        isRedacted: false,
        isExcluded: true, // Marked excluded
        pageNumber: 1,
        totalPages: 1,
        uploadedFile: {
          originalFilename: "wrong.png",
          hashSha256: "deadbeef",
        },
      },
    ];

    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      evidences,
    });

    const guiItem = items.find((i) => i.checkId === "fg-mgmt-gui");
    expect(guiItem?.evidence.length).toBe(1);
    expect(guiItem?.evidence[0].isExcluded).toBe(true);
    expect(guiItem?.evidenceHealth.excludedCount).toBe(1);
    expect(guiItem?.evidenceHealth.guiCount).toBe(0); // 0 active
    expect(guiItem?.evidenceHealth.hasRequiredEvidence).toBe(false);
    expect(guiItem?.evidenceHealth.status).toBe("MISSING");
  });

  it("detects TRUNCATED evidence when command parsing fails or is cut-off", () => {
    const evidences = [
      {
        id: "ev-truncated",
        checkId: "fg-hw-cpu",
        title: "CPU Output",
        appendixMapping: "Appendix 1 - CPU Usage",
        imageReference: "evidence/cpu_cut.png",
        isRedacted: false,
        pageNumber: 1,
        totalPages: 1,
        commandExecution: {
          command: "get system performance status",
          parseStatus: "FAILED",
          parseError: "Unexpected end of input / truncated terminal stream",
        },
      },
    ];

    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      evidences,
    });

    const cpuItem = items.find((i) => i.checkId === "fg-hw-cpu");
    expect(cpuItem?.evidenceHealth.isTruncated).toBe(true);
    expect(cpuItem?.evidenceHealth.status).toBe("TRUNCATED");
  });

  it("detects INCOMPLETE collection state from proposed evaluation", () => {
    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      checklistResults: [
        {
          id: "res-1",
          checkId: "fg-hw-cpu",
          checkName: "CPU Usage",
          collectionState: "INCOMPLETE",
          status: "WARNING",
          reviewRequired: false,
        },
      ],
      evidences: [
        {
          id: "ev-1",
          checkId: "fg-hw-cpu",
          title: "CPU",
          imageReference: "evidence/cpu.png",
          isRedacted: false,
          pageNumber: 1,
          totalPages: 1,
        },
      ],
    });

    const cpuItem = items.find((i) => i.checkId === "fg-hw-cpu");
    expect(cpuItem?.evidenceHealth.status).toBe("INCOMPLETE");
  });

  it("detects CONFLICTING evidence when deviceId mismatches target device", () => {
    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      targetDeviceId: "device-hq-pri",
      evidences: [
        {
          id: "ev-wrong-dev",
          checkId: "fg-hw-cpu",
          deviceId: "device-hq-sec", // From secondary instead of primary!
          title: "CPU from Secondary",
          imageReference: "evidence/cpu_sec.png",
          isRedacted: false,
          pageNumber: 1,
          totalPages: 1,
        },
      ],
    });

    const cpuItem = items.find((i) => i.checkId === "fg-hw-cpu");
    expect(cpuItem?.evidenceHealth.isConflicting).toBe(true);
    expect(cpuItem?.evidenceHealth.status).toBe("CONFLICTING");
  });

  it("strictly enforces that GUI_MANUAL checks never qualify for batch pass even when image exists", () => {
    const items = reviewService.buildReviewItems({
      checklistDefinitions: mockChecklist,
      checklistResults: [
        {
          id: "res-gui",
          checkId: "fg-mgmt-gui",
          checkName: "Accessibility of FortiGate via GUI",
          collectionState: "COMPLETE",
          status: "PASS",
          reviewRequired: false,
        },
      ],
      evidences: [
        {
          id: "ev-gui",
          checkId: "fg-mgmt-gui",
          title: "GUI Login Screen",
          imageReference: "screenshots/gui_login.png",
          isRedacted: false,
          isExcluded: false,
          pageNumber: 1,
          totalPages: 1,
          uploadedFile: {
            originalFilename: "gui_ok.png",
            hashSha256: "1234567890abcdef",
          },
        },
      ],
    });

    const guiItem = items.find((i) => i.checkId === "fg-mgmt-gui");
    expect(guiItem?.evidenceHealth.guiCount).toBe(1);
    expect(guiItem?.evidenceHealth.status).toBe("HEALTHY");
    // CRITICAL: Manual GUI checks must NOT be batch-approved
    expect(guiItem?.isEligibleForBatchPass).toBe(false);
  });
});
