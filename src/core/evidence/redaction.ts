export interface RedactionResult {
  sanitizedText: string;
  redactionsApplied: number;
  redactedPatterns: string[];
}

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const REDACTION_RULES: RedactionRule[] = [
  // 1. Private key blocks (RSA, OPENSSH, EC, DSA)
  {
    name: "Private Key Block",
    pattern: /-----BEGIN [A-Z\s]+PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+PRIVATE KEY-----/gi,
    replacement: "[REDACTED_PRIVATE_KEY_BLOCK]",
  },
  // 2. FortiGate encrypted secrets & passwords (set password ENC ..., set psksecret ENC ...)
  {
    name: "FortiOS Encrypted Password",
    pattern: /(set\s+password\s+ENC\s+)[^\r\n]+/gi,
    replacement: "$1[REDACTED_PASSWORD]",
  },
  {
    name: "FortiOS Encrypted PSK Secret",
    pattern: /(set\s+psksecret\s+ENC\s+)[^\r\n]+/gi,
    replacement: "$1[REDACTED_PSK]",
  },
  {
    name: "FortiOS Encrypted Secret",
    pattern: /(set\s+secret\s+ENC\s+)[^\r\n]+/gi,
    replacement: "$1[REDACTED_SECRET]",
  },
  // 3. Plaintext password / secret assignments
  {
    name: "Plaintext Password",
    pattern: /(set\s+password\s+)(?!ENC\s+)[^\s\r\n]+/gi,
    replacement: "$1[REDACTED_PASSWORD]",
  },
  {
    name: "Plaintext PSK Secret",
    pattern: /(set\s+psksecret\s+)(?!ENC\s+)[^\s\r\n]+/gi,
    replacement: "$1[REDACTED_PSK]",
  },
  {
    name: "Plaintext Secret",
    pattern: /(set\s+secret\s+)(?!ENC\s+)[^\s\r\n]+/gi,
    replacement: "$1[REDACTED_SECRET]",
  },
  // 4. SNMP Community Strings
  {
    name: "SNMP Community",
    pattern: /(set\s+community\s+)[^\s\r\n]+/gi,
    replacement: "$1[REDACTED_COMMUNITY]",
  },
  // 5. Authorization Bearer Tokens
  {
    name: "Bearer Token",
    pattern: /(Bearer\s+)[A-Za-z0-9\-_.~+/]+=*/gi,
    replacement: "$1[REDACTED_TOKEN]",
  },
  // 6. Linux/Unix password hashes ($1$, $5$, $6$, $2a$)
  {
    name: "Password Hash",
    pattern: /\$(?:1|5|6|2a|2b)\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]{20,}/g,
    replacement: "[REDACTED_PASSWORD_HASH]",
  },
];

/**
 * Sanitizes sensitive operational credentials from CLI output.
 * Ensures evidence screenshots do not leak pre-shared keys, passwords, or private certificates.
 */
export function sanitizeCliOutput(rawText: string): RedactionResult {
  if (!rawText) {
    return {
      sanitizedText: "",
      redactionsApplied: 0,
      redactedPatterns: [],
    };
  }

  let sanitized = rawText;
  let totalApplied = 0;
  const triggeredPatterns: string[] = [];

  for (const rule of REDACTION_RULES) {
    const matches = sanitized.match(rule.pattern);
    if (matches && matches.length > 0) {
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
      totalApplied += matches.length;
      triggeredPatterns.push(`${rule.name} (${matches.length})`);
    }
  }

  return {
    sanitizedText: sanitized,
    redactionsApplied: totalApplied,
    redactedPatterns: triggeredPatterns,
  };
}
