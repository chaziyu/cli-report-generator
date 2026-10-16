import { NextRequest, NextResponse } from "next/server";
import { reportPipeline, PipelineLockError } from "@/core/workflow";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Optional body
    }

    const result = await reportPipeline.processSession(sessionId, {
      deviceConfirmations: body.deviceConfirmations,
      forceReevaluate: body.forceReevaluate,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof PipelineLockError) {
      return NextResponse.json(
        {
          success: false,
          error: "SESSION_LOCKED",
          message: error.message,
          activeRunId: error.activeRunId,
        },
        { status: 409 }
      );
    }

    console.error("Pipeline processing failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "PIPELINE_ERROR",
        message: error instanceof Error ? error.message : "Pipeline processing failed",
      },
      { status: 500 }
    );
  }
}
