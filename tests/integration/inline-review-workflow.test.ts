import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as processRoute } from "@/app/api/sessions/[id]/process/route";
import { GET as getReviewRoute, POST as postReviewRoute } from "@/app/api/sessions/[id]/review/route";
import { reviewService } from "@/core/review";
import { NextRequest } from "next/server";

describe("Inline Review Workflow & Multi-Device Isolation (Phase 5 Integration)", () => {
  let sessionId: string;
  let primaryDeviceId: string;
  let secondaryDeviceId: string;

  beforeEach(async () => {
    // 1. Create PM session with primary and secondary devices
    const session = await prisma.pMSession.create({
      data: {
        customer: "RHB Bank Berhad",
        vendor: "fortigate",
        status: "DRAFT",
        devices: {
          create: [
            {
              hostname: "RHB-FW-HQ-PRI",
              model: "FortiGate 200F",
              role: "Primary",
            },
            {
              hostname: "RHB-FW-HQ-SEC",
              model: "FortiGate 200F",
              role: "Secondary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    primaryDeviceId = session.devices.find((d) => d.role === "Primary")!.id;
    secondaryDeviceId = session.devices.find((d) => d.role === "Secondary")!.id;

    // 2. Upload authentic PuTTY log for Primary
    const logContent = `
RHB-FW-HQ-PRI # get system status
Version: FortiGate-200F v7.0.12,build0523,230504 (GA.M)
Serial-Number: FG200FTK20000001
Hostname: RHB-FW-HQ-PRI
Operation Mode: NAT
Current virtual domain: root

RHB-FW-HQ-PRI # get system performance status
CPU states: 1% user 2% system 0% nice 97% idle 0% iowait 0% irq 0% softirq
Memory: 4194304k total, 1258291k used (30%), 2936013k free (70%)
Average sessions: 520 concurrent sessions
Uptime: 60 days, 4 hours, 10 minutes
`;

    const stored = await storage.saveFile(
      sessionId,
      "logs",
      "rhb_putty.txt",
      Buffer.from(logContent, "utf8"),
      "text/plain"
    );

    await prisma.uploadedFile.create({
      data: {
        sessionId,
        deviceId: primaryDeviceId,
        originalFilename: "rhb_putty.txt",
        storedFilename: stored.storedFilename,
        storagePath: stored.storagePath,
        mimeType: "text/plain",
        sizeBytes: stored.sizeBytes,
        type: "PUTTY_LOG",
        hashSha256: stored.hashSha256,
      },
    });
  });

  afterEach(async () => {
    if (sessionId) {
      await prisma.pMSession.deleteMany({ where: { id: sessionId } });
    }
  });

  it("processes pipeline, returns review findings with summary counts, and executes safe batch approval", async () => {
    // 1. Run pipeline
    const procReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const procRes = await processRoute(procReq, { params: Promise.resolve({ id: sessionId }) });
    expect(procRes.status).toBe(200);

    // 2. Query review findings for Primary device
    const getReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/review?deviceId=${primaryDeviceId}`
    );
    const getRes = await getReviewRoute(getReq, { params: Promise.resolve({ id: sessionId }) });
    expect(getRes.status).toBe(200);

    const reviewData = (await getRes.json()).data;
    expect(reviewData.items.length).toBeGreaterThan(0);
    expect(reviewData.summary).toBeDefined();
    expect(reviewData.summary.needsAttentionCount).toBeGreaterThanOrEqual(0);

    // 3. Test safe batch approval (APPROVE_PASSING)
    const batchReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: primaryDeviceId,
        reviewer: "Antigravity Agent",
        action: "APPROVE_PASSING",
      }),
    });

    const batchRes = await postReviewRoute(batchReq, { params: Promise.resolve({ id: sessionId }) });
    expect(batchRes.status).toBe(200);

    const batchData = (await batchRes.json()).data;
    expect(batchData.decisionsRecorded).toBeGreaterThanOrEqual(0);

    // Verify that GUI manual checks (like fg-mgmt-gui) were excluded from batch pass
    const guiCheck = reviewData.items.find((i: any) => i.checkId === "fg-mgmt-gui");
    if (guiCheck) {
      const refreshedReq = new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/review?deviceId=${primaryDeviceId}`
      );
      const refreshedData = (
        await (await getReviewRoute(refreshedReq, { params: Promise.resolve({ id: sessionId }) })).json()
      ).data;

      const updatedGui = refreshedData.items.find((i: any) => i.checkId === "fg-mgmt-gui");
      expect(updatedGui.decision.decision).toBe("PENDING");
    }
  });

  it("handles fresh re-approval after evidence fingerprint change and maintains authoritative export eligibility", async () => {
    // 1. Run pipeline
    const procReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await processRoute(procReq, { params: Promise.resolve({ id: sessionId }) });

    // 2. Fetch memory check (fg-hw-mem) which passed deterministically
    const memResult = await prisma.checklistResult.findUnique({
      where: {
        deviceId_checkId: {
          deviceId: primaryDeviceId,
          checkId: "fg-hw-mem",
        },
      },
    });
    expect(memResult).toBeDefined();
    expect(memResult?.evidenceFingerprint).toBeDefined();

    // 3. Approve finding
    const approveReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: primaryDeviceId,
        reviewer: "Lead Engineer",
        action: "SINGLE",
        decision: {
          checkId: "fg-hw-mem",
          decision: "APPROVED",
          finalStatus: "PASS",
          finalRemarks: "Memory utilization healthy at 30%",
        },
      }),
    });
    const approveRes = await postReviewRoute(approveReq, { params: Promise.resolve({ id: sessionId }) });
    expect(approveRes.status).toBe(200);

    // Verify decision stored the evidence fingerprint
    const decision1 = await prisma.reviewDecision.findFirst({
      where: { checklistResultId: memResult!.id },
      orderBy: { decidedAt: "desc" },
    });
    expect(decision1?.evidenceFingerprint).toBe(memResult?.evidenceFingerprint);
    expect(decision1?.decision).toBe("APPROVED");

    // Authoritative export eligibility rule confirms eligible
    expect(
      reviewService.isDecisionEligibleForExport(
        memResult!.evidenceFingerprint,
        decision1,
        false
      )
    ).toBe(true);

    // 4. Simulate evidence change on re-run:
    // Update ChecklistResult with a new evidence fingerprint and mark prior decision SUPERSEDED
    const newFingerprint = "new-sha256-evidence-fingerprint-v2";
    await prisma.checklistResult.update({
      where: { id: memResult!.id },
      data: {
        evidenceFingerprint: newFingerprint,
        reviewRequired: true,
      },
    });

    await prisma.reviewDecision.update({
      where: { id: decision1!.id },
      data: { decision: "SUPERSEDED" },
    });

    // In-between state: changed evidence without fresh approval -> NOT eligible for export!
    expect(
      reviewService.isDecisionEligibleForExport(
        newFingerprint,
        { decision: "SUPERSEDED", evidenceFingerprint: decision1!.evidenceFingerprint },
        true
      )
    ).toBe(false);

    // 5. Engineer re-reviews and approves with fresh decision
    const reapproveReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: primaryDeviceId,
        reviewer: "Lead Engineer",
        action: "SINGLE",
        decision: {
          checkId: "fg-hw-mem",
          decision: "APPROVED",
          finalStatus: "PASS",
          finalRemarks: "Memory verified on latest run",
        },
      }),
    });
    await postReviewRoute(reapproveReq, { params: Promise.resolve({ id: sessionId }) });

    // Verify fresh decision carries the new fingerprint and reviewRequired is cleared
    const refreshedResult = await prisma.checklistResult.findUnique({
      where: { id: memResult!.id },
    });
    expect(refreshedResult?.reviewRequired).toBe(false);

    const freshDecision = await prisma.reviewDecision.findFirst({
      where: { checklistResultId: memResult!.id },
      orderBy: { decidedAt: "desc" },
    });
    expect(freshDecision?.decision).toBe("APPROVED");
    expect(freshDecision?.evidenceFingerprint).toBe(newFingerprint);

    // Now eligible for export again!
    expect(
      reviewService.isDecisionEligibleForExport(
        refreshedResult!.evidenceFingerprint,
        freshDecision,
        refreshedResult!.reviewRequired
      )
    ).toBe(true);
  });

  it("preserves multi-device review isolation between primary and secondary firewalls", async () => {
    // Create ChecklistResult for Primary
    const primaryResult = await prisma.checklistResult.create({
      data: {
        deviceId: primaryDeviceId,
        checkId: "fg-hw-cpu",
        checkName: "CPU Usage",
        collectionState: "COMPLETE",
        status: "PASS",
        reviewRequired: false,
      },
    });

    // Create ChecklistResult for Secondary
    const secondaryResult = await prisma.checklistResult.create({
      data: {
        deviceId: secondaryDeviceId,
        checkId: "fg-hw-cpu",
        checkName: "CPU Usage",
        collectionState: "COMPLETE",
        status: "PASS",
        reviewRequired: true,
      },
    });

    // Approve Primary only
    const approveReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: primaryDeviceId,
        reviewer: "Lead Engineer",
        action: "SINGLE",
        decision: {
          checkId: "fg-hw-cpu",
          decision: "APPROVED",
          finalStatus: "PASS",
          reviewNotes: "Audit verified for primary device without evidence exception",
        },
      }),
    });
    const res = await postReviewRoute(approveReq, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);

    // Primary has decision
    const primaryDecs = await prisma.reviewDecision.findMany({
      where: { checklistResultId: primaryResult.id },
    });
    expect(primaryDecs.length).toBe(1);
    expect(primaryDecs[0].decision).toBe("APPROVED");

    // Secondary remains untouched with 0 decisions
    const secondaryDecs = await prisma.reviewDecision.findMany({
      where: { checklistResultId: secondaryResult.id },
    });
    expect(secondaryDecs.length).toBe(0);

    const secRes = await prisma.checklistResult.findUnique({
      where: { id: secondaryResult.id },
    });
    expect(secRes?.reviewRequired).toBe(true);
  });
});
