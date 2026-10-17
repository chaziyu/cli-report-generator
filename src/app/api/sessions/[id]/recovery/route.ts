import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { docxInspector } from "@/core/document/docx-inspector";
import { metadataReconciler } from "@/core/session/metadata-reconciler";
import { reviewService } from "@/core/review";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export interface SessionRecoveryResponse {
  session: {
    id: string;
    customer: string;
    vendor: string;
    engineerName: string | null;
    pmDate: string;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  files: {
    docxReport: {
      id: string;
      originalFilename: string;
      sizeBytes: number;
      createdAt: string;
      storagePath: string;
      existsOnDisk: boolean;
      layoutName?: string;
      isSupportedLayout?: boolean;
    } | null;
    puttyLogs: Array<{
      id: string;
      originalFilename: string;
      sizeBytes: number;
      createdAt: string;
      storagePath: string;
      existsOnDisk: boolean;
      deviceId: string | null;
      deviceHostname: string | null;
      commandCount: number;
      status: "PARSED" | "PARTIAL" | "FAILED" | "PENDING";
    }>;
    guiScreenshots: Array<{
      id: string;
      originalFilename: string;
      sizeBytes: number;
      createdAt: string;
      storagePath: string;
      existsOnDisk: boolean;
      evidenceCount: number;
    }>;
    missingDiskFiles: string[];
  };
  devices: Array<{
    id: string;
    hostname: string;
    model: string | null;
    serialNumber: string | null;
    role: string | null;
    haStatus: string | null;
    commandsCount: number;
    checklistResultsCount: number;
  }>;
  metadata: {
    customer: string;
    model: string | null;
    primaryHostname: string | null;
    devices: Array<{
      hostname: string;
      model?: string;
      role: string;
      source: "DOCX" | "CLI" | "BOTH";
    }>;
    isAmbiguous: boolean;
    ambiguityReason?: string;
  };
  pipelineState: {
    hasRun: boolean;
    status: "NOT_STARTED" | "PROCESSING" | "INTERRUPTED" | "SUCCESS" | "PARTIAL" | "FAILED" | "RE_REVIEW_REQUIRED";
    totalCommands: number;
    parsedCommandsCount: number;
    failedCommandsCount: number;
    totalChecks: number;
    completeChecksCount: number;
    incompleteChecksCount: number;
    missingChecksCount: number;
    passCount: number;
    warnCount: number;
    failCount: number;
    naCount: number;
    reviewRequiredCount: number;
    lastExecutedAt: string | null;
    devices: Array<{
      id: string;
      hostname: string;
      role: string | null;
      commandsCount: number;
      checksCount: number;
      passCount: number;
      warnCount: number;
      failCount: number;
      naCount: number;
    }>;
  };
  reviewState: {
    totalFindings: number;
    approvedCount: number;
    pendingReviewCount: number;
    rejectedCount: number;
    modifiedCount: number;
  };
  evidenceState: {
    totalEvidence: number;
    activeEvidence: number;
    excludedEvidence: number;
    cliEvidenceCount: number;
    guiEvidenceCount: number;
    items: Array<{
      id: string;
      deviceId: string | null;
      checkId: string | null;
      title: string;
      appendixMapping: string | null;
      isExcluded: boolean;
      isRedacted: boolean;
      pageNumber: number;
      totalPages: number;
      sourceLabel: string;
      sourceType: "CLI" | "GUI";
      existsOnDisk: boolean;
      createdAt: string;
    }>;
  };
  reportsState: {
    totalReports: number;
    reports: Array<{
      id: string;
      version: number;
      generationStatus: string;
      downloadUrl: string;
      storagePath: string;
      existsOnDisk: boolean;
      createdAt: string;
      changeSummary: any;
    }>;
    latestReport: {
      id: string;
      version: number;
      downloadUrl: string;
      createdAt: string;
    } | null;
  };
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: {
          include: {
            commandExecutions: true,
            checklistResults: {
              include: {
                reviewDecisions: { orderBy: { decidedAt: "desc" }, take: 1 },
              },
            },
          },
        },
        uploadedFiles: {
          include: {
            evidences: true,
          },
          orderBy: { createdAt: "asc" },
        },
        generatedReports: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    const missingDiskFiles: string[] = [];

    // 1. Process Uploaded Files
    let docxReportData: SessionRecoveryResponse["files"]["docxReport"] = null;
    const puttyLogsData: SessionRecoveryResponse["files"]["puttyLogs"] = [];
    const guiScreenshotsData: SessionRecoveryResponse["files"]["guiScreenshots"] = [];

    // Map devices by id for fast lookup
    const deviceMap = new Map(session.devices.map((d) => [d.id, d]));

    let docxMetadataExtracted: any = null;

    for (const file of session.uploadedFiles) {
      const exists = await storage.fileExists(file.storagePath);
      if (!exists) {
        missingDiskFiles.push(`Uploaded file '${file.originalFilename}' (${file.type}) not found on disk.`);
      }

      if (file.type === "WORD_REPORT" || file.originalFilename.toLowerCase().endsWith(".docx")) {
        let layoutName = "Unknown";
        let isSupportedLayout = false;

        if (exists) {
          try {
            const buf = await storage.getFile(file.storagePath);
            const inspection = await docxInspector.inspectDocument(buf);
            layoutName = inspection.layoutName;
            isSupportedLayout = inspection.isSupportedLayout;
            docxMetadataExtracted = inspection.metadata || null;
          } catch {
            // Non-blocking inspection failure
          }
        }

        docxReportData = {
          id: file.id,
          originalFilename: file.originalFilename,
          sizeBytes: file.sizeBytes,
          createdAt: file.createdAt.toISOString(),
          storagePath: file.storagePath,
          existsOnDisk: exists,
          layoutName,
          isSupportedLayout,
        };
      } else if (file.type === "PUTTY_LOG" || file.originalFilename.toLowerCase().endsWith(".txt") || file.originalFilename.toLowerCase().endsWith(".log")) {
        // Find commands originating from this source log file
        const fileCommands: any[] = [];
        for (const d of session.devices) {
          for (const c of d.commandExecutions) {
            if (c.sourceFileId === file.id) {
              fileCommands.push(c);
            }
          }
        }

        const dev = file.deviceId ? deviceMap.get(file.deviceId) : null;
        let logStatus: "PARSED" | "PARTIAL" | "FAILED" | "PENDING" = "PENDING";

        if (fileCommands.length > 0) {
          const hasFailed = fileCommands.some((c) => c.parseStatus === "FAILED");
          const hasParsed = fileCommands.some((c) => c.parseStatus === "PARSED");
          if (hasFailed && hasParsed) logStatus = "PARTIAL";
          else if (hasFailed) logStatus = "FAILED";
          else if (hasParsed) logStatus = "PARSED";
        }

        puttyLogsData.push({
          id: file.id,
          originalFilename: file.originalFilename,
          sizeBytes: file.sizeBytes,
          createdAt: file.createdAt.toISOString(),
          storagePath: file.storagePath,
          existsOnDisk: exists,
          deviceId: file.deviceId,
          deviceHostname: dev ? dev.hostname : null,
          commandCount: fileCommands.length,
          status: logStatus,
        });
      } else if (file.type === "GUI_SCREENSHOT") {
        guiScreenshotsData.push({
          id: file.id,
          originalFilename: file.originalFilename,
          sizeBytes: file.sizeBytes,
          createdAt: file.createdAt.toISOString(),
          storagePath: file.storagePath,
          existsOnDisk: exists,
          evidenceCount: file.evidences.length,
        });
      }
    }

    // 2. Fetch all Evidences for this session
    const allEvidences = await prisma.evidence.findMany({
      where: {
        OR: [
          { uploadedFile: { sessionId: session.id } },
          { commandExecution: { device: { sessionId: session.id } } },
          { deviceId: { in: session.devices.map((d) => d.id) } },
        ],
      },
      orderBy: [{ appendixMapping: "asc" }, { pageNumber: "asc" }],
    });

    const evidenceItems: SessionRecoveryResponse["evidenceState"]["items"] = [];
    let activeEvidenceCount = 0;
    let excludedEvidenceCount = 0;
    let cliEvidenceCount = 0;
    let guiEvidenceCount = 0;

    for (const ev of allEvidences) {
      const exists = await storage.fileExists(ev.imageReference);
      if (!exists) {
        missingDiskFiles.push(`Evidence screenshot '${ev.title}' not found on disk at '${ev.imageReference}'.`);
      }

      if (ev.isExcluded) excludedEvidenceCount++;
      else activeEvidenceCount++;

      const isCli = Boolean(ev.commandExecutionId || ev.sourceLabel?.includes("PuTTY") || ev.sourceLabel?.includes("CLI"));
      if (isCli) cliEvidenceCount++;
      else guiEvidenceCount++;

      evidenceItems.push({
        id: ev.id,
        deviceId: ev.deviceId,
        checkId: ev.checkId,
        title: ev.title,
        appendixMapping: ev.appendixMapping,
        isExcluded: ev.isExcluded,
        isRedacted: ev.isRedacted,
        pageNumber: ev.pageNumber,
        totalPages: ev.totalPages,
        sourceLabel: ev.sourceLabel,
        sourceType: isCli ? "CLI" : "GUI",
        existsOnDisk: exists,
        createdAt: ev.createdAt.toISOString(),
      });
    }

    // 3. Reconstruct Metadata
    const detectedHostnames = session.devices.map((d) => d.hostname).filter(Boolean);
    const primaryDetectedHost = detectedHostnames[0] || null;

    const reconciledMeta = metadataReconciler.reconcile(
      docxMetadataExtracted,
      primaryDetectedHost
    );

    // If session has registered devices, ensure they are present in reconstructed metadata
    const combinedDevices = [...reconciledMeta.devices];
    for (const d of session.devices) {
      if (!combinedDevices.some((cd) => cd.hostname.toLowerCase() === d.hostname.toLowerCase())) {
        combinedDevices.push({
          hostname: d.hostname,
          model: d.model || undefined,
          role: (d.role as any) || "Primary",
          source: "CLI",
        });
      }
    }

    // 4. Authoritatively Reconstruct Pipeline & Review State
    let totalCommands = 0;
    let parsedCommandsCount = 0;
    let failedCommandsCount = 0;

    let totalChecks = 0;
    let completeChecksCount = 0;
    let incompleteChecksCount = 0;
    let missingChecksCount = 0;
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    let naCount = 0;
    let reviewRequiredCount = 0;

    let approvedDecisionsCount = 0;
    let rejectedDecisionsCount = 0;
    let modifiedDecisionsCount = 0;
    let pendingReviewDecisionsCount = 0;

    let lastExecutedAt: Date | null = null;

    const deviceSummaries: SessionRecoveryResponse["pipelineState"]["devices"] = [];

    for (const d of session.devices) {
      let devPass = 0;
      let devWarn = 0;
      let devFail = 0;
      let devNa = 0;

      for (const cmd of d.commandExecutions) {
        totalCommands++;
        if (cmd.parseStatus === "PARSED") parsedCommandsCount++;
        else if (cmd.parseStatus === "FAILED") failedCommandsCount++;

        if (cmd.createdAt && (!lastExecutedAt || cmd.createdAt > lastExecutedAt)) {
          lastExecutedAt = cmd.createdAt;
        }
      }

      for (const chk of d.checklistResults) {
        totalChecks++;
        if (chk.collectionState === "COMPLETE") completeChecksCount++;
        else if (chk.collectionState === "INCOMPLETE") incompleteChecksCount++;
        else if (chk.collectionState === "MISSING") missingChecksCount++;

        if (chk.status === "PASS") { passCount++; devPass++; }
        else if (chk.status === "WARNING") { warnCount++; devWarn++; }
        else if (chk.status === "FAIL") { failCount++; devFail++; }
        else if (chk.status === "NA") { naCount++; devNa++; }

        if (chk.reviewRequired) reviewRequiredCount++;

        if (chk.updatedAt && (!lastExecutedAt || chk.updatedAt > lastExecutedAt)) {
          lastExecutedAt = chk.updatedAt;
        }

        const latestDec = chk.reviewDecisions[0];
        if (latestDec) {
          if (latestDec.decision === "APPROVED") approvedDecisionsCount++;
          else if (latestDec.decision === "REJECTED") rejectedDecisionsCount++;
          else if (latestDec.decision === "MODIFIED") modifiedDecisionsCount++;
          else pendingReviewDecisionsCount++;
        } else {
          pendingReviewDecisionsCount++;
        }
      }

      deviceSummaries.push({
        id: d.id,
        hostname: d.hostname,
        role: d.role,
        commandsCount: d.commandExecutions.length,
        checksCount: d.checklistResults.length,
        passCount: devPass,
        warnCount: devWarn,
        failCount: devFail,
        naCount: devNa,
      });
    }

    // Determine Pipeline Status Authoritatively (Adjustment 2 & Verification Area 1)
    const hasRun = totalCommands > 0 || totalChecks > 0;
    let pipelineStatus: SessionRecoveryResponse["pipelineState"]["status"] = "NOT_STARTED";

    const now = new Date();
    const hasActiveLease = Boolean(
      session.processingRunId &&
      session.processingLeaseExpiresAt &&
      new Date(session.processingLeaseExpiresAt) > now
    );
    const hasExpiredInterruptedLease = Boolean(
      session.processingRunId &&
      session.processingLeaseExpiresAt &&
      new Date(session.processingLeaseExpiresAt) <= now
    );

    if (hasActiveLease) {
      pipelineStatus = "PROCESSING";
    } else if (hasExpiredInterruptedLease) {
      pipelineStatus = "INTERRUPTED";
    } else if (hasRun) {
      if (reviewRequiredCount > 0) {
        pipelineStatus = "RE_REVIEW_REQUIRED";
      } else if (failedCommandsCount > 0 || failCount > 0 || incompleteChecksCount > 0) {
        pipelineStatus = "PARTIAL";
      } else {
        pipelineStatus = "SUCCESS";
      }
    }

    // 5. Reconstruct Reports State
    const reportsList: SessionRecoveryResponse["reportsState"]["reports"] = [];
    for (const r of session.generatedReports) {
      const exists = await storage.fileExists(r.fileReference);
      if (!exists) {
        missingDiskFiles.push(`Generated Word report v${r.version} not found on disk at '${r.fileReference}'.`);
      }

      let parsedSummary = null;
      try {
        if (r.summary) parsedSummary = JSON.parse(r.summary);
      } catch {
        // ignore
      }

      reportsList.push({
        id: r.id,
        version: r.version,
        generationStatus: r.generationStatus,
        downloadUrl: `/api/sessions/${sessionId}/export/${r.id}`,
        storagePath: r.fileReference,
        existsOnDisk: exists,
        createdAt: r.createdAt.toISOString(),
        changeSummary: parsedSummary,
      });
    }

    const latestReport = reportsList[0]
      ? {
          id: reportsList[0].id,
          version: reportsList[0].version,
          downloadUrl: reportsList[0].downloadUrl,
          createdAt: reportsList[0].createdAt,
        }
      : null;

    // Assemble authoritative response
    const payload: SessionRecoveryResponse = {
      session: {
        id: session.id,
        customer: session.customer,
        vendor: session.vendor,
        engineerName: session.engineerName,
        pmDate: session.pmDate.toISOString(),
        status: session.status,
        notes: session.notes,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      files: {
        docxReport: docxReportData,
        puttyLogs: puttyLogsData,
        guiScreenshots: guiScreenshotsData,
        missingDiskFiles,
      },
      devices: session.devices.map((d) => ({
        id: d.id,
        hostname: d.hostname,
        model: d.model,
        serialNumber: d.serialNumber,
        role: d.role,
        haStatus: d.haStatus,
        commandsCount: d.commandExecutions.length,
        checklistResultsCount: d.checklistResults.length,
      })),
      metadata: {
        customer: session.customer || reconciledMeta.customer || "Draft PM Session",
        model: reconciledMeta.model || session.devices[0]?.model || null,
        primaryHostname: primaryDetectedHost,
        devices: combinedDevices,
        isAmbiguous: reconciledMeta.isAmbiguous,
        ambiguityReason: reconciledMeta.ambiguityReason,
      },
      pipelineState: {
        hasRun,
        status: pipelineStatus,
        totalCommands,
        parsedCommandsCount,
        failedCommandsCount,
        totalChecks,
        completeChecksCount,
        incompleteChecksCount,
        missingChecksCount,
        passCount,
        warnCount,
        failCount,
        naCount,
        reviewRequiredCount,
        lastExecutedAt: lastExecutedAt ? lastExecutedAt.toISOString() : null,
        devices: deviceSummaries,
      },
      reviewState: {
        totalFindings: totalChecks,
        approvedCount: approvedDecisionsCount,
        pendingReviewCount: pendingReviewDecisionsCount,
        rejectedCount: rejectedDecisionsCount,
        modifiedCount: modifiedDecisionsCount,
      },
      evidenceState: {
        totalEvidence: allEvidences.length,
        activeEvidence: activeEvidenceCount,
        excludedEvidence: excludedEvidenceCount,
        cliEvidenceCount,
        guiEvidenceCount,
        items: evidenceItems,
      },
      reportsState: {
        totalReports: reportsList.length,
        reports: reportsList,
        latestReport,
      },
    };

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("Failed to recover session:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to recover session",
      },
      { status: 500 }
    );
  }
}
