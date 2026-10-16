import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { pipelineLock, PipelineLockError } from "@/core/workflow/pipeline-lock";

describe("PipelineLock (Database-Backed Processing Lease)", () => {
  let sessionId: string;

  beforeEach(async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Test Lease Customer",
        vendor: "fortigate",
        status: "DRAFT",
      },
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await prisma.pMSession.deleteMany({
      where: { id: sessionId },
    });
  });

  it("acquires lease and assigns a unique run ID with expiry", async () => {
    const runId = await pipelineLock.acquireLease(sessionId, 5);
    expect(runId).toBeDefined();
    expect(runId).toMatch(/^run_\d+_[a-z0-9]+$/);

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    expect(session?.processingRunId).toBe(runId);
    expect(session?.processingLeaseExpiresAt).toBeDefined();
    expect(session!.processingLeaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    await pipelineLock.releaseLease(sessionId, runId);
  });

  it("prevents concurrent execution when an active lease exists", async () => {
    const runId1 = await pipelineLock.acquireLease(sessionId, 5);

    await expect(pipelineLock.acquireLease(sessionId, 5)).rejects.toThrow(
      PipelineLockError
    );

    // Verify error contains active run ID
    try {
      await pipelineLock.acquireLease(sessionId, 5);
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineLockError);
      expect((err as PipelineLockError).activeRunId).toBe(runId1);
    }

    await pipelineLock.releaseLease(sessionId, runId1);
  });

  it("recovers automatically from a crashed run after lease expiry", async () => {
    // Simulate a crashed run by setting expired lease timestamp in the past
    const crashedRunId = "run_crashed_123456";
    const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago

    await prisma.pMSession.update({
      where: { id: sessionId },
      data: {
        processingRunId: crashedRunId,
        processingLeaseExpiresAt: pastDate,
      },
    });

    // New worker should recover lease without getting locked out
    const newRunId = await pipelineLock.acquireLease(sessionId, 5);
    expect(newRunId).toBeDefined();
    expect(newRunId).not.toBe(crashedRunId);

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    expect(session?.processingRunId).toBe(newRunId);

    await pipelineLock.releaseLease(sessionId, newRunId);
  });

  it("detects stale worker when lease has been taken over or expired", async () => {
    const runId = await pipelineLock.acquireLease(sessionId, 5);

    // Valid lease
    const isValid = await pipelineLock.verifyLease(sessionId, runId);
    expect(isValid).toBe(true);

    // Stale runId
    const isStaleValid = await pipelineLock.verifyLease(sessionId, "run_old_stale");
    expect(isStaleValid).toBe(false);

    // Expired lease
    await prisma.pMSession.update({
      where: { id: sessionId },
      data: {
        processingLeaseExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const isExpiredValid = await pipelineLock.verifyLease(sessionId, runId);
    expect(isExpiredValid).toBe(false);

    await pipelineLock.releaseLease(sessionId, runId);
  });

  it("releases lease cleanly upon completion", async () => {
    const runId = await pipelineLock.acquireLease(sessionId, 5);
    await pipelineLock.releaseLease(sessionId, runId);

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    expect(session?.processingRunId).toBeNull();
    expect(session?.processingLeaseExpiresAt).toBeNull();

    // Subsequent worker can immediately acquire lease
    const newRunId = await pipelineLock.acquireLease(sessionId, 5);
    expect(newRunId).toBeDefined();
    await pipelineLock.releaseLease(sessionId, newRunId);
  });
});
