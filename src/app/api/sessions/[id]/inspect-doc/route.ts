import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { docxInspector } from "@/core/document";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        uploadedFiles: true,
        devices: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    let targetFileId: string | undefined;
    try {
      const body = await request.json();
      targetFileId = body.fileId;
    } catch {
      // Body is optional
    }

    // Locate Word report file
    const docxFile = targetFileId
      ? session.uploadedFiles.find((f) => f.id === targetFileId)
      : session.uploadedFiles.find(
          (f) =>
            f.type === "WORD_REPORT" ||
            f.originalFilename.toLowerCase().endsWith(".docx")
        );

    if (!docxFile) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No uploaded Word document (.docx) found in this PM session. Please upload an existing CTC report first.",
        },
        { status: 400 }
      );
    }

    // Read file buffer from storage
    const fileBuffer = await storage.getFile(docxFile.storagePath);

    // Run non-destructive inspection with session vendor context
    const inspectionResult = await docxInspector.inspectDocument(
      fileBuffer,
      session.vendor as import("@/vendors/types").VendorId
    );

    // If metadata found, optionally enrich session devices if empty
    let updatedDeviceCount = 0;
    if (
      session.devices.length > 0 &&
      (inspectionResult.metadata.model || inspectionResult.metadata.serialNumber)
    ) {
      const primaryDevice = session.devices[0];
      if (!primaryDevice.serialNumber && inspectionResult.metadata.serialNumber) {
        await prisma.device.update({
          where: { id: primaryDevice.id },
          data: {
            serialNumber: inspectionResult.metadata.serialNumber,
            model: primaryDevice.model || inspectionResult.metadata.model,
          },
        });
        updatedDeviceCount++;
      }
    } else if (session.devices.length === 0 && inspectionResult.metadata.hostname) {
      await prisma.device.create({
        data: {
          sessionId,
          hostname: inspectionResult.metadata.hostname,
          model: inspectionResult.metadata.model || null,
          serialNumber: inspectionResult.metadata.serialNumber || null,
          role: "Primary",
        },
      });
      updatedDeviceCount++;
    }

    // Enrich customer name if session was created with default draft name
    if (
      (session.customer === "Draft PM Session" || session.customer === "Untitled PM Session") &&
      inspectionResult.metadata.customerName
    ) {
      await prisma.pMSession.update({
        where: { id: sessionId },
        data: {
          customer: inspectionResult.metadata.customerName,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        fileId: docxFile.id,
        filename: docxFile.originalFilename,
        inspection: inspectionResult,
        updatedDeviceCount,
      },
    });
  } catch (error) {
    console.error("Failed to inspect Word document:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to inspect Word document",
      },
      { status: 500 }
    );
  }
}
