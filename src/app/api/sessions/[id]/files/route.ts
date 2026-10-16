import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { FileCategory } from "@/lib/storage/types";
import { guiEvidenceMapper } from "@/core/evidence/gui-evidence-mapper";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;

    const files = await prisma.uploadedFile.findMany({
      where: { sessionId },
      include: {
        evidences: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enrichedFiles = files.map((file) => ({
      ...file,
      evidence: file.evidences.length > 0 ? file.evidences[0] : null,
    }));

    return NextResponse.json({ success: true, data: enrichedFiles });
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
    const checkId = (formData.get("checkId") as string) || null;
    const appendixMapping = (formData.get("appendixMapping") as string) || null;
    const title = (formData.get("title") as string) || file?.name || "Evidence";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided in form data" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate image content server-side for screenshots (magic bytes, decode, size)
    if (type === "GUI_SCREENSHOT") {
      const validation = await guiEvidenceMapper.validateImageContent(buffer);
      if (!validation.isValid) {
        return NextResponse.json(
          { success: false, error: validation.error || "Invalid image content" },
          { status: 400 }
        );
      }
    }

    // Determine category folder
    let category: FileCategory = "logs";
    if (type === "WORD_REPORT") category = "reports";
    else if (type === "GUI_SCREENSHOT") category = "screenshots";
    else if (type === "PUTTY_LOG") category = "logs";

    // Save to local disk via storage abstraction
    const metadata = await storage.saveFile(
      sessionId,
      category,
      file.name,
      buffer,
      file.type || undefined
    );

    // Store in UploadedFile database table (preserves audit trail & provenance)
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

    // If GUI Screenshot, also create an Evidence record with explicit foreign key and stable checkId
    let evidenceRecord = null;
    if (type === "GUI_SCREENSHOT") {
      evidenceRecord = await prisma.evidence.create({
        data: {
          commandExecutionId: null, // manual GUI evidence, distinct from CLI commands
          uploadedFileId: uploadedRecord.id, // Explicit relational link
          deviceId: deviceId || undefined,
          checkId: checkId || undefined, // Stable PM task identifier e.g. "fg-mgmt-gui"
          title,
          appendixMapping,
          imageReference: metadata.storagePath,
          caption: appendixMapping ? `${appendixMapping}: ${title}` : title,
          sourceLabel: "Uploaded GUI screenshot",
          isExcluded: false,
          pageNumber: 1,
          totalPages: 1,
          isRedacted: false,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...uploadedRecord,
          evidence: evidenceRecord,
        },
      },
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const body = await request.json();
    const { fileId, appendixMapping, deviceId, title, checkId, isExcluded } = body;

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: "fileId is required to update file metadata" },
        { status: 400 }
      );
    }

    const file = await prisma.uploadedFile.findUnique({
      where: { id: fileId },
    });

    if (!file || file.sessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: "Uploaded file not found in session" },
        { status: 404 }
      );
    }

    // Update deviceId on UploadedFile if provided
    const updatedFile = await prisma.uploadedFile.update({
      where: { id: fileId },
      data: {
        deviceId: deviceId !== undefined ? deviceId : file.deviceId,
      },
    });

    // If evidence exists for this file, update its appendix mapping, checkId, device, and exclusion status
    let updatedEvidence = null;
    const existingEvidence = await prisma.evidence.findFirst({
      where: {
        OR: [
          { uploadedFileId: fileId },
          { imageReference: file.storagePath },
        ],
      },
    });

    if (existingEvidence) {
      updatedEvidence = await prisma.evidence.update({
        where: { id: existingEvidence.id },
        data: {
          uploadedFileId: fileId,
          appendixMapping:
            appendixMapping !== undefined ? appendixMapping : existingEvidence.appendixMapping,
          checkId: checkId !== undefined ? checkId : existingEvidence.checkId,
          deviceId: deviceId !== undefined ? deviceId : existingEvidence.deviceId,
          title: title !== undefined ? title : existingEvidence.title,
          isExcluded: isExcluded !== undefined ? isExcluded : existingEvidence.isExcluded,
          caption:
            appendixMapping !== undefined
              ? `${appendixMapping}: ${title || existingEvidence.title}`
              : existingEvidence.caption,
        },
      });
    } else if (file.type === "GUI_SCREENSHOT") {
      // Create evidence record if it was previously excluded from report
      updatedEvidence = await prisma.evidence.create({
        data: {
          commandExecutionId: null,
          uploadedFileId: fileId,
          deviceId: deviceId || file.deviceId || undefined,
          checkId: checkId || undefined,
          title: title || file.originalFilename,
          appendixMapping: appendixMapping || null,
          imageReference: file.storagePath,
          sourceLabel: "Uploaded GUI screenshot",
          isExcluded: false,
          pageNumber: 1,
          totalPages: 1,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updatedFile,
        evidence: updatedEvidence,
      },
    });
  } catch (error) {
    console.error("Failed to update file metadata:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update file metadata" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");
    const permanent = searchParams.get("permanent") === "true";

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: "fileId query parameter is required" },
        { status: 400 }
      );
    }

    const file = await prisma.uploadedFile.findUnique({
      where: { id: fileId },
    });

    if (!file || file.sessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: "Uploaded file not found in session" },
        { status: 404 }
      );
    }

    // Permanent deletion is explicitly disabled for MVP audit compliance
    if (searchParams.get("permanent") === "true") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Permanent deletion of raw evidence is disabled under CTC audit retention policy. Evidence can only be excluded from the report.",
        },
        { status: 403 }
      );
    }

    // Remove from report: Mark as excluded (isExcluded: true) so it stays excluded across refreshes and exports
    await prisma.evidence.updateMany({
      where: {
        OR: [
          { uploadedFileId: fileId },
          { imageReference: file.storagePath },
        ],
      },
      data: {
        isExcluded: true,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        "Screenshot excluded from report. Original uploaded file and cryptographic hash preserved for audit compliance.",
      action: "REMOVED_FROM_REPORT",
    });
  } catch (error) {
    console.error("Failed to delete/remove file:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove file" },
      { status: 500 }
    );
  }
}
