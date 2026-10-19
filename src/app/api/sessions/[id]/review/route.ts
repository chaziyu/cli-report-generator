import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { docxInspector } from "@/core/document";
import { vendorRegistry, VendorId } from "@/vendors";
import { reviewService, ReviewDecisionInput } from "@/core/review";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const targetDeviceId = searchParams.get("deviceId") || undefined;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: {
          orderBy: { createdAt: "asc" },
        },
        uploadedFiles: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    if (session.devices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No target devices registered in this PM session" },
        { status: 400 }
      );
    }

    if (targetDeviceId && !session.devices.some((d) => d.id === targetDeviceId)) {
      return NextResponse.json(
        { success: false, error: "Target device does not belong to this session" },
        { status: 400 }
      );
    }

    const currentDevice = targetDeviceId
      ? session.devices.find((d) => d.id === targetDeviceId) || session.devices[0]
      : session.devices[0];

    const adapter = vendorRegistry.get(session.vendor as VendorId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `Vendor adapter "${session.vendor}" not found` },
        { status: 400 }
      );
    }

    const checklistDefinitions = adapter.getChecklistDefinition();

    // 1. Inspect uploaded Word report (if present) to get original document values
    const docxFile = session.uploadedFiles.find(
      (f) =>
        f.type === "WORD_REPORT" ||
        f.originalFilename.toLowerCase().endsWith(".docx")
    );

    let docRowTargets: import("@/report-layouts/types").EditableChecklistRowTarget[] = [];

    if (docxFile) {
      try {
        const fileBuffer = await storage.getFile(docxFile.storagePath);
        const inspectionResult = await docxInspector.inspectDocument(fileBuffer);
        docRowTargets = inspectionResult.editableChecklistRows;
      } catch (err) {
        console.warn("Could not inspect Word document for review comparison:", err);
      }
    }

    // 2. Fetch ChecklistResults for target device
    const checklistResults = await prisma.checklistResult.findMany({
      where: { deviceId: currentDevice.id },
      include: {
        reviewDecisions: {
          orderBy: { decidedAt: "desc" },
        },
      },
    });

    // 3. Fetch rendered CLI & GUI Evidence for target device and unassigned GUI session screenshots
    const evidences = await prisma.evidence.findMany({
      where: {
        OR: [
          { deviceId: currentDevice.id },
          {
            deviceId: null,
            uploadedFile: { sessionId },
          },
        ],
      },
      include: {
        commandExecution: {
          select: {
            command: true,
            commandGroup: true,
            parseStatus: true,
            parseError: true,
            outputContent: true,
          },
        },
        uploadedFile: {
          select: {
            id: true,
            originalFilename: true,
            hashSha256: true,
            sizeBytes: true,
            mimeType: true,
          },
        },
      },
      orderBy: [{ appendixMapping: "asc" }, { pageNumber: "asc" }],
    });

    // 4. Flatten all latest review decisions
    const flatDecisions = checklistResults.flatMap((r) => r.reviewDecisions);

    // 5. Build combined review items with rich evidence and health tracking
    const reviewItems = reviewService.buildReviewItems({
      checklistDefinitions,
      docRowTargets,
      checklistResults,
      evidences,
      decisions: flatDecisions,
      targetDeviceId: currentDevice.id,
      deviceHostname: currentDevice.hostname,
    });

    // Fix evidence image URLs to point to this session's evidence endpoint
    for (const item of reviewItems) {
      for (const ev of item.evidence) {
        ev.imageUrl = `/api/sessions/${sessionId}/evidence/${ev.id}`;
      }
    }

    const summary = reviewService.computeSummary(reviewItems);

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        customer: session.customer,
        vendor: session.vendor,
        engineerName: session.engineerName,
        sessionStatus: session.status,
        targetDevice: {
          id: currentDevice.id,
          hostname: currentDevice.hostname,
          model: currentDevice.model,
          role: currentDevice.role,
          haStatus: currentDevice.haStatus,
          serialNumber: currentDevice.serialNumber,
        },
        allDevices: session.devices.map((d) => ({
          id: d.id,
          hostname: d.hostname,
          role: d.role,
          model: d.model,
        })),
        hasOriginalDocument: Boolean(docxFile),
        originalDocumentFilename: docxFile?.originalFilename || null,
        originalDocumentId: docxFile?.id || null,
        summary,
        items: reviewItems,
      },
    });
  } catch (error) {
    console.error("Failed to load review data:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load review data",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();

    const {
      deviceId,
      reviewer,
      action = "SINGLE", // "SINGLE", "APPROVE_ALL", "APPROVE_PASSING", "BATCH_DECISIONS"
      decision: singleDecision,
      decisions: batchDecisions,
      defaultJustification,
    } = body;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    const targetDevice = deviceId
      ? session.devices.find((d) => d.id === deviceId)
      : session.devices[0];

    if (!targetDevice) {
      return NextResponse.json(
        { success: false, error: "Target device not found in session" },
        { status: 400 }
      );
    }

    const adapter = vendorRegistry.get(session.vendor as VendorId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `Vendor adapter "${session.vendor}" not found` },
        { status: 400 }
      );
    }

    const checklistDefinitions = adapter.getChecklistDefinition();
    const reviewerName = reviewer?.trim() || session.engineerName || "Lead Security Engineer";

    // Fetch existing checklist results and evidence for validation
    const existingResults = await prisma.checklistResult.findMany({
      where: { deviceId: targetDevice.id },
    });
    const resultByCheckId = new Map(existingResults.map((r) => [r.checkId, r]));

    const evidences = await prisma.evidence.findMany({
      where: { deviceId: targetDevice.id, isExcluded: false },
    });

    const decisionsToProcess: ReviewDecisionInput[] = [];
    const skippedItems: string[] = [];

    const checkHasEvidence = (
      def: { id: string; targetAppendix?: string | null; evidenceRequired?: boolean; sourceType?: string },
      evs: Array<{ checkId?: string | null; appendixMapping?: string | null; isExcluded?: boolean }> = []
    ): boolean => {
      const requiresEvidence = Boolean(def.evidenceRequired || def.targetAppendix || def.sourceType === "CLI");
      if (!requiresEvidence) return true;

      // 1. Check direct stable checkId match
      if (evs.some((e) => !e.isExcluded && e.checkId === def.id)) {
        return true;
      }
      // 2. Appendix mapping fallback
      if (!def.targetAppendix) return false;
      const cleanTarget = def.targetAppendix.toLowerCase().replace(/[^a-z0-9]/g, "");
      return evs.some((e) => {
        if (e.isExcluded || !e.appendixMapping) return false;
        const cleanMap = e.appendixMapping.toLowerCase().replace(/[^a-z0-9]/g, "");
        return cleanMap.includes(cleanTarget) || cleanTarget.includes(cleanMap);
      });
    };

    if (action === "APPROVE_ALL" || action === "APPROVE_PASSING") {
      for (const def of checklistDefinitions) {
        const result = resultByCheckId.get(def.id);
        const evalStatus = reviewService.normalizeStatus(result?.status || "PENDING");
        const hasEv = checkHasEvidence(def, evidences);
        const requiresEvidence = Boolean(def.evidenceRequired || def.targetAppendix || def.sourceType === "CLI");

        const isEvidenceMissing = requiresEvidence && (!hasEv || result?.collectionState === "MISSING");
        const isWarningOrFail = evalStatus === "FAIL" || evalStatus === "WARNING";

        // In APPROVE_PASSING mode: only approve clean checks that passed and have required evidence
        if (action === "APPROVE_PASSING") {
          const isEligible = reviewService.isEligibleForPassingBatchApproval({
            sourceType: def.sourceType,
            status: result?.status || "PENDING",
            collectionState: result?.collectionState || "MISSING",
            requiresEvidence,
            hasEvidence: hasEv,
            reviewRequired: result?.reviewRequired,
          });

          if (isEligible) {
            decisionsToProcess.push({
              checkId: def.id,
              decision: "APPROVED",
              finalStatus: "PASS",
              finalRemarks: result?.remarks || def.description,
            });
          } else {
            skippedItems.push(def.taskName);
          }
          continue;
        }

        // In APPROVE_ALL mode:
        if (isEvidenceMissing || isWarningOrFail) {
          if (defaultJustification) {
            decisionsToProcess.push({
              checkId: def.id,
              decision: "APPROVED",
              finalStatus: result?.status || "PASS",
              finalRemarks: result?.remarks || def.description,
              reviewNotes: defaultJustification,
            });
          } else {
            skippedItems.push(`${def.taskName} (${evalStatus}, evidence missing: ${isEvidenceMissing})`);
          }
        } else {
          decisionsToProcess.push({
            checkId: def.id,
            decision: "APPROVED",
            finalStatus: result?.status || "PASS",
            finalRemarks: result?.remarks || def.description,
          });
        }
      }
    } else if (action === "BATCH_DECISIONS" && Array.isArray(batchDecisions)) {
      decisionsToProcess.push(...batchDecisions);
    } else if (singleDecision) {
      decisionsToProcess.push(singleDecision);
    } else {
      return NextResponse.json(
        { success: false, error: "No review decision provided in request body" },
        { status: 400 }
      );
    }

    const recordedDecisions = [];

    // Process and persist each decision
    for (const dec of decisionsToProcess) {
      const def = checklistDefinitions.find((d) => d.id === dec.checkId);
      if (!def) continue;

      let checklistResult = resultByCheckId.get(dec.checkId);

      // If ChecklistResult doesn't exist yet for this check, create it first
      if (!checklistResult) {
        checklistResult = await prisma.checklistResult.create({
          data: {
            deviceId: targetDevice.id,
            checkId: def.id,
            checkName: def.taskName,
            sectionName: def.group || null,
            targetAppendix: def.targetAppendix || null,
            collectionState: "MISSING",
            status: "PENDING",
            expectedValue: def.thresholdDescription || null,
            remarks: null,
            reviewRequired: true,
          },
        });
        resultByCheckId.set(def.id, checklistResult);
      }

      const hasEv = checkHasEvidence(def, evidences);

      // Validate decision using ReviewService
      const validation = reviewService.validateDecision(
        def,
        {
          checklistResultId: checklistResult.id,
          status: checklistResult.status,
          currentValue: checklistResult.currentValue,
          expectedValue: checklistResult.expectedValue,
          proposedRemarks: checklistResult.remarks,
          collectionState: checklistResult.collectionState,
          reviewRequired: checklistResult.reviewRequired,
        },
        hasEv,
        dec
      );

      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            error: validation.error || `Invalid decision for check "${def.taskName}"`,
            checkId: def.id,
          },
          { status: 400 }
        );
      }

      // Persist ReviewDecision in SQLite with current evidence fingerprint
      const createdDecision = await prisma.reviewDecision.create({
        data: {
          checklistResultId: checklistResult.id,
          proposedStatus: checklistResult.status,
          proposedRemarks: checklistResult.remarks,
          evidenceFingerprint: checklistResult.evidenceFingerprint,
          decision: dec.decision,
          finalStatus:
            dec.decision === "REJECTED"
              ? null
              : dec.finalStatus || checklistResult.status,
          finalRemarks:
            dec.decision === "REJECTED"
              ? null
              : dec.finalRemarks ?? checklistResult.remarks,
          reviewer: reviewerName,
          reviewNotes: dec.reviewNotes || null,
          decidedAt: new Date(),
        },
      });

      // Update reviewRequired on ChecklistResult
      if (dec.decision === "APPROVED" || dec.decision === "MODIFIED") {
        await prisma.checklistResult.update({
          where: { id: checklistResult.id },
          data: { reviewRequired: false },
        });
      }

      recordedDecisions.push(createdDecision);
    }

    // Transition session status to REVIEW if currently DRAFT or IN_PROGRESS
    if (session.status === "DRAFT" || session.status === "IN_PROGRESS") {
      await prisma.pMSession.update({
        where: { id: session.id },
        data: { status: "REVIEW" },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        deviceId: targetDevice.id,
        reviewer: reviewerName,
        decisionsRecorded: recordedDecisions.length,
        skippedItems,
        message:
          skippedItems.length > 0
            ? `Successfully recorded ${recordedDecisions.length} decision(s). Skipped ${skippedItems.length} item(s) requiring justification.`
            : `Successfully recorded ${recordedDecisions.length} decision(s).`,
      },
    });
  } catch (error) {
    console.error("Failed to persist review decision:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to record review decision",
      },
      { status: 500 }
    );
  }
}
