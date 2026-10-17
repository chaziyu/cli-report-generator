import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { vendorRegistry, VendorId } from "@/vendors";
import { evidenceRenderer } from "@/core/evidence";
import { storage } from "@/lib/storage";

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
        devices: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    if (targetDeviceId && !session.devices.some((d) => d.id === targetDeviceId)) {
      return NextResponse.json(
        { success: false, error: "Target device does not belong to this session" },
        { status: 400 }
      );
    }

    const deviceIds = targetDeviceId
      ? [targetDeviceId]
      : session.devices.map((d) => d.id);

    const evidences = await prisma.evidence.findMany({
      where: {
        deviceId: { in: deviceIds },
      },
      include: {
        commandExecution: {
          select: {
            command: true,
            commandGroup: true,
            parseStatus: true,
            outputContent: true,
          },
        },
        uploadedFile: {
          select: {
            id: true,
            originalFilename: true,
            hashSha256: true,
            sizeBytes: true,
          },
        },
      },
      orderBy: [{ appendixMapping: "asc" }, { pageNumber: "asc" }],
    });

    const deviceMap = new Map(session.devices.map((d) => [d.id, d]));

    const formatted = evidences.map((ev) => {
      const dev = ev.deviceId ? deviceMap.get(ev.deviceId) : undefined;
      return {
        id: ev.id,
        title: ev.title,
        appendixMapping: ev.appendixMapping,
        caption: ev.caption,
        isRedacted: ev.isRedacted,
        pageNumber: ev.pageNumber,
        totalPages: ev.totalPages,
        sourceLabel: ev.sourceLabel,
        commandExecutionId: ev.commandExecutionId,
        command: ev.commandExecution?.command,
        deviceId: ev.deviceId,
        deviceHostname: dev?.hostname || "Unknown",
        imageUrl: `/api/sessions/${sessionId}/evidence/${ev.id}`,
        storagePath: ev.imageReference,
        createdAt: ev.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        total: formatted.length,
        evidences: formatted,
      },
    });
  } catch (error) {
    console.error("Failed to retrieve evidence:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to retrieve evidence",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: {
          include: {
            commandExecutions: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    let targetDeviceId: string | undefined;
    let targetExecutionId: string | undefined;
    try {
      const body = await request.json();
      targetDeviceId = body.deviceId;
      targetExecutionId = body.commandExecutionId;
    } catch {
      // Body optional
    }

    const adapter = vendorRegistry.get(session.vendor as VendorId);
    if (!adapter) {
      return NextResponse.json(
        {
          success: false,
          error: `Vendor adapter "${session.vendor}" not found`,
        },
        { status: 400 }
      );
    }

    const targetDevices = targetDeviceId
      ? session.devices.filter((d) => d.id === targetDeviceId)
      : session.devices;

    if (targetDevices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No target devices found in session" },
        { status: 400 }
      );
    }

    const adapterCommands = adapter.getCommands();
    let totalImagesGenerated = 0;
    const generatedEvidenceIds: string[] = [];

    for (const device of targetDevices) {
      let executions = device.commandExecutions.filter(
        (exec) => exec.outputContent && exec.outputContent.trim().length > 0
      );

      if (targetExecutionId) {
        executions = executions.filter((exec) => exec.id === targetExecutionId);
      }

      for (const exec of executions) {
        // Find command definition to map appendix & title
        const cleanCmd = exec.command.trim().toLowerCase();
        const cmdDef = adapterCommands.find(
          (c) =>
            c.command.toLowerCase() === cleanCmd ||
            c.expectedOutputs.some((exp) => cleanCmd.startsWith(exp.toLowerCase()))
        );

        const title = cmdDef?.description || cmdDef?.command || exec.command;
        const appendixMapping =
          cmdDef?.targetAppendix || "Appendix - Terminal Evidence";

        // Render terminal pages
        const pages = await evidenceRenderer.renderEvidencePages({
          title,
          command: exec.command,
          rawOutput: exec.outputContent!,
          deviceHostname: device.hostname,
          appendixMapping,
          redactSecrets: true,
        });

        // Delete any prior evidence records for this command execution to avoid duplicates on re-render
        await prisma.evidence.deleteMany({
          where: { commandExecutionId: exec.id },
        });

        // Store each page PNG and persist Evidence row
        for (const page of pages) {
          const stored = await storage.saveFile(
            sessionId,
            "evidence",
            page.fileName,
            page.pngBuffer,
            "image/png"
          );

          const evidenceRow = await prisma.evidence.create({
            data: {
              commandExecutionId: exec.id,
              deviceId: device.id,
              checkId: cmdDef?.mappedCheckIds?.[0] || null,
              title,
              appendixMapping,
              imageReference: stored.storagePath,
              caption: `${appendixMapping}: ${title} (${device.hostname}) - Page ${page.pageNumber} of ${page.totalPages}`,
              isRedacted: page.redactionsApplied > 0,
              pageNumber: page.pageNumber,
              totalPages: page.totalPages,
              sourceLabel: "Rendered from PuTTY session log",
            },
          });

          generatedEvidenceIds.push(evidenceRow.id);
          totalImagesGenerated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        totalImagesGenerated,
        generatedEvidenceIds,
      },
    });
  } catch (error) {
    console.error("Failed to generate evidence:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to generate evidence",
      },
      { status: 500 }
    );
  }
}
