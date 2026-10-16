<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent Guidelines for CTC PM Automation Tool

Welcome, AI coding agent. This document defines the engineering standards, architecture invariants, security boundaries, and operational workflows for contributing to the **CTC PM Automation Tool** (`cli-report-generator`).

---

## 1. Project Mission & Core Objective

The CTC PM Automation Tool is a local-first, offline-capable application built for CTC Global's Network Security Practice. It automates Preventive Maintenance (PM) reporting for enterprise firewalls (FortiGate initially, followed by Palo Alto, Check Point, etc.).

The system:
1. Ingests authentic PuTTY session logs (`.txt`) and existing CTC Word templates (`.docx`).
2. Segments commands and normalizes telemetry deterministically.
3. Evaluates 21 PM checklist rules based on the CTC **QMS-P09-F01 v1.1** standard.
4. Generates appendix-ready terminal screenshot images using SVG + Sharp.
5. Provides an interactive Engineer Review & Approval Hub with side-by-side Word vs. Telemetry diffs.
6. Performs targeted, non-destructive OpenXML (`.docx`) package updates and exports versioned reports.

---

## 2. Hard Architectural Invariants (Never Violate)

When modifying or extending this codebase, you **must adhere to these 5 core invariants**:

### Invariant 1: Keep `src/core/` Vendor-Agnostic
- **Rule**: Never introduce vendor-specific checks such as `if (vendor === "fortigate")` or hardcoded prompt syntax inside `src/core/`.
- **Reason**: All firewall vendor behavior must be isolated inside a vendor adapter in `src/vendors/<vendor>/` implementing the `VendorAdapter` interface.
- **Pattern**: Core services consume normalized contracts (`NormalizedCheckResult`, `VendorCheckItemDefinition`, `VendorCommandDefinition`).

### Invariant 2: Non-Destructive OOXML Editing Only
- **Rule**: Never regenerate CTC Word reports from scratch or use generic Word document builder libraries (e.g. `docx` npm package).
- **Reason**: CTC reports (`QMS-P09-F01 v1.1`) contain delicate styling, header/footer relationships, custom margins, and proprietary layouts.
- **Pattern**: Load the authentic `.docx` as an OOXML zip package via `JSZip`, modify only targeted text runs, Structured Document Tag (SDT) checkboxes (`w14:checkbox` / `☒`), and `word/media/` appendix images. Always verify that protected Table 0 (Author sign-off / credentials) and Table 1 (Customer satisfaction survey) remain completely intact via `DocxValidator`.

### Invariant 3: Deterministic Rule Evaluation First
- **Rule**: Never use generative AI, probabilistic models, or fuzzy heuristics to determine whether a PM check passes or fails.
- **Reason**: Enterprise audit compliance requires predictable, verifiable, and deterministic logic.
- **Pattern**: Parse exact telemetry values (CPU utilization %, Memory utilization %, HA sync state, contract expiry dates) and evaluate against explicit numerical/state boundaries in `src/vendors/<vendor>/rules.ts`.

### Invariant 4: Mandatory Review Approvals & Exception Tracking
- **Rule**: No automated finding may be written to the Word report without engineer approval recorded in `ReviewDecision`.
- **Reason**: The engineer bears ultimate professional sign-off responsibility for the client report.
- **Pattern**: Overriding a Warning or Failure, or marking an item N/A when mandatory evidence is required, enforces an explicit justification record in SQLite.

### Invariant 5: Local-First Confidentiality & Cryptographic Preservation
- **Rule**: Never send customer session logs, device hostnames, configurations, or report binaries to external cloud services.
- **Reason**: Enterprise firewalls contain sensitive network architectures, pre-shared keys, and internal topologies.
- **Pattern**: All storage resides in local filesystem under `data/storage/` with immutable SHA-256 checksums. Ensure `.gitignore` continues to exclude `doc/`, `docs/`, `data/`, and database files.

---

## 3. Technology Stack & Key Libraries

- **Framework**: Next.js 16.4.2 (App Router with Node.js runtime, Turbopack)
- **Language**: TypeScript 5 in strict mode
- **Database & ORM**: SQLite with Prisma (`prisma/schema.prisma`)
- **Document Engine**: `jszip` (v3.10.2) + `fast-xml-parser` (v5)
- **Evidence Rendering**: `sharp` (v0.35.5) + programmatic SVG generation
- **Styling**: Tailwind CSS v4 with custom obsidian dark theme tokens
- **Test Runner**: Vitest 3 with `pool: "forks"` and `singleFork: true`

---

## 4. Key Directory Layout

```text
src/
├── app/
│   ├── api/sessions/               # Next.js API Routes (Server execution)
│   │   ├── [id]/evaluate/route.ts  # Runs deterministic rules for device
│   │   ├── [id]/evidence/route.ts  # Generates terminal screenshot images
│   │   ├── [id]/export/route.ts    # Edits DOCX and creates GeneratedReport
│   │   ├── [id]/parse-log/route.ts # Segments commands and extracts outputs
│   │   └── [id]/review/route.ts    # Computes diffs and persists ReviewDecisions
│   ├── sessions/                   # Client & Server Pages
│   └── globals.css                 # Dark theme variable definitions
├── components/
│   ├── checklist/                  # PM checklist tables, command copying
│   ├── evidence/                   # Terminal screenshot viewer & pagination
│   ├── log-importer/               # PuTTY log segmentation & device mapping
│   ├── report/                     # ReviewTable, JustificationDialog, ExportModal
│   └── session/                    # Session workspace, file tables, device managers
├── core/
│   ├── checks/                     # RuleEngine, normalized result contracts
│   ├── cli/                        # LogNormalizer, CommandSegmenter, prompt rules
│   ├── document/                   # DocxInspector, DocxEditor, DocxValidator, OoxmlRelationships
│   ├── evidence/                   # EvidenceRenderer, SVG layout, credential redaction
│   └── review/                     # ReviewService, decision validation, diff analysis
├── report-layouts/                 # Version-specific Word document structural maps
│   └── ctc-fortigate-v1_1.ts       # QMS-P09-F01 v1.1 table row & cell coordinates
└── vendors/                        # Isolated firewall vendor adapters
    ├── registry.ts                 # Adapter registry singleton
    ├── types.ts                    # VendorAdapter, VendorParser, VendorRule contracts
    └── fortigate/                  # FortiGate v1.1 commands, parser, rules, checklist
```

---

## 5. Development & Verification Commands

### Shell & Environment Conventions
- **Windows Shell**: When executing shell commands on Windows, wrap `npm` and `npx` calls with `cmd /c` (e.g. `cmd /c npm run build`, `cmd /c npx vitest run`) to avoid PowerShell execution policy blocks.
- **Never CD**: Execute commands specifying working directory (`Cwd`), never change directories.

### Testing
```bash
# Run all unit and integration tests (23 suites, 123 tests)
cmd /c npx vitest run

# Run a specific test suite
cmd /c npx vitest run tests/unit/docx-editor.test.ts
cmd /c npx vitest run tests/integration/report-export-api.test.ts
```
> [!NOTE]
> Vitest is configured with `singleFork: true` in `vitest.config.ts`. This ensures sequential test execution across SQLite files without encountering database write lock timeouts.

### Building & Type Checking
```bash
# Verify TypeScript strict compilation and Next.js static page generation
cmd /c npm run build
```

---

## 6. How to Extend: Adding a New Firewall Vendor (e.g. Palo Alto)

To introduce a new firewall vendor without modifying core document or review engines:

1. **Create Adapter Directory**: `src/vendors/paloalto/`
2. **Define Approved Commands**: `commands.ts`
   - Implement read-only CLI commands (e.g., `show system info`, `show system resources`, `show high-availability all`).
3. **Define Parser**: `parser.ts`
   - Implement `VendorParser` to recognize PAN-OS prompt formats and extract structured metrics.
4. **Define Rules**: `rules.ts`
   - Implement deterministic thresholds (CPU < 80%, Memory < 80%, HA sync state, license validity).
5. **Define Checklist**: `checklist.ts`
   - Map each PM check to target sections and appendix names.
6. **Register Adapter**:
   - Register the new adapter in `src/vendors/registry.ts`.
7. **Write Contract Tests**:
   - Add unit tests verifying compliance against `VendorAdapterContract` in `tests/unit/vendor-adapter-contract.test.ts`.

---

## 7. Frontend Design & Accessibility Rules

- **Palette**: Solid deep-dark obsidian theme (`#030712` canvas, `#070b14` and `#0c1222` card surfaces).
- **Contrast**: Headings must use `text-white` or `text-slate-100`. Descriptions and secondary labels must use high-contrast `text-slate-200` or `text-slate-300`, never washed-out low-contrast greys.
- **Badges**: Use rich dark background tints with saturated text (e.g. `bg-emerald-950/80 text-emerald-300 border-emerald-500/40`).
- **Typography**: Uses Google `Geist` font family with high readability and legible tabular numbers for telemetry figures.
