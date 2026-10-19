import { prisma } from "@/lib/db/prisma";
import { IVendorAdapter } from "@/vendors/types";
import { CommandSegment } from "./types";

export interface PersistCommandSegmentsParams {
  sessionId: string;
  deviceId: string;
  sourceFileId: string;
  segments: CommandSegment[];
  adapter: IVendorAdapter;
}

export interface PersistCommandSegmentsResult {
  savedCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
}

/**
 * Idempotently persists command execution segments into SQLite.
 * - Reconciles obsolete command segments when replacement/re-processed logs are shorter.
 * - Updates changed command output in place preserving execution identity and dependencies.
 * - Rejects cross-session device confirmations and enforces device/session ownership.
 */
export async function persistCommandSegments({
  sessionId,
  deviceId,
  sourceFileId,
  segments,
  adapter,
}: PersistCommandSegmentsParams): Promise<PersistCommandSegmentsResult> {
  // 1. Authoritative device & session boundary verification (reject cross-session confirmations)
  const device = await prisma.device.findFirst({
    where: { id: deviceId, sessionId },
  });
  if (!device) {
    throw new Error(
      `Cross-session violation: device "${deviceId}" does not belong to session "${sessionId}".`
    );
  }

  // 2. Verify source file belongs to session
  const file = await prisma.uploadedFile.findFirst({
    where: { id: sourceFileId, sessionId },
  });
  if (!file) {
    throw new Error(
      `Cross-session violation: file "${sourceFileId}" does not belong to session "${sessionId}".`
    );
  }

  const commands = adapter.getCommands();
  const cmdGroupMap = new Map(commands.map((c) => [c.id, c.group]));

  // 3. Find existing executions for this device and sourceFile to update in place
  const existingExecs = await prisma.commandExecution.findMany({
    where: {
      deviceId,
      sourceFileId,
    },
    orderBy: { segmentIndex: "asc" },
  });

  let savedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  // 4. Update or create segments in place preserving segmentIndex ordering
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const group = seg.commandId ? cmdGroupMap.get(seg.commandId) : undefined;
    const existing = existingExecs.find((e) => e.segmentIndex === i);

    if (existing) {
      const isUnchanged =
        existing.command === seg.command &&
        existing.outputContent === seg.rawOutput &&
        existing.parseStatus === seg.commandStatus &&
        existing.executionContext === (seg.executionContext || null) &&
        existing.parseError === (seg.errorMessage || null);

      if (!isUnchanged) {
        await prisma.commandExecution.update({
          where: { id: existing.id },
          data: {
            command: seg.command,
            commandGroup: group || null,
            executionContext: seg.executionContext || null,
            rawOutputRef: seg.id,
            outputContent: seg.rawOutput,
            parseStatus: seg.commandStatus,
            parseError: seg.errorMessage || null,
          },
        });
        updatedCount++;
      }
    } else {
      await prisma.commandExecution.create({
        data: {
          deviceId,
          sourceFileId,
          segmentIndex: i,
          command: seg.command,
          commandGroup: group || null,
          executionContext: seg.executionContext || null,
          rawOutputRef: seg.id,
          outputContent: seg.rawOutput,
          parseStatus: seg.commandStatus,
          parseError: seg.errorMessage || null,
        },
      });
      createdCount++;
    }
    savedCount++;
  }

  // 5. Reconcile obsolete command segments (e.g. if the log was shortened upon re-upload)
  const obsoleteExecs = existingExecs.filter(
    (e) => e.segmentIndex === null || e.segmentIndex >= segments.length
  );
  if (obsoleteExecs.length > 0) {
    const obsoleteIds = obsoleteExecs.map((e) => e.id);
    await prisma.commandExecution.deleteMany({
      where: { id: { in: obsoleteIds } },
    });
    deletedCount += obsoleteIds.length;
  }

  // 6. Associate uploaded file with resolved device
  await prisma.uploadedFile.update({
    where: { id: sourceFileId },
    data: { deviceId },
  });

  return { savedCount, createdCount, updatedCount, deletedCount };
}
