import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as inspectDocApi } from "@/app/api/sessions/[id]/inspect-doc/route";
import { NextRequest } from "next/server";

describe("Word Document Inspection API Integration", () => {
  let sessionId: string;
  let deviceId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore
      }
    }
  });

  it("inspects uploaded CTC Word report via API, maps targets, and enriches session device metadata", async () => {
    const samplePath = path.join(
      process.cwd(),
      "doc",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx"
    );

    let docBuffer: Buffer;
    try {
      docBuffer = await fs.readFile(samplePath);
    } catch {
      console.warn("Skipping test: sample file not available at", samplePath);
      return;
    }

    // 1. Create a session and device without serial number
    const session = await prisma.pMSession.create({
      data: {
        customer: "ITOCHU Malaysia",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FGT80F-ITOCHU",
              role: "Primary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    deviceId = session.devices[0].id;

    // 2. Save the docx into storage and create UploadedFile record
    const stored = await storage.saveFile(
      sessionId,
      "reports",
      "PM Report_FortiGate 80F_ITOCHU Malaysia_07082025.docx",
      docBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "WORD_REPORT",
        originalFilename: stored.originalFilename,
        storedFilename: stored.storedFilename,
        storagePath: stored.storagePath,
        hashSha256: stored.hashSha256,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
      },
    });

    // 3. Call POST /api/sessions/[id]/inspect-doc
    const postReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/inspect-doc`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    const postRes = await inspectDocApi(postReq, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(postRes.status).toBe(200);
    const json = await postRes.json();
    expect(json.success).toBe(true);

    const insp = json.data.inspection;
    expect(insp.isSupportedLayout).toBe(true);
    expect(insp.layoutId).toBe("ctc-fortigate-v1_1");
    expect(insp.metadata.engineerName).toBe("Syivhanii Selvarajan");
    expect(insp.editableChecklistRows.length).toBe(21);
    expect(insp.appendixContainers.length).toBeGreaterThan(5);
    expect(insp.protectedSections.length).toBeGreaterThanOrEqual(1);

    // 4. Verify that device serial number was enriched from report
    const updatedDevice = await prisma.device.findUnique({
      where: { id: deviceId },
    });
    expect(updatedDevice?.serialNumber).toBe("FGT80FTK21015747");
  });
});
