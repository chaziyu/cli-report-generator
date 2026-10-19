import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { updateSessionSchema } from "@/lib/validations/session";
import { vendorRegistry, VendorId } from "@/vendors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await prisma.pMSession.findUnique({
      where: { id },
      include: {
        devices: {
          include: {
            _count: {
              select: {
                commandExecutions: true,
                checklistResults: true,
              },
            },
          },
        },
        uploadedFiles: {
          orderBy: { createdAt: "desc" },
        },
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

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("Failed to retrieve PM session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve PM session" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const existing = await prisma.pMSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    if (parsed.data.vendor && !vendorRegistry.has(parsed.data.vendor as VendorId)) {
      return NextResponse.json(
        { success: false, error: `Unsupported firewall vendor "${parsed.data.vendor}"` },
        { status: 400 }
      );
    }

    const updated = await prisma.pMSession.update({
      where: { id },
      data: parsed.data,
      include: {
        devices: true,
        uploadedFiles: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Failed to update PM session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update PM session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await prisma.pMSession.findUnique({
      where: { id },
      include: {
        devices: { select: { id: true } },
        uploadedFiles: { select: { id: true, storagePath: true } },
        generatedReports: { select: { id: true, fileReference: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    // Identify evidence associated with this session's devices or uploaded files
    const deviceIds = existing.devices.map((d) => d.id);
    const fileIds = existing.uploadedFiles.map((f) => f.id);

    const evidences = await prisma.evidence.findMany({
      where: {
        OR: [
          ...(fileIds.length > 0 ? [{ uploadedFileId: { in: fileIds } }] : []),
          ...(deviceIds.length > 0 ? [{ deviceId: { in: deviceIds } }] : []),
        ],
      },
      select: { id: true, imageReference: true },
    });

    // Clean up physical storage files from disk
    const pathsToDelete = [
      ...existing.uploadedFiles.map((f) => f.storagePath),
      ...existing.generatedReports.map((r) => r.fileReference),
      ...evidences.map((e) => e.imageReference),
    ].filter(Boolean);

    for (const filePath of pathsToDelete) {
      try {
        await storage.deleteFile(filePath);
      } catch {
        // Silently continue if file was already removed or absent on disk
      }
    }

    // Delete associated evidence records before deleting session
    if (evidences.length > 0) {
      await prisma.evidence.deleteMany({
        where: { id: { in: evidences.map((e) => e.id) } },
      });
    }

    await prisma.pMSession.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "PM session deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete PM session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete PM session" },
      { status: 500 }
    );
  }
}
