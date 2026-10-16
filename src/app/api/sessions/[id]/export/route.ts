import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { docxEditor, DecisionToApply, EvidenceToInsert } from "@/core/document";
import { vendorRegistry, VendorId } from "@/vendors";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    const reports = await prisma.generatedReport.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });

    const formatted = reports.map((r) => {
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
        total: formatted.length,
        reports: formatted,
      },
    });
  } catch (error) {
    console.error("Failed to fetch generated reports:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch reports",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    let targetDeviceId: string | undefined;
    try {
      const body = await request.json();
      targetDeviceId = body.deviceId;
    } catch {
      // Body optional
    }

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: true,
        uploadedFiles: true,
        generatedReports: true,
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

    // 2. Select target device
    const targetDevice = targetDeviceId
      ? session.devices.find((d) => d.id === targetDeviceId) || session.devices[0]
      : session.devices[0];

    if (!targetDevice) {
      return NextResponse.json(
        { success: false, error: "No target device found in session" },
        { status: 400 }
      );
    }

    // 3. Load original DOCX buffer
    const originalDocxBuffer = await storage.getFile(docxFile.storagePath);

    // 4. Fetch checklist results with review decisions
    const checklistResults = await prisma.checklistResult.findMany({
      where: { deviceId: targetDevice.id },
      include: {
        reviewDecisions: {
          orderBy: { decidedAt: "desc" },
        },
      },
    });

    // 5. Filter approved or modified decisions to apply
    const decisionsToApply: DecisionToApply[] = [];
    for (const r of checklistResults) {
      const latestDec = r.reviewDecisions[0];
      if (latestDec && (latestDec.decision === "APPROVED" || latestDec.decision === "MODIFIED")) {
        decisionsToApply.push({
          checkId: r.checkId,
          finalStatus: latestDec.finalStatus || r.status,
          finalRemarks: latestDec.finalRemarks ?? r.remarks ?? "",
          reviewer: latestDec.reviewer,
          reviewNotes: latestDec.reviewNotes || undefined,
        });
      }
    }

    // 6. Fetch rendered CLI evidence for this device
    const evidences = await prisma.evidence.findMany({
      where: { deviceId: targetDevice.id },
      include: {
        commandExecution: true,
      },
      orderBy: [{ appendixMapping: "asc" }, { pageNumber: "asc" }],
    });

    // Get adapter checklist for appendix number mapping
    const adapter = vendorRegistry.get(session.vendor as VendorId);
    const checklistDefs = adapter ? adapter.getChecklistDefinition() : [];

    const evidencesToInsert: EvidenceToInsert[] = [];
    for (const ev of evidences) {
      try {
        const imageBuffer = await storage.getFile(ev.imageReference);

        // Map matching checkIds
        const matchingCheckIds = checklistDefs
          .filter((def) => {
            if (!def.targetAppendix || !ev.appendixMapping) return false;
            const cleanDef = def.targetAppendix.toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanEv = ev.appendixMapping.toLowerCase().replace(/[^a-z0-9]/g, "");
            return cleanEv.includes(cleanDef) || cleanDef.includes(cleanEv);
          })
          .map((def) => def.id);

        // Extract appendix number if present (e.g. "Appendix 1")
        const appNumMatch = (ev.appendixMapping || "").match(/Appendix\s*(\d+)/i);
        const appendixNumber = appNumMatch ? parseInt(appNumMatch[1], 10) : undefined;

        evidencesToInsert.push({
          checkIds: matchingCheckIds,
          appendixNumber,
          imageBuffer,
          title: ev.title,
          caption: ev.caption || undefined,
        });
      } catch (err) {
        console.warn(`Could not load evidence image ${ev.imageReference}:`, err);
      }
    }

    // 7. Run DocxEditor
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

    // 8. Save updated DOCX to storage
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

    // 9. Record GeneratedReport in SQLite
    const generatedReport = await prisma.generatedReport.create({
      data: {
        sessionId: session.id,
        originalReportId: docxFile.id,
        fileReference: storedReport.storagePath,
        version,
        generationStatus: "SUCCESS",
        summary: JSON.stringify(editResult.changeSummary),
      },
    });

    // 10. Update session status to COMPLETED if all checks approved
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
        changeSummary: editResult.changeSummary,
        validation: editResult.validation,
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
