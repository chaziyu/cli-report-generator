import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as processRoute } from "@/app/api/sessions/[id]/process/route";
import { pipelineLock } from "@/core/workflow/pipeline-lock";
import { NextRequest } from "next/server";

describe("POST /api/sessions/[id]/process Integration", () => {
  let sessionId: string;
  let deviceId: string;
  let logFileId: string;

  beforeEach(async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Maybank Islamic",
        vendor: "fortigate",
        status: "DRAFT",
      },
    });
    sessionId = session.id;

    const device = await prisma.device.create({
      data: {
        sessionId,
        hostname: "MY-MBB-FW01",
        model: "FortiGate-100F",
        role: "Primary",
      },
    });
    deviceId = device.id;

    // Save authentic PuTTY log
    const logContent = `
MY-MBB-FW01 # get system status
Version: FortiGate-100F v7.0.12,build0523,230504 (GA.M)
Serial-Number: FG100FTK20000001
Hostname: MY-MBB-FW01
Operation Mode: NAT
Current virtual domain: root

MY-MBB-FW01 # get system performance status
CPU states: 1% user 2% system 0% nice 97% idle 0% iowait 0% irq 0% softirq
Memory: 4194304k total, 1258291k used (30%), 2936013k free (70%)
Average sessions: 450 concurrent sessions
Uptime: 45 days, 3 hours, 12 minutes
`;

    const storedLog = await storage.saveFile(
      sessionId,
      "logs",
      "putty_mbb.txt",
      Buffer.from(logContent, "utf8"),
      "text/plain"
    );

    const uploaded = await prisma.uploadedFile.create({
      data: {
        sessionId,
        deviceId,
        originalFilename: "putty_mbb.txt",
        storedFilename: storedLog.storedFilename,
        storagePath: storedLog.storagePath,
        mimeType: "text/plain",
        sizeBytes: storedLog.sizeBytes,
        type: "PUTTY_LOG",
        hashSha256: storedLog.hashSha256,
      },
    });
    logFileId = uploaded.id;
  });

  afterEach(async () => {
    await prisma.pMSession.deleteMany({
      where: { id: sessionId },
    });
  });

  it("executes the full processing pipeline end-to-end and returns HTTP 200 with summary", async () => {
    const req = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await processRoute(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.mode).toBe("CLI_ONLY");
    expect(body.data.status).toBe("READY_FOR_REVIEW");

    // Verify summary metrics
    const summary = body.data.summary;
    expect(summary.devicesEvaluated).toBe(1);
    expect(summary.logsProcessed).toBe(1);
    expect(summary.commandsSegmented).toBeGreaterThanOrEqual(2);
    expect(summary.cliEvidencePages).toBeGreaterThan(0);

    // Verify ChecklistResult persistence in SQLite
    const results = await prisma.checklistResult.findMany({
      where: { deviceId },
    });
    expect(results.length).toBeGreaterThan(0);

    // CPU snapshot should evaluate to REVIEW (instantaneous snapshot requires review)
    const cpuResult = results.find((r) => r.checkId === "fg-hw-cpu");
    expect(cpuResult).toBeDefined();
    expect(cpuResult?.status).toBe("REVIEW");
    expect(cpuResult?.reviewRequired).toBe(true);
    expect(cpuResult?.evidenceFingerprint).toBeDefined();

    // Verify rendered terminal evidence
    const evidences = await prisma.evidence.findMany({
      where: { deviceId },
    });
    expect(evidences.length).toBeGreaterThan(0);
    expect(evidences[0].imageReference).toContain("evidence/");
    expect(evidences[0].imageReference).toContain("_cli_");
    expect(evidences[0].isExcluded).toBe(false);
  });

  it("returns HTTP 409 Conflict when an active lease is held by another worker", async () => {
    // Acquire lease externally
    const activeRunId = await pipelineLock.acquireLease(sessionId, 5);

    const req = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await processRoute(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("SESSION_LOCKED");
    expect(body.activeRunId).toBe(activeRunId);

    // Release lease
    await pipelineLock.releaseLease(sessionId, activeRunId);
  });

  it("handles manual device confirmation for ambiguous logs", async () => {
    // Create an ambiguous log with unmatched prompt hostname
    const ambigContent = `FW-UNKNOWN-HQ # get system status\nVersion: FortiGate-200F v7.2.5\n`;
    const storedAmbig = await storage.saveFile(
      sessionId,
      "logs",
      "ambig_log.txt",
      Buffer.from(ambigContent, "utf8"),
      "text/plain"
    );

    const ambigUpload = await prisma.uploadedFile.create({
      data: {
        sessionId,
        deviceId: null,
        originalFilename: "ambig_log.txt",
        storedFilename: storedAmbig.storedFilename,
        storagePath: storedAmbig.storagePath,
        mimeType: "text/plain",
        sizeBytes: storedAmbig.sizeBytes,
        type: "PUTTY_LOG",
        hashSha256: storedAmbig.hashSha256,
      },
    });

    // Run pipeline with manual device confirmation
    const req = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({
        deviceConfirmations: [
          { fileId: ambigUpload.id, deviceId },
        ],
      }),
    });

    const res = await processRoute(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.ambiguousLogs.length).toBe(0);

    // Verify uploaded file is now assigned to confirmed device
    const updatedFile = await prisma.uploadedFile.findUnique({
      where: { id: ambigUpload.id },
    });
    expect(updatedFile?.deviceId).toBe(deviceId);
  });
});
