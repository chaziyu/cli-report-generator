import { prisma } from "@/lib/db/prisma";
import { createHash } from "crypto";

export class PipelineLockError extends Error {
  constructor(message: string, public readonly activeRunId?: string) {
    super(message);
    this.name = "PipelineLockError";
  }
}

export class PipelineLock {
  /**
   * Acquires a crash-recoverable lease on a PM session.
   * If a previous run expired (leaseExpiresAt < now), recovers the lease automatically.
   */
  async acquireLease(
    sessionId: string,
    timeoutMinutes: number = 5
  ): Promise<string> {
    const now = new Date();
    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        processingRunId: true,
        processingLeaseExpiresAt: true,
      },
    });

    if (!session) {
      throw new PipelineLockError(`PM session "${sessionId}" not found.`);
    }

    // Check if an active non-expired lease exists
    if (
      session.processingRunId &&
      session.processingLeaseExpiresAt &&
      session.processingLeaseExpiresAt > now
    ) {
      const remainingSeconds = Math.ceil(
        (session.processingLeaseExpiresAt.getTime() - now.getTime()) / 1000
      );
      throw new PipelineLockError(
        `Session is currently being processed by run "${session.processingRunId}". Active lease expires in ${remainingSeconds}s.`,
        session.processingRunId
      );
    }

    // Generate unique run ID
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

    // Atomically set lease
    await prisma.pMSession.update({
      where: { id: sessionId },
      data: {
        processingRunId: runId,
        processingLeaseExpiresAt: expiresAt,
      },
    });

    return runId;
  }

  /**
   * Verifies that the worker still holds the valid active lease.
   */
  async verifyLease(sessionId: string, runId: string): Promise<boolean> {
    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      select: {
        processingRunId: true,
        processingLeaseExpiresAt: true,
      },
    });

    if (!session) return false;
    if (session.processingRunId !== runId) return false;
    if (
      session.processingLeaseExpiresAt &&
      session.processingLeaseExpiresAt < new Date()
    ) {
      return false;
    }
    return true;
  }

  /**
   * Releases lease when processing succeeds or fails.
   */
  async releaseLease(sessionId: string, runId: string): Promise<void> {
    try {
      const session = await prisma.pMSession.findUnique({
        where: { id: sessionId },
        select: { processingRunId: true },
      });

      if (session && session.processingRunId === runId) {
        await prisma.pMSession.update({
          where: { id: sessionId },
          data: {
            processingRunId: null,
            processingLeaseExpiresAt: null,
          },
        });
      }
    } catch (err) {
      console.error(`Failed to release lease for session ${sessionId}:`, err);
    }
  }
}

export const pipelineLock = new PipelineLock();
