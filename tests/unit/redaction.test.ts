import { describe, it, expect } from "vitest";
import { sanitizeCliOutput } from "@/core/evidence/redaction";

describe("CLI Output Redaction & Sanitization", () => {
  it("sanitizes FortiOS encrypted passwords (set password ENC ...)", () => {
    const raw = `
config system admin
    edit "admin"
        set password ENC AK1M5Xb/9204kf8a...
        set comments "Super Admin"
    next
end
`;
    const result = sanitizeCliOutput(raw);
    expect(result.redactionsApplied).toBe(1);
    expect(result.sanitizedText).toContain("set password ENC [REDACTED_PASSWORD]");
    expect(result.sanitizedText).not.toContain("AK1M5Xb");
  });

  it("sanitizes IPsec pre-shared keys (set psksecret ENC ...)", () => {
    const raw = `
config vpn ipsec phase1-interface
    edit "To-HQ"
        set interface "wan1"
        set peertype any
        set proposal aes128-sha256
        set psksecret ENC 11223344556677889900aabbccddeeff
    next
end
`;
    const result = sanitizeCliOutput(raw);
    expect(result.redactionsApplied).toBe(1);
    expect(result.sanitizedText).toContain("set psksecret ENC [REDACTED_PSK]");
    expect(result.sanitizedText).not.toContain("1122334455667788");
  });

  it("sanitizes plaintext passwords and plaintext psksecrets", () => {
    const raw = `
set password SuperSecret123!
set psksecret CustomerCompanyKey2026!
`;
    const result = sanitizeCliOutput(raw);
    expect(result.redactionsApplied).toBe(2);
    expect(result.sanitizedText).toContain("set password [REDACTED_PASSWORD]");
    expect(result.sanitizedText).toContain("set psksecret [REDACTED_PSK]");
    expect(result.sanitizedText).not.toContain("SuperSecret123!");
    expect(result.sanitizedText).not.toContain("CustomerCompanyKey2026!");
  });

  it("sanitizes private key blocks", () => {
    const raw = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y3yZ...
wIBAAKCAQEA0Y3yZ
-----END RSA PRIVATE KEY-----
`;
    const result = sanitizeCliOutput(raw);
    expect(result.redactionsApplied).toBe(1);
    expect(result.sanitizedText).toContain("[REDACTED_PRIVATE_KEY_BLOCK]");
    expect(result.sanitizedText).not.toContain("MIIEowIBAAKCAQEA0Y3yZ");
  });

  it("sanitizes SNMP community strings and bearer authorization tokens", () => {
    const raw = `
set community public_ro_secure
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123
`;
    const result = sanitizeCliOutput(raw);
    expect(result.redactionsApplied).toBe(2);
    expect(result.sanitizedText).toContain("set community [REDACTED_COMMUNITY]");
    expect(result.sanitizedText).toContain("Bearer [REDACTED_TOKEN]");
  });

  it("leaves standard non-sensitive network configuration and status completely intact", () => {
    const raw = `
CPU states: 0% user 1% system 0% nice 99% idle
Memory: 16384000k total, 5406720k used (33%)
Filesystem 1k-blocks Used Available Use% Mounted on
/dev/root 30000000 15000000 15000000 50% /var/log
`;
    const result = sanitizeCliOutput(raw);
    expect(result.redactionsApplied).toBe(0);
    expect(result.sanitizedText).toBe(raw);
  });
});
