import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { vendorRegistry, VendorId } from "@/vendors";
import { ruleEngine, RuleEvaluationSummary } from "@/core/checks";

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
    try {
      const body = await request.json();
      targetDeviceId = body.deviceId;
    } catch {
      // Body is optional
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

    const checklistDefinitions = adapter.getChecklistDefinition();
    const targetDevices = targetDeviceId
      ? session.devices.filter((d) => d.id === targetDeviceId)
      : session.devices;

    if (targetDevices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No target devices found in session to evaluate" },
        { status: 400 }
      );
    }

    const deviceSummaries: RuleEvaluationSummary[] = [];

    // Evaluate each device
    for (const device of targetDevices) {
      const summary = ruleEngine.evaluateDeviceChecks({
        deviceId: device.id,
        vendorId: session.vendor as VendorId,
        checklistDefinitions,
        commandExecutions: device.commandExecutions,
      });

      deviceSummaries.push(summary);

      // Persist / upsert into Prisma ChecklistResult table
      for (const result of summary.results) {
        const def = checklistDefinitions.find((d) => d.id === result.checkId);

        await prisma.checklistResult.upsert({
          where: {
            deviceId_checkId: {
              deviceId: device.id,
              checkId: result.checkId,
            },
          },
          create: {
            deviceId: device.id,
            checkId: result.checkId,
            checkName: def?.taskName || result.checkId,
            sectionName: def?.targetSection || null,
            targetAppendix: def?.targetAppendix || null,
            collectionState: result.collectionState,
            status: result.evaluationStatus,
            currentValue: (result.extractedValues?.currentValue as string) || null,
            expectedValue: def?.thresholdDescription || null,
            remarks: result.remarks || null,
            reviewRequired: result.reviewRequired,
          },
          update: {
            checkName: def?.taskName || result.checkId,
            sectionName: def?.targetSection || null,
            targetAppendix: def?.targetAppendix || null,
            collectionState: result.collectionState,
            status: result.evaluationStatus,
            currentValue: (result.extractedValues?.currentValue as string) || null,
            expectedValue: def?.thresholdDescription || null,
            remarks: result.remarks || null,
            reviewRequired: result.reviewRequired,
          },
        });
      }
    }

    // Update session status to IN_PROGRESS or REVIEW if checks were evaluated
    if (session.status === "DRAFT") {
      await prisma.pMSession.update({
        where: { id: session.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        vendor: session.vendor,
        devicesEvaluated: deviceSummaries.length,
        deviceSummaries,
      },
    });
  } catch (error) {
    console.error("Rule evaluation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to evaluate checklist rules",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const targetDeviceId = searchParams.get("deviceId") || undefined;

    const session = await prisma.pMSession.findUnique({
      where: { id: sessionId },
      include: {
        devices: {
          include: {
            checklistResults: {
              orderBy: { checkId: "asc" },
            },
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

    const filteredDevices = targetDeviceId
      ? session.devices.filter((d) => d.id === targetDeviceId)
      : session.devices;

    const devices = filteredDevices.map((device) => {
      const results = device.checklistResults;
      const counts = {
        total: results.length,
        pass: results.filter((r) => r.status === "PASS").length,
        fail: results.filter((r) => r.status === "FAIL").length,
        warning: results.filter((r) => r.status === "WARNING").length,
        na: results.filter((r) => r.status === "NA").length,
        review: results.filter((r) => r.status === "REVIEW").length,
        pending: results.filter((r) => r.status === "PENDING").length,
      };

      return {
        id: device.id,
        hostname: device.hostname,
        model: device.model,
        role: device.role,
        haStatus: device.haStatus,
        counts,
        results,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        vendor: session.vendor,
        devices,
      },
    });
  } catch (error) {
    console.error("Failed to fetch checklist evaluation results:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch evaluation results",
      },
      { status: 500 }
    );
  }
}

