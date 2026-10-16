import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string; evidenceId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId, evidenceId } = await params;

    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
    });

    if (!evidence) {
      return NextResponse.json(
        { success: false, error: "Evidence record not found" },
        { status: 404 }
      );
    }

    const imageBuffer = await storage.getFile(evidence.imageReference);

    // Determine verified safe content-type via magic bytes
    let contentType = "image/png";
    if (
      imageBuffer.length >= 3 &&
      imageBuffer[0] === 0xff &&
      imageBuffer[1] === 0xd8 &&
      imageBuffer[2] === 0xff
    ) {
      contentType = "image/jpeg";
    }

    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": imageBuffer.byteLength.toString(),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to read evidence image:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to load evidence image",
      },
      { status: 500 }
    );
  }
}
