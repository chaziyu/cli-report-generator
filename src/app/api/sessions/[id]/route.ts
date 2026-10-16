import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { updateSessionSchema } from "@/lib/validations/session";

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

    const existing = await prisma.pMSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
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
