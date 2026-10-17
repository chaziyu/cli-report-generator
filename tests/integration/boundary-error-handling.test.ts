import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as processRoute } from "@/app/api/sessions/[id]/process/route";
import { POST as exportRoute } from "@/app/api/sessions/[id]/export/route";
import { NextRequest } from "next/server";
import { pipelineLock } from "@/core/workflow/pipeline-lock";

describe("Phase 10: Boundary Conditions, Error Handling & Concurrency", () => {
  let sessionId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore
      }
    }
  });

  it("handles CLI-only mode gracefully when no Word report template is uploaded", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Test Bank",
        vendor: "fortigate",
        status: "DRAFT",
        devices: {
          create: [{ hostname: "FW-TEST", model: "FortiGate 80F", role: "Standalone" }],
        },
      },
      include: { devices: true },
    });
    sessionId = session.id;

    // Upload only a log file (no report)
    const logContent = `
FW-TEST # get system status
Version: FortiGate-80F v7.0.14
Hostname: FW-TEST
`;
    const stored = await storage.saveFile(
      sessionId,
      "logs",
      "test.log",
      Buffer.from(logContent),
      "text/plain"
    );
    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: "test.log",
        storedFilename: stored.storedFilename,
        storagePath: stored.storagePath,
        hashSha256: stored.hashSha256,
        sizeBytes: stored.sizeBytes,
        mimeType: "text/plain",
      },
    });

    const processReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const processRes = await processRoute(processReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(processRes.status).toBe(200);
    const body = await processRes.json();
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe("CLI_ONLY");
  });

  it("handles corrupted DOCX files gracefully during export without crashing server", async () => {
    const corruptBuffer = Buffer.from("NOT_A_VALID_ZIP_PACKAGE_JUST_RANDOM_BYTES");
    const storedCorrupt = await storage.saveFile(
      sessionId,
      "reports",
      "corrupted.docx",
      corruptBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "WORD_REPORT",
        originalFilename: "corrupted.docx",
        storedFilename: storedCorrupt.storedFilename,
        storagePath: storedCorrupt.storagePath,
        hashSha256: storedCorrupt.hashSha256,
        sizeBytes: storedCorrupt.sizeBytes,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: { devices: true },
    });
    const deviceId = session!.devices[0].id;

    const exportReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/export`, {
      method: "POST",
      body: JSON.stringify({ deviceId, engineerName: "Test Engineer" }),
    });
    const exportRes = await exportRoute(exportReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect([400, 500]).toContain(exportRes.status);
    const errorBody = await exportRes.json();
    expect(errorBody.error || errorBody.message).toBeDefined();
  });

  it("prevents concurrent pipeline processing on the same session using pipeline lease lock", async () => {
    // Acquire lease using acquireLease
    const runId = await pipelineLock.acquireLease(sessionId, 5);
    expect(runId).toBeDefined();

    // Second request while locked should receive 409 Conflict
    const processReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const processRes = await processRoute(processReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(processRes.status).toBe(409);
    const body = await processRes.json();
    expect(body.error).toBe("SESSION_LOCKED");
    expect(body.message).toContain("Session is currently being processed");

    // Release lease
    await pipelineLock.releaseLease(sessionId, runId);
  });
});
