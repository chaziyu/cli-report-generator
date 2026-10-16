import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createSessionSchema, createDeviceSchema } from "@/lib/validations/session";
import { storage } from "@/lib/storage";

describe("PM Session & Device Management Integration", () => {
  let createdSessionId: string;

  beforeEach(async () => {
    // ensure test DB is available
  });

  afterAll(async () => {
    if (createdSessionId) {
      try {
        const exists = await prisma.pMSession.findUnique({ where: { id: createdSessionId } });
        if (exists) {
          await prisma.pMSession.delete({ where: { id: createdSessionId } });
        }
      } catch {
        // ignore
      }
    }
  });

  describe("Validation Logic", () => {
    it("rejects session creation with empty customer", () => {
      const invalidInput = {
        customer: "",
        vendor: "fortigate",
      };
      const result = createSessionSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.customer).toBeDefined();
      }
    });

    it("rejects device creation with missing hostname", () => {
      const invalidDevice = {
        model: "FG-100F",
        serialNumber: "FG100F123456",
      };
      const result = createDeviceSchema.safeParse(invalidDevice);
      expect(result.success).toBe(false);
    });

    it("accepts valid session data with multiple devices", () => {
      const validInput = {
        customer: "CTC Global Demo Client",
        vendor: "fortigate",
        engineerName: "Ahmad Razak",
        devices: [
          { hostname: "HQ-FW-01", model: "FG-200F", role: "Primary" },
          { hostname: "HQ-FW-02", model: "FG-200F", role: "Secondary" },
        ],
      };
      const result = createSessionSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("defaults customer to Draft PM Session when omitted", () => {
      const result = createSessionSchema.safeParse({ vendor: "fortigate" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customer).toBe("Draft PM Session");
      }
    });
  });

  describe("Database Persistence & Session Operations", () => {
    it("creates a PM session with multiple devices in SQLite", async () => {
      const session = await prisma.pMSession.create({
        data: {
          customer: "Bank Negara Malaysia PM Test",
          vendor: "fortigate",
          engineerName: "Senior Network Engineer",
          status: "DRAFT",
          notes: "Annual firewall maintenance review",
          devices: {
            create: [
              {
                hostname: "BNM-DC-FW01",
                model: "FortiGate 200F",
                serialNumber: "FG200FTK21000001",
                role: "Primary",
                haStatus: "Active-Passive",
              },
              {
                hostname: "BNM-DC-FW02",
                model: "FortiGate 200F",
                serialNumber: "FG200FTK21000002",
                role: "Secondary",
                haStatus: "Active-Passive",
              },
            ],
          },
        },
        include: {
          devices: true,
        },
      });

      expect(session.id).toBeDefined();
      expect(session.customer).toBe("Bank Negara Malaysia PM Test");
      expect(session.devices.length).toBe(2);
      expect(session.devices[0].hostname).toBe("BNM-DC-FW01");
      expect(session.devices[1].hostname).toBe("BNM-DC-FW02");

      createdSessionId = session.id;
    });

    it("retrieves the session and related device entities", async () => {
      const session = await prisma.pMSession.findUnique({
        where: { id: createdSessionId },
        include: {
          devices: true,
          uploadedFiles: true,
        },
      });

      expect(session).not.toBeNull();
      expect(session?.customer).toBe("Bank Negara Malaysia PM Test");
      expect(session?.devices.length).toBe(2);
    });

    it("adds a 3rd device to the existing session", async () => {
      const newDevice = await prisma.device.create({
        data: {
          sessionId: createdSessionId,
          hostname: "BNM-DR-FW01",
          model: "FortiGate 100F",
          serialNumber: "FG100FTK21000003",
          role: "DR-Site",
        },
      });

      expect(newDevice.id).toBeDefined();
      expect(newDevice.sessionId).toBe(createdSessionId);

      const count = await prisma.device.count({
        where: { sessionId: createdSessionId },
      });
      expect(count).toBe(3);
    });

    it("stores uploaded file metadata with SHA-256 hash", async () => {
      const sampleLogContent = Buffer.from("FortiGate-200F # get system status\nVersion: FortiGate-200F v7.2.5\n");
      const metadata = await storage.saveFile(
        createdSessionId,
        "logs",
        "sample_putty.log",
        sampleLogContent,
        "text/plain"
      );

      const fileRecord = await prisma.uploadedFile.create({
        data: {
          sessionId: createdSessionId,
          type: "PUTTY_LOG",
          originalFilename: metadata.originalFilename,
          storedFilename: metadata.storedFilename,
          storagePath: metadata.storagePath,
          hashSha256: metadata.hashSha256,
          sizeBytes: metadata.sizeBytes,
          mimeType: metadata.mimeType,
        },
      });

      expect(fileRecord.id).toBeDefined();
      expect(fileRecord.hashSha256).toBe(metadata.hashSha256);
      expect(fileRecord.type).toBe("PUTTY_LOG");

      // Verify file exists on disk
      expect(await storage.fileExists(metadata.storagePath)).toBe(true);

      // Cleanup stored file
      await storage.deleteFile(metadata.storagePath);
    });

    it("updates session status and notes", async () => {
      const updated = await prisma.pMSession.update({
        where: { id: createdSessionId },
        data: {
          status: "IN_PROGRESS",
          notes: "Updated during checklist collection",
        },
      });

      expect(updated.status).toBe("IN_PROGRESS");
      expect(updated.notes).toBe("Updated during checklist collection");
    });

    it("deletes session with cascading cleanup", async () => {
      await prisma.pMSession.delete({
        where: { id: createdSessionId },
      });

      const session = await prisma.pMSession.findUnique({
        where: { id: createdSessionId },
      });
      expect(session).toBeNull();

      // Check that devices were cascade deleted
      const devices = await prisma.device.findMany({
        where: { sessionId: createdSessionId },
      });
      expect(devices.length).toBe(0);

      // Check that files were cascade deleted
      const files = await prisma.uploadedFile.findMany({
        where: { sessionId: createdSessionId },
      });
      expect(files.length).toBe(0);
    });
  });
});
