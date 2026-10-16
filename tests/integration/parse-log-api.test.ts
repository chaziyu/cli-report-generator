import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { POST as parseLogApi } from "@/app/api/sessions/[id]/parse-log/route";
import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

describe("PuTTY Log Parsing API Integration", () => {
  let sessionId: string;
  let primaryDeviceId: string;
  let uploadedFileId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // ignore
      }
    }
  });

  it("parses uploaded log file, verifies hash, segments commands, and persists CommandExecutions in SQLite", async () => {
    // 1. Create a session with two devices
    const session = await prisma.pMSession.create({
      data: {
        customer: "Integration Test Customer",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FGT200F-HQ-PRI",
              model: "FortiGate 200F",
              role: "Primary",
            },
            {
              hostname: "FGT200F-HQ-SEC",
              model: "FortiGate 200F",
              role: "Secondary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    const priDevice = session.devices.find((d) => d.hostname === "FGT200F-HQ-PRI");
    expect(priDevice).toBeDefined();
    primaryDeviceId = priDevice!.id;

    // 2. Read clean fixture file and store via storage service
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "logs",
      "fortigate-clean-session.log"
    );
    const fixtureBuffer = await fs.readFile(fixturePath);

    const storedMeta = await storage.saveFile(
      sessionId,
      "logs",
      "fortigate-session-test.log",
      fixtureBuffer,
      "text/plain"
    );

    // 3. Create UploadedFile record in SQLite
    const uploadedRecord = await prisma.uploadedFile.create({
      data: {
        sessionId,
        type: "PUTTY_LOG",
        originalFilename: storedMeta.originalFilename,
        storedFilename: storedMeta.storedFilename,
        storagePath: storedMeta.storagePath,
        hashSha256: storedMeta.hashSha256,
        sizeBytes: storedMeta.sizeBytes,
        mimeType: storedMeta.mimeType,
      },
    });
    uploadedFileId = uploadedRecord.id;

    // 4. Call POST /api/sessions/[id]/parse-log
    const request = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/parse-log`,
      {
        method: "POST",
        body: JSON.stringify({
          fileId: uploadedFileId,
        }),
      }
    );

    const res = await parseLogApi(request, {
      params: Promise.resolve({ id: sessionId }),
    });

    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.rawSha256).toBe(storedMeta.hashSha256);
    expect(json.data.segmentedLog.totalCommands).toBeGreaterThanOrEqual(11);
    expect(json.data.segmentedLog.detectedHostname).toBe("FGT200F-HQ-PRI");

    // Device should be automatically mapped without ambiguity
    expect(json.data.deviceMapping.confidence).toBe("EXACT");
    expect(json.data.assignedDeviceId).toBe(primaryDeviceId);
    expect(json.data.savedCommandExecutions).toBeGreaterThanOrEqual(11);

    // 5. Verify database persistence: check CommandExecution records in Prisma
    const savedExecutions = await prisma.commandExecution.findMany({
      where: { deviceId: primaryDeviceId },
    });

    expect(savedExecutions.length).toBeGreaterThanOrEqual(11);

    const sysPerfRecord = savedExecutions.find(
      (e) => e.command === "get system performance status"
    );
    expect(sysPerfRecord).toBeDefined();
    expect(sysPerfRecord?.commandGroup).toBe("Performance");
    expect(sysPerfRecord?.outputContent).toContain("CPU states:");
    expect(sysPerfRecord?.parseStatus).toBe("SUCCESS");

    // UploadedFile should be linked to the device
    const updatedFile = await prisma.uploadedFile.findUnique({
      where: { id: uploadedFileId },
    });
    expect(updatedFile?.deviceId).toBe(primaryDeviceId);
  });
});
