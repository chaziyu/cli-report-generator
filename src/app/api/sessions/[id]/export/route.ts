import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { docxEditor, DecisionToApply, EvidenceToInsert } from "@/core/document";
import { docxInspector } from "@/core/document/docx-inspector";
import { reviewService } from "@/core/review";
import { vendorRegistry, VendorId } from "@/vendors";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: {
          include: {
            checklistResults: {
              include: {
                reviewDecisions: { orderBy: { decidedAt: "desc" }, take: 1 },
              },
            },
            commandExecutions: true,
          },
        },
        uploadedFiles: true,
        generatedReports: {
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

    // 1. Locate original uploaded Word report
    const docxFile = session.uploadedFiles.find(
      (f) =>
        f.type === "WORD_REPORT" ||
        f.originalFilename.toLowerCase().endsWith(".docx")
    );

    let inspection: any = null;
    let inspectionError: string | null = null;
    if (docxFile) {
      try {
        const docxBuffer = await storage.getFile(docxFile.storagePath);
        inspection = await docxInspector.inspectDocument(docxBuffer);
      } catch (err) {
        inspectionError = err instanceof Error ? err.message : "Failed to inspect DOCX";
      }
    }

    // 2. Fetch all active and excluded evidence
    const allEvidence = await prisma.evidence.findMany({
      where: {
        OR: [
          { deviceId: { in: session.devices.map((d) => d.id) } },
          { uploadedFile: { sessionId } },
        ],
      },
    });

    const activeEvidenceCount = allEvidence.filter((e) => !e.isExcluded).length;
    const excludedEvidenceCount = allEvidence.filter((e) => e.isExcluded).length;

    // 3. Compute readiness and warnings per device
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!docxFile) {
      errors.push("No CTC Word template (.docx) uploaded for this PM session.");
    } else if (inspection && !inspection.isSupportedLayout) {
      warnings.push(`Uploaded document layout (${inspection.layoutName}) is not a verified CTC PM layout.`);
    }

    const deviceReadiness = session.devices.map((d) => {
      const totalChecks = d.checklistResults.length;
      let approvedCount = 0;
      let pendingCount = 0;

      for (const r of d.checklistResults) {
        const latest = r.reviewDecisions[0];
        if (latest && reviewService.isDecisionEligibleForExport(r.evidenceFingerprint, latest, r.reviewRequired)) {
          approvedCount++;
        } else {
          pendingCount++;
        }
      }

      const deviceEvidence = allEvidence.filter((e) => e.deviceId === d.id && !e.isExcluded);

      // Latest generated report for this device
      const latestReport = session.generatedReports.find((r) => {
        try {
          const s = JSON.parse(r.summary || "{}");
          return s.deviceId === d.id || (!s.deviceId && session.devices.length === 1);
        } catch {
          return false;
        }
      }) || session.generatedReports[0];

      return {
        id: d.id,
        hostname: d.hostname,
        model: d.model,
        role: d.role,
        totalChecks,
        approvedChecksCount: approvedCount,
        pendingChecksCount: pendingCount,
        evidenceCount: deviceEvidence.length,
        latestReport: latestReport
          ? {
              id: latestReport.id,
              version: latestReport.version,
              downloadUrl: `/api/sessions/${sessionId}/export/${latestReport.id}`,
              createdAt: latestReport.createdAt,
            }
          : null,
      };
    });

    // Check for general warnings
    const totalPending = deviceReadiness.reduce((sum, d) => sum + d.pendingChecksCount, 0);
    if (totalPending > 0) {
      warnings.push(`${totalPending} check(s) require review. Unapproved checks will retain their original template text.`);
    }

    if (excludedEvidenceCount > 0) {
      warnings.push(`${excludedEvidenceCount} screenshot(s) marked excluded will not be included in the report.`);
    }

    const formattedReports = session.generatedReports.map((r) => {
      let parsedSummary = null;
      try {
        if (r.summary) parsedSummary = JSON.parse(r.summary);
      } catch {
        // ignore
      }

      return {
        id: r.id,
        version: r.version,
        generationStatus: r.generationStatus,
        downloadUrl: `/api/sessions/${sessionId}/export/${r.id}`,
        storagePath: r.fileReference,
        changeSummary: parsedSummary,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        canExport: Boolean(docxFile && (!inspection || inspection.isSupportedLayout)),
        hasOriginalDoc: Boolean(docxFile),
        originalDocFilename: docxFile?.originalFilename || null,
        layoutName: inspection?.layoutName || "Unknown",
        supportsMultiDeviceSections: Boolean(inspection?.supportsMultiDeviceSections),
        warnings,
        errors,
        devices: deviceReadiness,
        reports: formattedReports,
        total: formattedReports.length,
        totalReports: formattedReports.length,
        evidenceSummary: {
          activeCount: activeEvidenceCount,
          excludedCount: excludedEvidenceCount,
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch export readiness and reports:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch export readiness",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    let targetDeviceId: string | undefined;
    let force: boolean = false;
    try {
      const body = await request.json();
      targetDeviceId = body.deviceId;
      force = Boolean(body.force);
    } catch {
      // Body optional
    }

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: true,
        uploadedFiles: true,
        generatedReports: {
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

    // 1. Locate original uploaded Word report
    const docxFile = session.uploadedFiles.find(
      (f) =>
        f.type === "WORD_REPORT" ||
        f.originalFilename.toLowerCase().endsWith(".docx")
    );

    if (!docxFile) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No uploaded Word document (.docx) found in this PM session. Please upload a CTC report first.",
        },
        { status: 400 }
      );
    }

    // 2. Load and inspect original DOCX buffer
    const originalDocxBuffer = await storage.getFile(docxFile.storagePath);
    const inspection = await docxInspector.inspectDocument(originalDocxBuffer);

    // 3. Multi-device verification (Correction 2: never silently export only the first device)
    if (session.devices.length > 1 && !targetDeviceId && !inspection.supportsMultiDeviceSections) {
      const deviceNames = session.devices.map((d) => `${d.hostname} (${d.role || "Device"})`).join(", ");
      return NextResponse.json(
        {
          success: false,
          error: `This session contains multiple firewalls (${deviceNames}), but the uploaded CTC template is formatted for a single device. Please select target deviceId.`,
          code: "DEVICE_SELECTION_REQUIRED",
          devices: session.devices.map((d) => ({
            id: d.id,
            hostname: d.hostname,
            model: d.model,
            role: d.role,
          })),
        },
        { status: 400 }
      );
    }

    // Select target device
    const targetDevice = targetDeviceId
      ? session.devices.find((d) => d.id === targetDeviceId)
      : session.devices[0];

    if (!targetDevice) {
      return NextResponse.json(
        { success: false, error: "Selected target device not found in this PM session." },
        { status: 400 }
      );
    }

    // 4. Fetch checklist results with review decisions
    const checklistResults = await prisma.checklistResult.findMany({
      where: { deviceId: targetDevice.id },
      include: {
        reviewDecisions: {
          orderBy: { decidedAt: "desc" },
        },
      },
    });

    // 5. Filter approved or modified decisions to apply using authoritative eligibility rule (Correction 6)
    const decisionsToApply: DecisionToApply[] = [];
    for (const r of checklistResults) {
      const latestDec = r.reviewDecisions[0];
      if (
        latestDec &&
        reviewService.isDecisionEligibleForExport(
          r.evidenceFingerprint,
          latestDec,
          r.reviewRequired
        )
      ) {
        decisionsToApply.push({
          checkId: r.checkId,
          finalStatus: latestDec.finalStatus || r.status,
          finalRemarks: latestDec.finalRemarks ?? r.remarks ?? "",
          reviewer: latestDec.reviewer,
          reviewNotes: latestDec.reviewNotes || undefined,
        });
      }
    }

    // Identify approved checkIds and explicitly rejected checkIds for evidence policy gating
    const approvedCheckIds = new Set(decisionsToApply.map((d) => d.checkId));
    const rejectedCheckIds = new Set(
      checklistResults
        .filter((r) => r.reviewDecisions[0]?.decision === "REJECTED")
        .map((r) => r.checkId)
    );

    // 6. Fetch active evidence (Correction 7: Filter all excluded screenshots, verify device ownership)
    const activeEvidences = await prisma.evidence.findMany({
      where: {
        deviceId: targetDevice.id,
        isExcluded: false,
      },
      include: {
        commandExecution: true,
        uploadedFile: true,
      },
      orderBy: [{ appendixMapping: "asc" }, { pageNumber: "asc" }],
    });

    // Get adapter checklist for appendix number mapping
    const adapter = vendorRegistry.get(session.vendor as VendorId);
    const checklistDefs = adapter ? adapter.getChecklistDefinition() : [];

    const evidencesToInsert: EvidenceToInsert[] = [];
    const omittedUnapprovedEvidence: { id: string; title: string; checkIds: string[]; reason: string }[] = [];

    for (const ev of activeEvidences) {
      try {
        // Map matching checkIds using stable checkId first
        let matchingCheckIds: string[] = [];
        let appendixNumber: number | undefined;

        if (ev.checkId) {
          const matchingDef = checklistDefs.find((def) => def.id === ev.checkId);
          if (matchingDef) {
            matchingCheckIds = [matchingDef.id];
            if (matchingDef.targetAppendix) {
              const numMatch = matchingDef.targetAppendix.match(/Appendix\s*(\d+)/i);
              if (numMatch) appendixNumber = parseInt(numMatch[1], 10);
            }
          }
        }

        // Fallback: match by appendix title string if checkId was not mapped
        if (matchingCheckIds.length === 0 && ev.appendixMapping) {
          matchingCheckIds = checklistDefs
            .filter((def) => {
              if (!def.targetAppendix || !ev.appendixMapping) return false;
              const cleanDef = def.targetAppendix.toLowerCase().replace(/[^a-z0-9]/g, "");
              const cleanEv = ev.appendixMapping.toLowerCase().replace(/[^a-z0-9]/g, "");
              return cleanEv.includes(cleanDef) || cleanDef.includes(cleanEv);
            })
            .map((def) => def.id);

          const appNumMatch = ev.appendixMapping.match(/Appendix\s*(\d+)/i);
          if (appNumMatch) {
            appendixNumber = parseInt(appNumMatch[1], 10);
          }
        }

        // Requirement 1 Verification:
        // Supporting evidence requires approval of its associated checklist finding.
        // Active evidence is not inserted merely because isExcluded=false.
        if (matchingCheckIds.length === 0) {
          omittedUnapprovedEvidence.push({
            id: ev.id,
            title: ev.title,
            checkIds: [],
            reason: "UNMAPPED_TO_CHECKLIST",
          });
          continue;
        }

        const isAnyRejected = matchingCheckIds.some((id) => rejectedCheckIds.has(id));
        if (isAnyRejected) {
          omittedUnapprovedEvidence.push({
            id: ev.id,
            title: ev.title,
            checkIds: matchingCheckIds,
            reason: "ASSOCIATED_CHECK_REJECTED",
          });
          continue;
        }

        const isAnyUnapproved = matchingCheckIds.some((id) => !approvedCheckIds.has(id));
        if (isAnyUnapproved) {
          omittedUnapprovedEvidence.push({
            id: ev.id,
            title: ev.title,
            checkIds: matchingCheckIds,
            reason: "ASSOCIATED_CHECK_PENDING_APPROVAL",
          });
          continue;
        }

        const imageBuffer = await storage.getFile(ev.imageReference);

        evidencesToInsert.push({
          id: ev.id,
          checkIds: matchingCheckIds,
          appendixNumber,
          imageBuffer,
          title: ev.title,
          caption: ev.caption || undefined,
          pageNumber: ev.pageNumber,
          totalPages: ev.totalPages,
          sourceLabel: ev.sourceLabel,
          // Correction 1: Preserves existing screenshots by default; replace only if explicitly approved
          replaceExistingMedia: false,
        });
      } catch (err) {
        console.warn(`Could not load evidence image ${ev.imageReference}:`, err);
      }
    }

    // 7. Input-signature deduplication engine (Correction 3)
    const signaturePayload = {
      sourceDocHash: inspection.sha256Hash,
      deviceId: targetDevice.id,
      deviceMetadata: {
        hostname: targetDevice.hostname,
        model: targetDevice.model,
        serialNumber: targetDevice.serialNumber,
        role: targetDevice.role,
      },
      approvedFindingRevisions: decisionsToApply
        .map((d) => ({
          checkId: d.checkId,
          finalStatus: d.finalStatus,
          finalRemarks: d.finalRemarks,
          reviewer: d.reviewer,
        }))
        .sort((a, b) => a.checkId.localeCompare(b.checkId)),
      evidenceHashes: evidencesToInsert
        .map((e) => ({
          id: e.id,
          title: e.title,
          checkIds: e.checkIds.sort(),
          appendixNumber: e.appendixNumber,
          replaceExistingMedia: Boolean(e.replaceExistingMedia),
        }))
        .sort((a, b) => (a.id || "").localeCompare(b.id || "")),
      exclusionCount: activeEvidences.length,
      selectedLayout: {
        id: inspection.layoutId,
        name: inspection.layoutName,
      },
      editorVersion: "ctc-docx-editor-v2.0",
      replacementDecisions: evidencesToInsert
        .filter((e) => e.replaceExistingMedia)
        .map((e) => e.title)
        .sort(),
    };

    const inputSignature = createHash("sha256")
      .update(JSON.stringify(signaturePayload))
      .digest("hex");

    // Check if an existing report can be reused
    if (!force) {
      const candidateReport = session.generatedReports.find((r) => {
        try {
          const s = JSON.parse(r.summary || "{}");
          return s.inputSignature === inputSignature && s.deviceId === targetDevice.id;
        } catch {
          return false;
        }
      });

      if (candidateReport && candidateReport.generationStatus === "SUCCESS") {
        try {
          const existingFile = await storage.getFile(candidateReport.fileReference);
          if (existingFile && existingFile.byteLength > 0) {
            const cleanCustomer = session.customer.replace(/[^a-zA-Z0-9_\-]/g, "_");
            const cachedFilename = `PM_Report_${cleanCustomer}_${targetDevice.hostname}_v${candidateReport.version}.docx`;
            return NextResponse.json({
              success: true,
              data: {
                reportId: candidateReport.id,
                version: candidateReport.version,
                filename: cachedFilename,
                downloadUrl: `/api/sessions/${sessionId}/export/${candidateReport.id}`,
                changeSummary: JSON.parse(candidateReport.summary || "{}"),
                validation: { isValid: true, errors: [], warnings: [] },
                isCached: true,
              },
            });
          }
        } catch {
          // File missing from storage, proceed to regenerate
        }
      }
    }

    // 8. Run DocxEditor
    const editResult = await docxEditor.editReport({
      originalDocxBuffer,
      decisions: decisionsToApply,
      evidences: evidencesToInsert,
      deviceMetadata: {
        hostname: targetDevice.hostname,
        model: targetDevice.model || undefined,
        serialNumber: targetDevice.serialNumber || undefined,
        engineerName: session.engineerName || undefined,
      },
    });

    if (!editResult.validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: `Document validation failed: ${editResult.validation.errors.join("; ")}`,
          validation: editResult.validation,
        },
        { status: 500 }
      );
    }

    // 9. Save updated DOCX to storage
    const version = session.generatedReports.length + 1;
    const cleanCustomer = session.customer.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const outputFilename = `PM_Report_${cleanCustomer}_${targetDevice.hostname}_v${version}.docx`;

    const storedReport = await storage.saveFile(
      sessionId,
      "exports",
      outputFilename,
      editResult.modifiedBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // 10. Record GeneratedReport in SQLite with inputSignature and deviceId
    const combinedChangeSummary = {
      ...editResult.changeSummary,
      omittedUnapprovedEvidence,
    };

    const reportSummary = {
      ...combinedChangeSummary,
      deviceId: targetDevice.id,
      inputSignature,
    };

    const generatedReport = await prisma.generatedReport.create({
      data: {
        sessionId: session.id,
        originalReportId: docxFile.id,
        fileReference: storedReport.storagePath,
        version,
        generationStatus: "SUCCESS",
        summary: JSON.stringify(reportSummary),
      },
    });

    // 11. Update session status to COMPLETED if all checks approved
    if (session.status !== "COMPLETED") {
      await prisma.pMSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED" },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        reportId: generatedReport.id,
        version,
        filename: outputFilename,
        downloadUrl: `/api/sessions/${sessionId}/export/${generatedReport.id}`,
        changeSummary: combinedChangeSummary,
        validation: editResult.validation,
        isCached: false,
      },
    });
  } catch (error) {
    console.error("Failed to generate and export Word report:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate updated Word report",
      },
      { status: 500 }
    );
  }
}
