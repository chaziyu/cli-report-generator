import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { reviewService } from "@/core/review";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string; evidenceId: string }>;
}

/**
 * Resolves authoritative session ownership for an evidence record.
 */
async function getEvidenceWithSession(evidenceId: string) {
  return prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      commandExecution: {
        include: {
          device: true,
        },
      },
      uploadedFile: true,
    },
  });
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId, evidenceId } = await params;

    const evidence = await getEvidenceWithSession(evidenceId);

    if (!evidence) {
      return NextResponse.json(
        { success: false, error: "Evidence record not found" },
        { status: 404 }
      );
    }

    // Authoritative session boundary check: evidence must belong to the requested sessionId
    let authoritativeSessionId: string | null = null;
    if (evidence.uploadedFile?.sessionId) {
      authoritativeSessionId = evidence.uploadedFile.sessionId;
    } else if (evidence.commandExecution?.device?.sessionId) {
      authoritativeSessionId = evidence.commandExecution.device.sessionId;
    } else if (evidence.deviceId) {
      const dev = await prisma.device.findUnique({
        where: { id: evidence.deviceId },
        select: { sessionId: true },
      });
      authoritativeSessionId = dev?.sessionId || null;
    }

    if (!authoritativeSessionId || authoritativeSessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: "Evidence record not found in session" },
        { status: 404 }
      );
    }

    const imageBuffer = await storage.getFile(evidence.imageReference);

    // Determine verified safe content-type via magic bytes
    let contentType = "image/png";
    if (
      imageBuffer.length >= 3 &&
      imageBuffer[0] === 0xff &&
      imageBuffer[1] === 0xd8 &&
      imageBuffer[2] === 0xff
    ) {
      contentType = "image/jpeg";
    }

    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": imageBuffer.byteLength.toString(),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to read evidence image:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to load evidence image",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId, evidenceId } = await params;
    const body = await request.json();
    const { checkId, deviceId, title, appendixMapping, isExcluded, action } = body;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: { devices: true },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    const evidence = await getEvidenceWithSession(evidenceId);
    if (!evidence) {
      return NextResponse.json(
        { success: false, error: "Evidence record not found" },
        { status: 404 }
      );
    }

    // Authoritative session boundary validation
    let authoritativeSessionId: string | null = null;
    if (evidence.uploadedFile?.sessionId) {
      authoritativeSessionId = evidence.uploadedFile.sessionId;
    } else if (evidence.commandExecution?.device?.sessionId) {
      authoritativeSessionId = evidence.commandExecution.device.sessionId;
    } else if (evidence.deviceId) {
      const dev = await prisma.device.findUnique({
        where: { id: evidence.deviceId },
        select: { sessionId: true },
      });
      authoritativeSessionId = dev?.sessionId || null;
    }

    if (!authoritativeSessionId || authoritativeSessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: "Evidence record does not belong to this session" },
        { status: 404 }
      );
    }

    // Issue 2: Prevent CLI evidence from being arbitrarily reassigned
    const isCliEvidence = Boolean(
      evidence.commandExecutionId !== null ||
        evidence.sourceLabel.toLowerCase().includes("putty") ||
        (evidence.uploadedFile && evidence.uploadedFile.type !== "GUI_SCREENSHOT")
    );

    if (isCliEvidence) {
      const isReassigningTask = checkId !== undefined && checkId !== evidence.checkId;
      const isReassigningDevice = deviceId !== undefined && deviceId !== evidence.deviceId;

      if (isReassigningTask || isReassigningDevice) {
        return NextResponse.json(
          {
            success: false,
            error:
              "CLI terminal evidence cannot be reassigned to a different device or task. It is deterministically tied to the source PuTTY command execution. Correct mapping in the log reconciler and reprocess if needed.",
          },
          { status: 400 }
        );
      }
    }

    // Validate target device belongs to session if provided
    if (deviceId !== undefined && deviceId !== null) {
      const targetDev = session.devices.find((d) => d.id === deviceId);
      if (!targetDev) {
        return NextResponse.json(
          { success: false, error: "Target device does not belong to this session" },
          { status: 400 }
        );
      }
    }

    // Issue 3: Explicit exclusion and restoration
    let nextExcluded = evidence.isExcluded;
    if (action === "EXCLUDE" || isExcluded === true) {
      nextExcluded = true;
    } else if (action === "RESTORE" || isExcluded === false) {
      nextExcluded = false;
    }

    const oldDeviceId = evidence.deviceId;
    const oldCheckId = evidence.checkId;
    const oldExcluded = evidence.isExcluded;

    const newDeviceId = deviceId !== undefined ? deviceId : oldDeviceId;
    const newCheckId = checkId !== undefined ? checkId : oldCheckId;

    // Update Evidence in database
    const updatedEvidence = await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        checkId: newCheckId,
        deviceId: newDeviceId,
        title: title !== undefined ? title : evidence.title,
        appendixMapping:
          appendixMapping !== undefined ? appendixMapping : evidence.appendixMapping,
        isExcluded: nextExcluded,
        caption:
          appendixMapping !== undefined
            ? `${appendixMapping}: ${title || evidence.title}`
            : evidence.caption,
      },
      include: {
        commandExecution: true,
        uploadedFile: true,
      },
    });

    // Issue 1: Recalculate affected finding fingerprints and invalidate stale approvals
    const isMaterialChange =
      newCheckId !== oldCheckId ||
      newDeviceId !== oldDeviceId ||
      nextExcluded !== oldExcluded;

    if (isMaterialChange) {
      // 1. Recalculate former finding if it existed
      if (oldDeviceId && oldCheckId) {
        await reviewService.recalculateFindingEvidenceState(
          sessionId,
          oldDeviceId,
          oldCheckId,
          "Evidence was reassigned away from this finding. Prior approval invalidated."
        );
      }

      // 2. Recalculate new finding if different from former
      if (newDeviceId && newCheckId && (newDeviceId !== oldDeviceId || newCheckId !== oldCheckId)) {
        await reviewService.recalculateFindingEvidenceState(
          sessionId,
          newDeviceId,
          newCheckId,
          "New evidence was assigned to this finding. Engineer review required."
        );
      } else if (newDeviceId && newCheckId && nextExcluded !== oldExcluded) {
        await reviewService.recalculateFindingEvidenceState(
          sessionId,
          newDeviceId,
          newCheckId,
          nextExcluded
            ? "Evidence was excluded from report. Finding status requires re-review."
            : "Evidence was restored to report. Finding status requires re-review."
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedEvidence,
    });
  } catch (error) {
    console.error("Failed to update evidence metadata:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update evidence metadata",
      },
      { status: 500 }
    );
  }
}
