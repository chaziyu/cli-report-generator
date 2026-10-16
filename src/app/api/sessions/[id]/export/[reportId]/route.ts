import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string; reportId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId, reportId } = await params;

    const report = await prisma.generatedReport.findUnique({
      where: { id: reportId },
      include: {
        session: true,
      },
    });

    if (!report || report.sessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: "Generated report not found" },
        { status: 404 }
      );
    }

    const fileBuffer = await storage.getFile(report.fileReference);

    const cleanCustomer = report.session.customer.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const filename = `PM_Report_${cleanCustomer}_v${report.version}.docx`;

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": fileBuffer.byteLength.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Failed to download generated report:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to download generated report",
      },
      { status: 500 }
    );
  }
}
