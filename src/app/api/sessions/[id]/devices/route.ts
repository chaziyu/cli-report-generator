import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createDeviceSchema } from "@/lib/validations/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    const devices = await prisma.device.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            commandExecutions: true,
            checklistResults: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: devices });
  } catch (error) {
    console.error("Failed to list devices:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list devices" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = createDeviceSchema.safeParse(body);

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

    const device = await prisma.device.create({
      data: {
        sessionId,
        ...parsed.data,
      },
    });

    return NextResponse.json({ success: true, data: device }, { status: 201 });
  } catch (error) {
    console.error("Failed to add device:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add device" },
      { status: 500 }
    );
  }
}
