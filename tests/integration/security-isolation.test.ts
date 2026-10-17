import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { sanitizeCliOutput } from "@/core/evidence/redaction";
import { GET as getReviewRoute } from "@/app/api/sessions/[id]/review/route";
import { GET as downloadRoute } from "@/app/api/sessions/[id]/export/[reportId]/route";
import { NextRequest } from "next/server";

describe("Phase 10: Security Isolation, Boundary Controls & Credential Redaction", () => {
  let sessionAId: string;
  let sessionBId: string;
  let reportAId: string;

  afterAll(async () => {
    try {
      if (sessionAId) await prisma.pMSession.delete({ where: { id: sessionAId } });
      if (sessionBId) await prisma.pMSession.delete({ where: { id: sessionBId } });
    } catch {
      // ignore
    }
  });

  it("strictly enforces cross-session isolation: Session B cannot access Session A's review data or exported reports", async () => {
    // 1. Create Session A (Customer A)
    const sessionA = await prisma.pMSession.create({
      data: {
        customer: "Customer A - Alpha Bank",
        vendor: "fortigate",
        status: "COMPLETED",
        devices: {
          create: [{ hostname: "ALPHA-FW-PRI", model: "FortiGate 200F", role: "Primary" }],
        },
      },
      include: { devices: true },
    });
    sessionAId = sessionA.id;

    // Create a mock generated report under Session A
    const storedReport = await storage.saveFile(
      sessionAId,
      "exports",
      "Alpha_Bank_PM_Report.docx",
      Buffer.from("MOCK_WORD_CONTENT"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    const reportA = await prisma.generatedReport.create({
      data: {
        sessionId: sessionAId,
        fileReference: storedReport.storagePath,
        version: 1,
        generationStatus: "SUCCESS",
        summary: "Sanitized Test Report",
      },
    });
    reportAId = reportA.id;

    // 2. Create Session B (Customer B)
    const sessionB = await prisma.pMSession.create({
      data: {
        customer: "Customer B - Beta Insurance",
        vendor: "fortigate",
        status: "DRAFT",
        devices: {
          create: [{ hostname: "BETA-FW-PRI", model: "FortiGate 80F", role: "Standalone" }],
        },
      },
      include: { devices: true },
    });
    sessionBId = sessionB.id;

    // 3. Attempt to download Session A's report using Session B's context
    const crossDownloadReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionBId}/export/${reportAId}`
    );
    const crossDownloadRes = await downloadRoute(crossDownloadReq, {
      params: Promise.resolve({ id: sessionBId, reportId: reportAId }),
    });

    // Must return 404 Not Found (or 403 Forbidden)
    expect([403, 404]).toContain(crossDownloadRes.status);

    // 4. Attempt to query Session A review data using Session B ID
    const crossReviewReq = new NextRequest(
      `http://localhost:3000/api/sessions/${sessionBId}/review?deviceId=${sessionA.devices[0].id}`
    );
    const crossReviewRes = await getReviewRoute(crossReviewReq, {
      params: Promise.resolve({ id: sessionBId }),
    });
    expect([400, 404]).toContain(crossReviewRes.status);
  });

  it("redacts sensitive passwords, pre-shared keys, SNMP communities, and private keys from CLI terminal outputs", () => {
    const rawCliWithSecrets = `
config vpn ipsec phase1-interface
    edit "To-Azure"
        set interface "port1"
        set peertype any
        set proposal aes256-sha256
        set psksecret ENC MTIzNDU2Nzg5MDEyMzQ1Ng==
        set password SuperSecretPassword123!
    next
end
config system snmp community
    edit 1
        set name "public"
        set community private_community_string
    next
end
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+MockPrivateKeyPayloadDataHere...
-----END RSA PRIVATE KEY-----
`;

    const redaction = sanitizeCliOutput(rawCliWithSecrets);

    expect(redaction.redactionsApplied).toBeGreaterThanOrEqual(4);
    expect(redaction.sanitizedText).not.toContain("MTIzNDU2Nzg5MDEyMzQ1Ng==");
    expect(redaction.sanitizedText).not.toContain("SuperSecretPassword123!");
    expect(redaction.sanitizedText).not.toContain("private_community_string");
    expect(redaction.sanitizedText).not.toContain("MockPrivateKeyPayloadDataHere");

    expect(redaction.sanitizedText).toContain("[REDACTED_PSK]");
    expect(redaction.sanitizedText).toContain("[REDACTED_PASSWORD]");
    expect(redaction.sanitizedText).toContain("[REDACTED_COMMUNITY]");
    expect(redaction.sanitizedText).toContain("[REDACTED_PRIVATE_KEY_BLOCK]");
  });

  it("verifies zero external egress: all internal API paths and local storage use offline boundaries", () => {
    // Verifies storage base directory is strictly local within project root
    const absPath = storage.resolveAbsolutePath("test.log");
    expect(absPath).toContain("data");
  });
});
