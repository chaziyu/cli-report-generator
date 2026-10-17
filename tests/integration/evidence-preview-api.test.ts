import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { NextRequest } from "next/server";
import {
  GET as getEvidenceImageApi,
  PATCH as patchEvidenceApi,
} from "@/app/api/sessions/[id]/evidence/[evidenceId]/route";
import { PATCH as patchFilesApi } from "@/app/api/sessions/[id]/files/route";
import {
  GET as getReviewApi,
  POST as postReviewApi,
} from "@/app/api/sessions/[id]/review/route";
import { reviewService } from "@/core/review";

describe("Integrated Evidence Preview, Mapping & Security (Integration Tests)", () => {
  let sessionAId: string;
  let sessionBId: string;
  let deviceAId: string;
  let deviceBId: string;
  let cliEvidenceAId: string;
  let guiEvidenceAId: string;
  let uploadedFileAId: string;

  beforeEach(async () => {
    // 1. Create Session A with Device A
    const sessionA = await prisma.pMSession.create({
      data: {
        customer: "Client Alpha",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FW-ALPHA-PRI",
              model: "FortiGate 100F",
              role: "Primary",
            },
          ],
        },
      },
      include: { devices: true },
    });
    sessionAId = sessionA.id;
    deviceAId = sessionA.devices[0].id;

    // 2. Create Session B with Device B (for cross-session security tests)
    const sessionB = await prisma.pMSession.create({
      data: {
        customer: "Client Beta",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FW-BETA-PRI",
              model: "FortiGate 100F",
              role: "Primary",
            },
          ],
        },
      },
      include: { devices: true },
    });
    sessionBId = sessionB.id;
    deviceBId = sessionB.devices[0].id;

    // 3. Create CLI Evidence in Session A
    const execA = await prisma.commandExecution.create({
      data: {
        deviceId: deviceAId,
        command: "get system performance status",
        outputContent: "CPU states: 10% user 5% system",
        parseStatus: "PARSED",
      },
    });

    const storedCli = await storage.saveFile(
      sessionAId,
      "evidence",
      "cli_cpu.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png"
    );

    const cliEv = await prisma.evidence.create({
      data: {
        commandExecutionId: execA.id,
        deviceId: deviceAId,
        checkId: "fg-hw-cpu",
        title: "CPU Usage",
        appendixMapping: "Appendix 1 - CPU Usage",
        imageReference: storedCli.storagePath,
        sourceLabel: "Rendered from PuTTY session log",
        isExcluded: false,
      },
    });
    cliEvidenceAId = cliEv.id;

    // 4. Create Uploaded GUI Screenshot in Session A
    const storedGui = await storage.saveFile(
      sessionAId,
      "screenshots",
      "gui_web.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png"
    );

    const upFile = await prisma.uploadedFile.create({
      data: {
        sessionId: sessionAId,
        deviceId: deviceAId,
        type: "GUI_SCREENSHOT",
        originalFilename: "gui_web.png",
        storedFilename: storedGui.storedFilename,
        storagePath: storedGui.storagePath,
        hashSha256: storedGui.hashSha256,
        sizeBytes: 1024,
        mimeType: "image/png",
      },
    });
    uploadedFileAId = upFile.id;

    const guiEv = await prisma.evidence.create({
      data: {
        commandExecutionId: null,
        uploadedFileId: upFile.id,
        deviceId: deviceAId,
        checkId: "fg-mgmt-gui",
        title: "Accessibility of FortiGate via GUI",
        appendixMapping: "Appendix 9 - Web GUI Access",
        imageReference: storedGui.storagePath,
        sourceLabel: "Uploaded GUI screenshot",
        isExcluded: false,
      },
    });
    guiEvidenceAId = guiEv.id;

    // 5. Create ChecklistResult for fg-mgmt-gui in Session A
    await prisma.checklistResult.create({
      data: {
        deviceId: deviceAId,
        checkId: "fg-mgmt-gui",
        checkName: "Accessibility of FortiGate via GUI",
        collectionState: "COMPLETE",
        status: "PASS",
        reviewRequired: false,
        evidenceFingerprint: "init-fingerprint-gui",
      },
    });
  });

  afterEach(async () => {
    if (sessionAId) {
      await prisma.pMSession.deleteMany({ where: { id: sessionAId } });
    }
    if (sessionBId) {
      await prisma.pMSession.deleteMany({ where: { id: sessionBId } });
    }
  });

  it("strictly enforces cross-session access protection across all evidence endpoints", async () => {
    // 1. Attempt GET evidence of Session A from Session B -> HTTP 404
    const getReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionBId}/evidence/${guiEvidenceAId}`
    );
    const getRes = await getEvidenceImageApi(getReq, {
      params: Promise.resolve({ id: sessionBId, evidenceId: guiEvidenceAId }),
    });
    expect(getRes.status).toBe(404);

    // 2. Attempt PATCH evidence of Session A from Session B -> HTTP 404
    const patchReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionBId}/evidence/${guiEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Attacker Renamed" }),
      }
    );
    const patchRes = await patchEvidenceApi(patchReq, {
      params: Promise.resolve({ id: sessionBId, evidenceId: guiEvidenceAId }),
    });
    expect(patchRes.status).toBe(404);

    // 3. Attempt PATCH file in Session A to assign Device B from Session B -> HTTP 400
    const patchFileReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/files`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: uploadedFileAId, deviceId: deviceBId }),
      }
    );
    const patchFileRes = await patchFilesApi(patchFileReq, {
      params: Promise.resolve({ id: sessionAId }),
    });
    expect(patchFileRes.status).toBe(400);
  });

  it("rejects arbitrary reassignment of CLI evidence", async () => {
    const patchReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/evidence/${cliEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: "fg-hw-mem" }),
      }
    );

    const patchRes = await patchEvidenceApi(patchReq, {
      params: Promise.resolve({ id: sessionAId, evidenceId: cliEvidenceAId }),
    });

    expect(patchRes.status).toBe(400);
    const json = await patchRes.json();
    expect(json.error).toContain("CLI terminal evidence cannot be reassigned");
  });

  it("triggers re-review when GUI screenshot is reassigned away from an approved finding", async () => {
    // 1. Approve fg-mgmt-gui
    const approveReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: deviceAId,
          reviewer: "Senior Security Specialist",
          action: "SINGLE",
          decision: {
            checkId: "fg-mgmt-gui",
            decision: "APPROVED",
            finalStatus: "PASS",
            finalRemarks: "GUI accessed cleanly over HTTPS",
          },
        }),
      }
    );
    const approveRes = await postReviewApi(approveReq, {
      params: Promise.resolve({ id: sessionAId }),
    });
    expect(approveRes.status).toBe(200);

    const dec1 = await prisma.reviewDecision.findFirst({
      where: { checklistResult: { deviceId: deviceAId, checkId: "fg-mgmt-gui" } },
      orderBy: { decidedAt: "desc" },
    });
    expect(dec1?.decision).toBe("APPROVED");

    // 2. Reassign GUI screenshot to fg-sys-backup
    const reassignReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/evidence/${guiEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: "fg-sys-backup" }),
      }
    );
    const reassignRes = await patchEvidenceApi(reassignReq, {
      params: Promise.resolve({ id: sessionAId, evidenceId: guiEvidenceAId }),
    });
    expect(reassignRes.status).toBe(200);

    // 3. Verify fg-mgmt-gui is invalidated: prior decision SUPERSEDED, reviewRequired is true!
    const updatedGuiResult = await prisma.checklistResult.findUnique({
      where: { deviceId_checkId: { deviceId: deviceAId, checkId: "fg-mgmt-gui" } },
    });
    expect(updatedGuiResult?.collectionState).toBe("MISSING");
    expect(updatedGuiResult?.reviewRequired).toBe(true);

    const priorDec = await prisma.reviewDecision.findUnique({
      where: { id: dec1!.id },
    });
    expect(priorDec?.decision).toBe("SUPERSEDED");

    // Authoritative check: export eligibility must now reject the invalidated decision
    expect(
      reviewService.isDecisionEligibleForExport(
        updatedGuiResult!.evidenceFingerprint,
        priorDec!,
        updatedGuiResult!.reviewRequired
      )
    ).toBe(false);
  });

  it("handles moving evidence between two findings, recalculating fingerprints for both", async () => {
    // Create ChecklistResult for fg-sys-backup as well
    await prisma.checklistResult.create({
      data: {
        deviceId: deviceAId,
        checkId: "fg-sys-backup",
        checkName: "Backup Configurations",
        collectionState: "MISSING",
        status: "PASS",
        reviewRequired: false,
        evidenceFingerprint: "backup-initial-fp",
      },
    });

    // Move screenshot from fg-mgmt-gui to fg-sys-backup
    const moveReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/evidence/${guiEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: "fg-sys-backup" }),
      }
    );
    const moveRes = await patchEvidenceApi(moveReq, {
      params: Promise.resolve({ id: sessionAId, evidenceId: guiEvidenceAId }),
    });
    expect(moveRes.status).toBe(200);

    // Former check (fg-mgmt-gui) has 0 evidence -> MISSING
    const former = await prisma.checklistResult.findUnique({
      where: { deviceId_checkId: { deviceId: deviceAId, checkId: "fg-mgmt-gui" } },
    });
    expect(former?.collectionState).toBe("MISSING");
    expect(former?.reviewRequired).toBe(true);

    // New check (fg-sys-backup) now has evidence -> COMPLETE
    const newCheck = await prisma.checklistResult.findUnique({
      where: { deviceId_checkId: { deviceId: deviceAId, checkId: "fg-sys-backup" } },
    });
    expect(newCheck?.collectionState).toBe("COMPLETE");
    expect(newCheck?.evidenceFingerprint).not.toBe("backup-initial-fp");
  });

  it("preserves exclusion state and only restores upon explicit RESTORE action", async () => {
    // 1. Explicitly exclude screenshot
    const excludeReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/evidence/${guiEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EXCLUDE" }),
      }
    );
    const excludeRes = await patchEvidenceApi(excludeReq, {
      params: Promise.resolve({ id: sessionAId, evidenceId: guiEvidenceAId }),
    });
    expect(excludeRes.status).toBe(200);

    let ev = await prisma.evidence.findUnique({ where: { id: guiEvidenceAId } });
    expect(ev?.isExcluded).toBe(true);

    // 2. Updating metadata like title or appendix destination MUST NOT clear isExcluded!
    const renameReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/evidence/${guiEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Title While Excluded" }),
      }
    );
    await patchEvidenceApi(renameReq, {
      params: Promise.resolve({ id: sessionAId, evidenceId: guiEvidenceAId }),
    });

    ev = await prisma.evidence.findUnique({ where: { id: guiEvidenceAId } });
    expect(ev?.isExcluded).toBe(true); // Still excluded!

    // 3. Explicit Restore action
    const restoreReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/evidence/${guiEvidenceAId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESTORE" }),
      }
    );
    const restoreRes = await patchEvidenceApi(restoreReq, {
      params: Promise.resolve({ id: sessionAId, evidenceId: guiEvidenceAId }),
    });
    expect(restoreRes.status).toBe(200);

    ev = await prisma.evidence.findUnique({ where: { id: guiEvidenceAId } });
    expect(ev?.isExcluded).toBe(false); // Restored!
  });

  it("returns rich evidence with provenance, source types, and health via GET review", async () => {
    const getReviewReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionAId}/review?deviceId=${deviceAId}`
    );
    const res = await getReviewApi(getReviewReq, {
      params: Promise.resolve({ id: sessionAId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);

    const cpuItem = json.data.items.find((i: any) => i.checkId === "fg-hw-cpu");
    expect(cpuItem).toBeDefined();
    expect(cpuItem.evidence.length).toBeGreaterThanOrEqual(1);
    expect(cpuItem.evidence[0].sourceType).toBe("CLI");
    expect(cpuItem.evidenceHealth).toBeDefined();
    expect(cpuItem.evidenceHealth.status).toBe("HEALTHY");

    const guiItem = json.data.items.find((i: any) => i.checkId === "fg-mgmt-gui");
    expect(guiItem).toBeDefined();
    expect(guiItem.evidence[0].sourceType).toBe("GUI_SCREENSHOT");
    expect(guiItem.evidence[0].hashSha256).toBeDefined();
    expect(guiItem.evidence[0].originalFilename).toBe("gui_web.png");
  });
});
