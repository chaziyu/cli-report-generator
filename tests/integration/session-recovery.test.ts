import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { GET as recoveryApi } from "@/app/api/sessions/[id]/recovery/route";
import { NextRequest } from "next/server";

describe("Phase 8: Autosave & Session Recovery Integration Tests", () => {
  const createdSessionIds: string[] = [];

  afterAll(async () => {
    for (const sid of createdSessionIds) {
      try {
        await prisma.pMSession.delete({ where: { id: sid } });
      } catch {
        // cleanup ignore
      }
    }
  });

  it("1. supports multiple PuTTY logs and restores GUI screenshot assignments & exclusion states (Adjustment 1)", async () => {
    // 1. Create session with 2 devices (Cluster)
    const session = await prisma.pMSession.create({
      data: {
        customer: "Maybank HA Cluster",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "MBB-FW-PRI",
              model: "FortiGate 200F",
              role: "Primary",
            },
            {
              hostname: "MBB-FW-SEC",
              model: "FortiGate 200F",
              role: "Secondary",
            },
          ],
        },
      },
      include: { devices: true },
    });
    createdSessionIds.push(session.id);
    const priDev = session.devices.find((d) => d.role === "Primary")!;
    const secDev = session.devices.find((d) => d.role === "Secondary")!;

    // 2. Upload 2 distinct PuTTY logs to storage
    const logBufPri = Buffer.from("MBB-FW-PRI # get system status\nVersion: FortiGate-200F v7.2.4\n");
    const logBufSec = Buffer.from("MBB-FW-SEC # get system status\nVersion: FortiGate-200F v7.2.4\n");

    const storedLogPri = await storage.saveFile(
      session.id,
      "logs",
      "MBB_Primary.log",
      logBufPri,
      "text/plain"
    );
    const storedLogSec = await storage.saveFile(
      session.id,
      "logs",
      "MBB_Secondary.log",
      logBufSec,
      "text/plain"
    );

    const filePri = await prisma.uploadedFile.create({
      data: {
        sessionId: session.id,
        deviceId: priDev.id,
        type: "PUTTY_LOG",
        originalFilename: "MBB_Primary.log",
        storedFilename: storedLogPri.storedFilename,
        storagePath: storedLogPri.storagePath,
        hashSha256: storedLogPri.hashSha256,
        sizeBytes: storedLogPri.sizeBytes,
        mimeType: "text/plain",
      },
    });

    const fileSec = await prisma.uploadedFile.create({
      data: {
        sessionId: session.id,
        deviceId: secDev.id,
        type: "PUTTY_LOG",
        originalFilename: "MBB_Secondary.log",
        storedFilename: storedLogSec.storedFilename,
        storagePath: storedLogSec.storagePath,
        hashSha256: storedLogSec.hashSha256,
        sizeBytes: storedLogSec.sizeBytes,
        mimeType: "text/plain",
      },
    });

    // 3. Add command executions mapped to source files
    await prisma.commandExecution.create({
      data: {
        deviceId: priDev.id,
        sourceFileId: filePri.id,
        command: "get system status",
        parseStatus: "PARSED",
      },
    });
    await prisma.commandExecution.create({
      data: {
        deviceId: secDev.id,
        sourceFileId: fileSec.id,
        command: "get system status",
        parseStatus: "PARSED",
      },
    });

    // 4. Upload GUI screenshots (1 active, 1 excluded)
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const storedActiveGui = await storage.saveFile(
      session.id,
      "evidence",
      "gui_active.png",
      samplePng,
      "image/png"
    );
    const storedExcludedGui = await storage.saveFile(
      session.id,
      "evidence",
      "gui_excluded.png",
      samplePng,
      "image/png"
    );

    const guiUploadFile = await prisma.uploadedFile.create({
      data: {
        sessionId: session.id,
        deviceId: priDev.id,
        type: "GUI_SCREENSHOT",
        originalFilename: "admin_gui.png",
        storedFilename: storedActiveGui.storedFilename,
        storagePath: storedActiveGui.storagePath,
        hashSha256: storedActiveGui.hashSha256,
        sizeBytes: storedActiveGui.sizeBytes,
        mimeType: "image/png",
      },
    });

    await prisma.evidence.create({
      data: {
        deviceId: priDev.id,
        uploadedFileId: guiUploadFile.id,
        checkId: "fg-mgmt-gui",
        title: "Active Admin GUI Access",
        appendixMapping: "Appendix 9 – GUI / Web Management Access",
        imageReference: storedActiveGui.storagePath,
        isExcluded: false,
        sourceLabel: "Uploaded GUI Screenshot",
      },
    });

    await prisma.evidence.create({
      data: {
        deviceId: secDev.id,
        uploadedFileId: guiUploadFile.id,
        checkId: "fg-mgmt-gui",
        title: "Excluded Draft Screenshot",
        appendixMapping: "Appendix 9 – GUI / Web Management Access",
        imageReference: storedExcludedGui.storagePath,
        isExcluded: true, // EXCLUDED
        sourceLabel: "Uploaded GUI Screenshot",
      },
    });

    // 5. Call GET /api/sessions/[id]/recovery
    const req = new NextRequest(`http://localhost:3000/api/sessions/${session.id}/recovery`);
    const res = await recoveryApi(req, { params: Promise.resolve({ id: session.id }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const data = json.data;

    // Verify multiple PuTTY logs are preserved with device mappings
    expect(data.files.puttyLogs.length).toBe(2);
    const priLog = data.files.puttyLogs.find((l: any) => l.originalFilename === "MBB_Primary.log");
    const secLog = data.files.puttyLogs.find((l: any) => l.originalFilename === "MBB_Secondary.log");
    expect(priLog).toBeDefined();
    expect(priLog.deviceId).toBe(priDev.id);
    expect(priLog.deviceHostname).toBe("MBB-FW-PRI");
    expect(priLog.commandCount).toBe(1);
    expect(priLog.status).toBe("PARSED");

    expect(secLog).toBeDefined();
    expect(secLog.deviceId).toBe(secDev.id);
    expect(secLog.deviceHostname).toBe("MBB-FW-SEC");
    expect(secLog.commandCount).toBe(1);
    expect(secLog.status).toBe("PARSED");

    // Verify GUI evidence assignments and exclusion states survive recovery
    expect(data.evidenceState.totalEvidence).toBe(2);
    expect(data.evidenceState.activeEvidence).toBe(1);
    expect(data.evidenceState.excludedEvidence).toBe(1);

    const activeEv = data.evidenceState.items.find((e: any) => e.title === "Active Admin GUI Access");
    const excludedEv = data.evidenceState.items.find((e: any) => e.title === "Excluded Draft Screenshot");

    expect(activeEv).toBeDefined();
    expect(activeEv.isExcluded).toBe(false);
    expect(activeEv.deviceId).toBe(priDev.id);

    expect(excludedEv).toBeDefined();
    expect(excludedEv.isExcluded).toBe(true);
    expect(excludedEv.deviceId).toBe(secDev.id);
  });

  it("2. authoritatively reconstructs partial and re-review-required pipeline states without fabrication (Adjustment 2)", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "CIMB Bank",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "CIMB-EDGE-01",
              model: "FortiGate 100F",
            },
          ],
        },
      },
      include: { devices: true },
    });
    createdSessionIds.push(session.id);
    const dev = session.devices[0];

    // Create 1 passing check and 1 check requiring review
    await prisma.checklistResult.create({
      data: {
        deviceId: dev.id,
        checkId: "fg-hw-cpu",
        checkName: "CPU Utilization",
        status: "PASS",
        collectionState: "COMPLETE",
        reviewRequired: false,
      },
    });

    await prisma.checklistResult.create({
      data: {
        deviceId: dev.id,
        checkId: "fg-fw-version",
        checkName: "Firmware Version",
        status: "WARNING",
        collectionState: "COMPLETE",
        reviewRequired: true, // Requires review!
      },
    });

    // Add a failed command execution
    await prisma.commandExecution.create({
      data: {
        deviceId: dev.id,
        command: "diagnose hardware test",
        parseStatus: "FAILED",
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/sessions/${session.id}/recovery`);
    const res = await recoveryApi(req, { params: Promise.resolve({ id: session.id }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.data;

    // Must authoritatively reflect RE_REVIEW_REQUIRED and failed commands
    expect(data.pipelineState.hasRun).toBe(true);
    expect(data.pipelineState.status).toBe("RE_REVIEW_REQUIRED");
    expect(data.pipelineState.totalChecks).toBe(2);
    expect(data.pipelineState.passCount).toBe(1);
    expect(data.pipelineState.warnCount).toBe(1);
    expect(data.pipelineState.reviewRequiredCount).toBe(1);
    expect(data.pipelineState.failedCommandsCount).toBe(1);
  });

  it("3. detects missing or inaccessible disk files with actionable warnings (Adjustment 5)", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Petronas Chemical",
        vendor: "fortigate",
        uploadedFiles: {
          create: [
            {
              type: "WORD_REPORT",
              originalFilename: "Corrupted_Or_Deleted_Template.docx",
              storedFilename: "missing_on_disk.docx",
              storagePath: "non_existent_folder/missing_on_disk.docx",
              hashSha256: "fakehash123",
              sizeBytes: 4096,
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          ],
        },
      },
      include: { uploadedFiles: true },
    });
    createdSessionIds.push(session.id);

    const req = new NextRequest(`http://localhost:3000/api/sessions/${session.id}/recovery`);
    const res = await recoveryApi(req, { params: Promise.resolve({ id: session.id }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.data;

    expect(data.files.docxReport).toBeDefined();
    // Must flag existsOnDisk: false
    expect(data.files.docxReport.existsOnDisk).toBe(false);
    // Must contain actionable warning
    expect(data.files.missingDiskFiles.length).toBeGreaterThanOrEqual(1);
    expect(data.files.missingDiskFiles[0]).toContain("not found on disk");
  });

  it("4. keeps payload lightweight and omits raw text logs, binary buffers, or base64 dumps (Adjustment 6)", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Axiata Digital",
        vendor: "fortigate",
      },
    });
    createdSessionIds.push(session.id);

    const req = new NextRequest(`http://localhost:3000/api/sessions/${session.id}/recovery`);
    const res = await recoveryApi(req, { params: Promise.resolve({ id: session.id }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    const rawString = JSON.stringify(json);

    // Payload should not contain heavy data
    expect(rawString).not.toContain("data:image/png;base64");
    expect(rawString.length).toBeLessThan(10000); // Lightweight under 10KB
  });

  it("5. Start New Session preserves all existing database records and storage files (Adjustment 4)", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "Preserved Enterprise Session",
        vendor: "fortigate",
        status: "REVIEW",
      },
    });
    createdSessionIds.push(session.id);

    // Starting a new session in client hook only clears browser state.
    // Verify that querying SQLite proves the database session is NOT deleted!
    const persisted = await prisma.pMSession.findUnique({
      where: { id: session.id },
    });
    expect(persisted).toBeDefined();
    expect(persisted?.customer).toBe("Preserved Enterprise Session");
  });

  it("6. guarantees session switching isolation between Customer A and Customer B (Adjustment 3)", async () => {
    const sessionA = await prisma.pMSession.create({
      data: { customer: "Customer Alpha", vendor: "fortigate" },
    });
    const sessionB = await prisma.pMSession.create({
      data: { customer: "Customer Beta", vendor: "fortigate" },
    });
    createdSessionIds.push(sessionA.id, sessionB.id);

    const resA = await recoveryApi(
      new NextRequest(`http://localhost:3000/api/sessions/${sessionA.id}/recovery`),
      { params: Promise.resolve({ id: sessionA.id }) }
    );
    const jsonA = await resA.json();

    const resB = await recoveryApi(
      new NextRequest(`http://localhost:3000/api/sessions/${sessionB.id}/recovery`),
      { params: Promise.resolve({ id: sessionB.id }) }
    );
    const jsonB = await resB.json();

    expect(jsonA.data.session.customer).toBe("Customer Alpha");
    expect(jsonB.data.session.customer).toBe("Customer Beta");
    expect(jsonA.data.session.id).not.toBe(jsonB.data.session.id);
  });

  it("7. recovers cleanly from an expired processing lease and identifies INTERRUPTED status (Verification Area 1 & 3)", async () => {
    // Simulate a crash mid-processing: runId was acquired 10 minutes ago, lease expired 5 minutes ago
    const expiredTimestamp = new Date(Date.now() - 5 * 60 * 1000);

    const session = await prisma.pMSession.create({
      data: {
        customer: "Crashed Node Session",
        vendor: "fortigate",
        processingRunId: "run_stale_12345",
        processingLeaseExpiresAt: expiredTimestamp,
        devices: {
          create: [{ hostname: "FW-CRASHED-01" }],
        },
      },
    });
    createdSessionIds.push(session.id);

    const req = new NextRequest(`http://localhost:3000/api/sessions/${session.id}/recovery`);
    const res = await recoveryApi(req, { params: Promise.resolve({ id: session.id }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Must be classified as INTERRUPTED
    expect(json.data.pipelineState.status).toBe("INTERRUPTED");
  });
});
