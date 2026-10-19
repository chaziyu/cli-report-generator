import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { vendorRegistry, VendorId } from "@/vendors";
import { logNormalizer, commandSegmenter, deviceMapper } from "@/core/cli";

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
        devices: true,
        uploadedFiles: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "PM session not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { fileId, targetDeviceId } = body;

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: "fileId is required to parse session log" },
        { status: 400 }
      );
    }

    const uploadedFile = session.uploadedFiles.find((f) => f.id === fileId);
    if (!uploadedFile) {
      return NextResponse.json(
        { success: false, error: "Uploaded file not found in session" },
        { status: 404 }
      );
    }

    // 1. Retrieve original raw log file from storage
    const fileBuffer = await storage.getFile(uploadedFile.storagePath);

    // 2. Verify SHA-256 cryptographic preservation
    const calculatedHash = storage.calculateSha256(fileBuffer);
    if (calculatedHash !== uploadedFile.hashSha256) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Log file integrity check failed: file hash does not match recorded SHA-256.",
        },
        { status: 409 }
      );
    }

    // 3. Normalize raw log (handling CRLF, ANSI escapes, banners, backspaces)
    const normalizedLog = logNormalizer.normalize(fileBuffer);

    // 4. Select vendor adapter from registry
    const vendorAdapter = vendorRegistry.get(session.vendor as VendorId);
    if (!vendorAdapter) {
      return NextResponse.json(
        {
          success: false,
          error: `Vendor adapter "${session.vendor}" not found in registry`,
        },
        { status: 400 }
      );
    }

    // 5. Segment log into discrete command executions
    const segmentedLog = commandSegmenter.segment(normalizedLog, vendorAdapter);

    // 6. Map log to device
    const deviceCandidates = session.devices.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      model: d.model,
      role: d.role,
    }));

    const mappingResult = deviceMapper.mapLogToDevice(
      segmentedLog.detectedHostname,
      deviceCandidates
    );

    const resolvedDeviceId =
      targetDeviceId ||
      (!mappingResult.requiresConfirmation ? mappingResult.matchedDeviceId : undefined);

    let savedCount = 0;

    // 7. If device is resolved, persist CommandExecution records in DB
    if (resolvedDeviceId) {
      // Find command definitions to match groups
      const commands = vendorAdapter.getCommands();
      const commandGroupMap = new Map<string, string>();
      for (const cmd of commands) {
        commandGroupMap.set(cmd.id, cmd.group);
      }

      // Upsert/create CommandExecution records
      for (const seg of segmentedLog.segments) {
        const group = seg.commandId ? commandGroupMap.get(seg.commandId) : undefined;

        await prisma.commandExecution.create({
          data: {
            deviceId: resolvedDeviceId,
            command: seg.command,
            commandGroup: group || null,
            executionContext: seg.executionContext || null,
            rawOutputRef: seg.id,
            outputContent: seg.rawOutput,
            parseStatus: seg.commandStatus,
            parseError: seg.errorMessage || null,
          },
        });
        savedCount++;
      }

      // Associate uploaded file with resolved device
      await prisma.uploadedFile.update({
        where: { id: uploadedFile.id },
        data: { deviceId: resolvedDeviceId },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        fileId: uploadedFile.id,
        filename: uploadedFile.originalFilename,
        rawSha256: calculatedHash,
        normalizedMetadata: {
          encoding: normalizedLog.encoding,
          lineCount: normalizedLog.lines.length,
          hasAnsiEscapes: normalizedLog.hasAnsiEscapes,
          hasPaginationMarkers: normalizedLog.hasPaginationMarkers,
          paginationMarkerCount: normalizedLog.paginationMarkerCount,
          lineEndingType: normalizedLog.lineEndingType,
          detectedBanners: normalizedLog.detectedBanners,
        },
        segmentedLog: {
          detectedHostname: segmentedLog.detectedHostname,
          detectedVendor: segmentedLog.detectedVendor,
          detectedVdoms: segmentedLog.detectedVdoms,
          totalCommands: segmentedLog.totalCommands,
          recognizedCommands: segmentedLog.recognizedCommands,
          hasRepeatedCommands: segmentedLog.hasRepeatedCommands,
          hasPaginationInterrupts: segmentedLog.hasPaginationInterrupts,
          warnings: segmentedLog.warnings,
          segments: segmentedLog.segments,
        },
        deviceMapping: mappingResult,
        assignedDeviceId: resolvedDeviceId || null,
        savedCommandExecutions: savedCount,
      },
    });
  } catch (error) {
    console.error("Failed to parse log file:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to parse session log",
      },
      { status: 500 }
    );
  }
}
