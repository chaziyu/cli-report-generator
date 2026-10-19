# CTC Firewall PM Operations

## Supported guides

| Vendor | Checklist tasks | Word report export |
|---|---:|---|
| Fortinet FortiGate | 21 | Existing QMS-P09-F01 v1.1 layout |
| Palo Alto PAN-OS | 16 | Unavailable until an approved CTC layout is verified |
| Juniper SRX Junos | 16 | Unavailable until an approved CTC layout is verified |
| Check Point Gaia | 24 | Unavailable until an approved CTC layout is verified |

See [PM-GUIDE-COVERAGE.md](./PM-GUIDE-COVERAGE.md) for the task-by-task command, evidence, source-row, and evaluation matrix.

## Engineer workflow

1. Create or open a PM session and select the firewall vendor before collecting evidence.
2. Confirm each device and its standalone, HA, cluster, or VSX applicability. Resolve ambiguous log-to-device mappings explicitly.
3. Follow the displayed guide task by task. Copy and run each CLI command separately in the engineer's authorized SSH/PuTTY session. The tool does not connect to or change firewall devices.
4. Check each command's execution-context notes. Check Point commands marked for context verification require confirming the target Gaia version and CLI mode. Palo Alto's connectivity ping generates network traffic and requires customer authorization.
5. Upload PuTTY logs and task-mapped GUI screenshots. Complete manual backup, access, license, lifecycle, and topology checks with the requested evidence.
6. Review the captured output, parsed values, node coverage, evidence mapping, and current findings. Missing required evidence needs an explicit exception justification before approval. Record an approval, modification, rejection, or justified exception for each applicable item.
7. Download a Word report only when the selected vendor has a verified report layout. The three supplied non-FortiGate files are maintenance guides, not confirmed CTC report templates, so export remains disabled for those vendors.

## Evaluation limits

- Palo Alto automatically evaluates CPU below 80%, memory below 90%, and disk below 90% only when the required output is parsed reliably. CPU requires both guide commands.
- Check Point automatically evaluates memory below 80% only when the required Gaia CLI context is confirmed. The guide supplies no CPU or disk limit.
- Juniper CPU, memory, and storage thresholds are not specified by the supplied guide; the engineer reviews the node-specific evidence.
- Firmware lifecycle, GUI access, backup success, HA/cluster/VSX health, alarms, licenses, and event content require the evidence and review described in the task matrix. Command output alone does not approve them.
- The supplied DOCX files expose checklist table rows but not stable page numbers. The coverage matrix records table rows and omits page references.

## Release acceptance checklist

- [ ] A CTC engineer completes a realistic session for each supported vendor and confirms all guide tasks and topology-specific evidence.
- [ ] Engineers confirm command syntax and execution context against the supported customer device versions.
- [ ] Palo Alto, Juniper SRX, and Check Point approved CTC report layouts are supplied and visually verified in Microsoft Word before enabling their Word export.
- [ ] Any CTC policy thresholds not present in the guides are approved and recorded before deterministic rules are added.
- [ ] The regression suite, type check, lint, Prisma validation, and production build pass for the release candidate.

Automated checks do not replace live CTC engineer acceptance or Microsoft Word inspection of an approved vendor template.
