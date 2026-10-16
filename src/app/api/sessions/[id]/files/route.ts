import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { FileCategory } from "@/lib/storage/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;

    const files = await prisma.uploadedFile.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: files });
  } catch (error) {
    console.error("Failed to list files:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list files" },
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "OTHER";
    const deviceId = (formData.get("deviceId") as string) || null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided in form data" },
        { status: 400 }
      );
    }

    // Determine category folder
    let category: FileCategory = "logs";
    if (type === "WORD_REPORT") category = "reports";
    else if (type === "GUI_SCREENSHOT") category = "screenshots";
    else if (type === "PUTTY_LOG") category = "logs";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to local disk via storage abstraction
    const metadata = await storage.saveFile(
      sessionId,
      category,
      file.name,
      buffer,
      file.type || undefined
    );

    // Store in database
    const uploadedRecord = await prisma.uploadedFile.create({
      data: {
        sessionId,
        deviceId: deviceId || undefined,
        type,
        originalFilename: metadata.originalFilename,
        storedFilename: metadata.storedFilename,
        storagePath: metadata.storagePath,
        hashSha256: metadata.hashSha256,
        sizeBytes: metadata.sizeBytes,
        mimeType: metadata.mimeType,
      },
    });

    return NextResponse.json(
      { success: true, data: uploadedRecord },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to upload file:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
