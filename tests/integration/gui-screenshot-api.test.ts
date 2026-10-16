import { describe, it, expect, afterAll } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import {
  POST as uploadFileApi,
  GET as getFilesApi,
  PATCH as patchFileApi,
  DELETE as deleteFileApi,
} from "@/app/api/sessions/[id]/files/route";
import { POST as generateCliEvidenceApi } from "@/app/api/sessions/[id]/evidence/route";
import { GET as getEvidenceImageApi } from "@/app/api/sessions/[id]/evidence/[evidenceId]/route";
import { NextRequest } from "next/server";

describe("GUI Screenshot Upload & Management API Integration", () => {
  let sessionId: string;
  let deviceId: string;

  afterAll(async () => {
    if (sessionId) {
      try {
        await prisma.pMSession.delete({ where: { id: sessionId } });
      } catch {
        // cleanup ignore
      }
    }
  });

  it("sets up session with primary device", async () => {
    const session = await prisma.pMSession.create({
      data: {
        customer: "GUI Screenshot Test Customer",
        vendor: "fortigate",
        devices: {
          create: [
            {
              hostname: "FGT-TEST-PRIMARY",
              model: "FortiGate 200F",
              role: "Primary",
            },
          ],
        },
      },
      include: { devices: true },
    });

    sessionId = session.id;
    deviceId = session.devices[0].id;
    expect(sessionId).toBeDefined();
    expect(deviceId).toBeDefined();
  });

  it("rejects invalid/fake image content during upload", async () => {
    const fakeBuffer = Buffer.from("Not a real image binary, just plain text");
    const fakeBlob = new Blob([fakeBuffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", fakeBlob, "fake_screenshot.png");
    formData.append("type", "GUI_SCREENSHOT");

    const req = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`, {
      method: "POST",
      body: formData,
    });

    const res = await uploadFileApi(req, {
      params: Promise.resolve({ id: sessionId }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid image format");
  });

  it("uploads valid PNG screenshot, creates UploadedFile and linked Evidence with uploadedFileId and stable checkId", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 4,
        background: { r: 40, g: 120, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const blob = new Blob([pngBuffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", blob, "gui_access.png");
    formData.append("type", "GUI_SCREENSHOT");
    formData.append("deviceId", deviceId);
    formData.append("checkId", "fg-mgmt-gui"); // stable checklist task ID
    formData.append("appendixMapping", "Appendix 9 - Web GUI Access");
    formData.append("title", "Accessibility of FortiGate via GUI");

    const req = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`, {
      method: "POST",
      body: formData,
    });

    const res = await uploadFileApi(req, {
      params: Promise.resolve({ id: sessionId }),
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.id).toBeDefined();
    expect(data.data.type).toBe("GUI_SCREENSHOT");
    expect(data.data.hashSha256).toBeDefined();

    // Verify Evidence record created with explicit uploadedFileId and stable checkId
    const evidence = data.data.evidence;
    expect(evidence).toBeDefined();
    expect(evidence.commandExecutionId).toBeNull();
    expect(evidence.uploadedFileId).toBe(data.data.id); // Explicit foreign key verified!
    expect(evidence.checkId).toBe("fg-mgmt-gui"); // Stable PM task ID verified!
    expect(evidence.sourceLabel).toBe("Uploaded GUI screenshot");
    expect(evidence.appendixMapping).toBe("Appendix 9 - Web GUI Access");
    expect(evidence.deviceId).toBe(deviceId);
    expect(evidence.isExcluded).toBe(false);

    // Verify file exists on local storage
    const exists = await storage.fileExists(data.data.storagePath);
    expect(exists).toBe(true);

    // Verify image can be fetched with safe headers
    const imgReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evidence/${evidence.id}`
    );
    const imgRes = await getEvidenceImageApi(imgReq, {
      params: Promise.resolve({ id: sessionId, evidenceId: evidence.id }),
    });

    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get("Content-Type")).toBe("image/png");
    expect(imgRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("reassigns screenshot appendix, stable checkId, and device mapping via PATCH", async () => {
    // 1. Get uploaded files list
    const getReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`);
    const getRes = await getFilesApi(getReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const listData = await getRes.json();
    const screenshot = listData.data.find((f: any) => f.type === "GUI_SCREENSHOT");
    expect(screenshot).toBeDefined();

    // 2. Reassign to Appendix 16 with stable checkId fg-sys-backup
    const patchReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: screenshot.id,
        checkId: "fg-sys-backup",
        appendixMapping: "Appendix 16 - Backup Configuration",
        title: "Backup Configurations",
      }),
    });

    const patchRes = await patchFileApi(patchReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const patchData = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patchData.success).toBe(true);
    expect(patchData.data.evidence.uploadedFileId).toBe(screenshot.id);
    expect(patchData.data.evidence.checkId).toBe("fg-sys-backup");
    expect(patchData.data.evidence.appendixMapping).toBe("Appendix 16 - Backup Configuration");
    expect(patchData.data.evidence.title).toBe("Backup Configurations");
  });

  it("safely removes screenshot from report (persists isExcluded=true) without deleting file or audit record", async () => {
    // 1. Find the uploaded screenshot
    const getReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`);
    const getRes = await getFilesApi(getReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const listData = await getRes.json();
    const screenshot = listData.data.find((f: any) => f.type === "GUI_SCREENSHOT");
    expect(screenshot).toBeDefined();
    const storagePath = screenshot.storagePath;

    // 2. Call DELETE with permanent=false (Remove from Report)
    const delReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/files?fileId=${screenshot.id}&permanent=false`,
      { method: "DELETE" }
    );
    const delRes = await deleteFileApi(delReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const delData = await delRes.json();

    expect(delRes.status).toBe(200);
    expect(delData.success).toBe(true);
    expect(delData.action).toBe("REMOVED_FROM_REPORT");

    // 3. Verify Evidence record is flagged isExcluded = true (persisted exclusion across reloads!)
    const excludedEvidence = await prisma.evidence.findFirst({
      where: { uploadedFileId: screenshot.id },
    });
    expect(excludedEvidence).not.toBeNull();
    expect(excludedEvidence?.isExcluded).toBe(true);

    // 4. Verify on session reload / GET files, the file reflects isExcluded = true
    const reloadReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`);
    const reloadRes = await getFilesApi(reloadReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const reloadData = await reloadRes.json();
    const reloadedItem = reloadData.data.find((f: any) => f.id === screenshot.id);
    expect(reloadedItem.evidence.isExcluded).toBe(true);

    // 5. Verify UploadedFile record and physical disk file STILL EXIST (audit preservation)
    const preservedRecord = await prisma.uploadedFile.findUnique({
      where: { id: screenshot.id },
    });
    expect(preservedRecord).not.toBeNull();
    const diskExists = await storage.fileExists(storagePath);
    expect(diskExists).toBe(true);
  });

  it("rejects permanent deletion requests with 403 Forbidden under CTC audit retention policy", async () => {
    const getReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/files`);
    const getRes = await getFilesApi(getReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const listData = await getRes.json();
    const screenshot = listData.data.find((f: any) => f.type === "GUI_SCREENSHOT");

    const delReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/files?fileId=${screenshot.id}&permanent=true`,
      { method: "DELETE" }
    );
    const delRes = await deleteFileApi(delReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const delData = await delRes.json();

    expect(delRes.status).toBe(403);
    expect(delData.success).toBe(false);
    expect(delData.error).toContain("Permanent deletion of raw evidence is disabled");
  });

  it("guarantees CLI evidence generation never overwrites or deletes manual GUI evidence", async () => {
    // 1. Upload a new manual GUI screenshot
    const pngBuffer = await sharp({
      create: {
        width: 300,
        height: 200,
        channels: 4,
        background: { r: 100, g: 200, b: 50, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const blob = new Blob([pngBuffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", blob, "permanent_gui.png");
    formData.append("type", "GUI_SCREENSHOT");
    formData.append("deviceId", deviceId);
    formData.append("checkId", "fg-mgmt-gui");
    formData.append("appendixMapping", "Appendix 9 - Web GUI Access");

    const uploadReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/files`,
      {
        method: "POST",
        body: formData,
      }
    );
    const uploadRes = await uploadFileApi(uploadReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const uploadData = await uploadRes.json();
    const guiEvidenceId = uploadData.data.evidence.id;

    // 2. Create a CLI command execution
    const exec = await prisma.commandExecution.create({
      data: {
        deviceId,
        command: "get system status",
        outputContent: "Version: FortiGate-200F v7.2.4\nStatus: Normal",
        parseStatus: "PARSED",
      },
    });

    // 3. Trigger CLI evidence generation
    const cliReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionId}/evidence`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const cliRes = await generateCliEvidenceApi(cliReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const cliData = await cliRes.json();
    expect(cliRes.status).toBe(200);
    expect(cliData.success).toBe(true);

    // 4. Verify the manual GUI screenshot Evidence record is still intact
    const intactGuiEvidence = await prisma.evidence.findUnique({
      where: { id: guiEvidenceId },
    });
    expect(intactGuiEvidence).not.toBeNull();
    expect(intactGuiEvidence?.commandExecutionId).toBeNull();
    expect(intactGuiEvidence?.uploadedFileId).toBeDefined();
    expect(intactGuiEvidence?.checkId).toBe("fg-mgmt-gui");
    expect(intactGuiEvidence?.sourceLabel).toBe("Uploaded GUI screenshot");
  });
});
