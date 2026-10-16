import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSessionSchema } from "@/lib/validations/session";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customer = searchParams.get("customer");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customer) where.customer = { contains: customer };

    const sessions = await prisma.pMSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        devices: {
          select: {
            id: true,
            hostname: true,
            model: true,
            serialNumber: true,
            role: true,
          },
        },
        uploadedFiles: {
          select: {
            id: true,
            type: true,
            originalFilename: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            devices: true,
            uploadedFiles: true,
            generatedReports: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error("Failed to list PM sessions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve PM sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

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

    const { customer, vendor, engineerName, pmDate, notes, devices } =
      parsed.data;

    const session = await prisma.pMSession.create({
      data: {
        customer,
        vendor,
        engineerName,
        pmDate: pmDate || new Date(),
        status: "DRAFT",
        notes,
        devices: devices && devices.length > 0
          ? {
              create: devices.map((d) => ({
                hostname: d.hostname,
                model: d.model,
                serialNumber: d.serialNumber,
                managementIp: d.managementIp,
                role: d.role,
                haStatus: d.haStatus,
              })),
            }
          : undefined,
      },
      include: {
        devices: true,
        uploadedFiles: true,
      },
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    console.error("Failed to create PM session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create PM session" },
      { status: 500 }
    );
  }
}
