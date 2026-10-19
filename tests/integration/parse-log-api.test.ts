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

  it("is idempotent: re-parsing the exact same log file does not duplicate command executions", async () => {
    const countBefore = await prisma.commandExecution.count({
      where: { deviceId: primaryDeviceId, sourceFileId: uploadedFileId },
    });

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

    expect(res.status).toBe(200);

    const countAfter = await prisma.commandExecution.count({
      where: { deviceId: primaryDeviceId, sourceFileId: uploadedFileId },
    });

    expect(countAfter).toBe(countBefore);
  });

  it("reconciles obsolete command segments when a shortened replacement log is uploaded and parsed", async () => {
    // 1. Create a shortened log buffer with only 2 commands
    const shortenedLog =
      "FGT200F-HQ-PRI # get system status\n" +
      "Version: FortiGate-200F v7.4.11\n" +
      "Serial-Number: FG200FTK21004812\n" +
      "FGT200F-HQ-PRI # get system performance status\n" +
      "CPU states: 1% user 2% system 0% nice 97% idle\n";

    const shortenedBuffer = Buffer.from(shortenedLog, "utf-8");

    // Overwrite the existing file in storage with the shortened content
    const updatedMeta = await storage.saveFile(
      sessionId,
      "logs",
      "fortigate-session-test.log",
      shortenedBuffer,
      "text/plain"
    );

    // Update the record with the new hash, size, and storagePath
    await prisma.uploadedFile.update({
      where: { id: uploadedFileId },
      data: {
        storagePath: updatedMeta.storagePath,
        hashSha256: updatedMeta.hashSha256,
        sizeBytes: updatedMeta.sizeBytes,
      },
    });

    // 2. Re-parse
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

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.segmentedLog.totalCommands).toBe(2);

    // 3. Verify in database: obsolete segments are deleted, only 2 remain
    const remainingExecs = await prisma.commandExecution.findMany({
      where: { deviceId: primaryDeviceId, sourceFileId: uploadedFileId },
      orderBy: { segmentIndex: "asc" },
    });

    expect(remainingExecs.length).toBe(2);
    expect(remainingExecs[0].command).toBe("get system status");
    expect(remainingExecs[1].command).toBe("get system performance status");
  });

  it("rejects cross-session device confirmations with HTTP 400", async () => {
    // Create an unrelated device in a different session
    const otherSession = await prisma.pMSession.create({
      data: {
        customer: "Other Session Customer",
        vendor: "fortigate",
        devices: {
          create: {
            hostname: "OTHER-DEVICE",
            model: "FortiGate 100F",
          },
        },
      },
      include: { devices: true },
    });

    const foreignDeviceId = otherSession.devices[0].id;

    try {
      const request = new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/parse-log`,
        {
          method: "POST",
          body: JSON.stringify({
            fileId: uploadedFileId,
            targetDeviceId: foreignDeviceId,
          }),
        }
      );

      const res = await parseLogApi(request, {
        params: Promise.resolve({ id: sessionId }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Cross-session violation");
    } finally {
      await prisma.pMSession.delete({ where: { id: otherSession.id } });
    }
  });
});
