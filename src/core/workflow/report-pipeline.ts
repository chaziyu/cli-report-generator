import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { logNormalizer, commandSegmenter, deviceMapper, persistCommandSegments } from "@/core/cli";
import { docxInspector } from "@/core/document";
import { ruleEngine } from "@/core/checks";
import { evidenceRenderer } from "@/core/evidence";
import { reviewService } from "@/core/review";
import { vendorRegistry, VendorId } from "@/vendors";
import { pipelineLock, PipelineLockError } from "./pipeline-lock";
import {
  PipelineMode,
  PipelineProcessOptions,
  PipelineProcessResult,
  PipelineStageResult,
  PipelineSummary,
  AmbiguousLogInfo,
} from "./pipeline-types";

export class ReportPipeline {
  /**
   * Computes a deterministic evidence fingerprint to track whether the underlying
   * evidence for a finding has changed between processing runs.
   * Includes device identity, rule version, status, collection completeness,
   * source evidence references, and normalized content excerpt.
   */
  computeFingerprint(params: {
    deviceId: string;
    checkId: string;
    ruleVersion: string;
    currentValue: string | null;
    status: string;
    collectionState: string;
    sourceEvidenceIds?: string[];
    sourceExecutionHashes?: string[];
    rawOutputExcerpt: string;
  }): string {
    const rawNormalized = params.rawOutputExcerpt
      .replace(/\r\n/g, "\n")
      .trim()
      .slice(0, 1000);

    const sourceRefs = (params.sourceEvidenceIds || []).slice().sort().join(",");
    const sourceHashes = (params.sourceExecutionHashes || []).slice().sort().join(",");

    const payload = [
      params.deviceId,
      params.checkId,
      params.ruleVersion,
      params.currentValue || "",
      params.status,
      params.collectionState,
      sourceRefs,
      sourceHashes,
      rawNormalized,
    ].join("|");

    return createHash("sha256").update(payload).digest("hex");
  }

  /**
   * Executes the automated PM processing pipeline.
   */
  async processSession(
    sessionId: string,
    options: PipelineProcessOptions = {}
  ): Promise<PipelineProcessResult> {
    // 1. Acquire crash-recoverable lease
    const runId = await pipelineLock.acquireLease(sessionId);

    const stages: PipelineStageResult[] = [];
    const ambiguousLogs: AmbiguousLogInfo[] = [];

    const summary: PipelineSummary = {
      devicesEvaluated: 0,
      logsProcessed: 0,
      commandsSegmented: 0,
      rulesTotal: 0,
      rulesPassed: 0,
      rulesWarning: 0,
      rulesFailed: 0,
      rulesMissing: 0,
      reReviewRequiredCount: 0,
      cliEvidencePages: 0,
      guiScreenshotsActive: 0,
    };

    try {
      // 2. Fetch session and staged files
      const session = await prisma.pMSession.findUnique({
        where: { id: sessionId },
        include: {
          devices: true,
          uploadedFiles: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!session) {
        throw new Error(`PM session "${sessionId}" not found.`);
      }

      const files = session.uploadedFiles;
      const docxFile = files.find((f) => f.type === "WORD_REPORT");
      const logFiles = files.filter((f) => f.type === "PUTTY_LOG");
      const guiFiles = files.filter((f) => f.type === "GUI_SCREENSHOT");

      // Determine pipeline mode
      let mode: PipelineMode = "FULL";
      if (!docxFile && logFiles.length > 0) mode = "CLI_ONLY";
      else if (docxFile && logFiles.length === 0) mode = "TEMPLATE_ONLY";
      else if (!docxFile && logFiles.length === 0 && guiFiles.length > 0)
        mode = "STAGING_ONLY";
      else if (!docxFile && logFiles.length === 0 && guiFiles.length === 0) {
        throw new Error(
          "No files uploaded for processing. Please upload at least one PuTTY log or Word report."
        );
      }

      const adapter = vendorRegistry.get(session.vendor as VendorId);
      if (!adapter) {
        throw new Error(`Vendor adapter "${session.vendor}" not found.`);
      }

      // =========================================================================
      // Stage 1: Document Inspection & Device Reconciliation (if DOCX present)
      // =========================================================================
      let docxInspection: any = null;
      if (docxFile) {
        try {
          const fileBuffer = await storage.getFile(docxFile.storagePath);
          docxInspection = await docxInspector.inspectDocument(fileBuffer);

          // Reconcile devices from Word metadata if none registered
          if (session.devices.length === 0 && docxInspection.metadata.hostname) {
            await prisma.device.create({
              data: {
                sessionId,
                hostname: docxInspection.metadata.hostname,
                model: docxInspection.metadata.model || null,
                serialNumber: docxInspection.metadata.serialNumber || null,
                role: "Primary",
              },
            });
          } else if (
            session.devices.length > 0 &&
            (docxInspection.metadata.model || docxInspection.metadata.serialNumber)
          ) {
            const dev = session.devices[0];
            if (!dev.serialNumber && docxInspection.metadata.serialNumber) {
              await prisma.device.update({
                where: { id: dev.id },
                data: {
                  serialNumber: docxInspection.metadata.serialNumber,
                  model: dev.model || docxInspection.metadata.model,
                },
              });
            }
          }

          // Update customer if still draft default
          if (
            (session.customer === "Draft PM Session" ||
              session.customer === "Untitled PM Session") &&
            docxInspection.metadata.customerName
          ) {
            await prisma.pMSession.update({
              where: { id: sessionId },
              data: { customer: docxInspection.metadata.customerName },
            });
          }

          stages.push({
            stage: "DOCX_INSPECTION",
            status: "COMPLETED",
            message: `Document inspected: verified QMS structure (${docxInspection.metadata.customerName || "Customer detected"}).`,
          });
        } catch (err) {
          stages.push({
            stage: "DOCX_INSPECTION",
            status: "WARNING",
            message: `Document inspection warning: ${err instanceof Error ? err.message : "Unable to parse Word tables."}`,
          });
        }
      } else {
        stages.push({
          stage: "DOCX_INSPECTION",
          status: "SKIPPED",
          message: "No Word report uploaded (CLI preview mode active).",
        });
      }

      // Refresh devices list after Stage 1
      const currentDevices = await prisma.device.findMany({
        where: { sessionId },
      });

      // =========================================================================
      // Stage 2: PuTTY Log Parsing & Command Segmentation (preserving observations)
      // =========================================================================
      const parsedLogFileIds: string[] = [];
      const confirmationMap = new Map(
        (options.deviceConfirmations || []).map((c) => [c.fileId, c.deviceId])
      );

      for (const logFile of logFiles) {
        try {
          const fileBuffer = await storage.getFile(logFile.storagePath);

          // Validate source SHA-256 before processing
          const calculatedHash = storage.calculateSha256(fileBuffer);
          if (calculatedHash !== logFile.hashSha256) {
            console.error(
              `Log file ${logFile.originalFilename} integrity check failed: SHA-256 mismatch against recorded hash.`
            );
            continue;
          }

          const normalizedLog = logNormalizer.normalize(fileBuffer);
          const segmentedLog = commandSegmenter.segment(normalizedLog, adapter);

          // Map log to device
          let resolvedDeviceId = confirmationMap.get(logFile.id);

          // Reject cross-session device confirmations
          if (resolvedDeviceId && !currentDevices.some((d) => d.id === resolvedDeviceId)) {
            console.warn(
              `Device confirmation "${resolvedDeviceId}" does not belong to session "${sessionId}". Rejecting.`
            );
            resolvedDeviceId = undefined;
          }

          if (!resolvedDeviceId) {
            const mappingResult = deviceMapper.mapLogToDevice(
              segmentedLog.detectedHostname,
              currentDevices.map((d) => ({
                id: d.id,
                hostname: d.hostname,
                model: d.model,
                role: d.role,
              }))
            );

            if (
              !mappingResult.requiresConfirmation &&
              mappingResult.matchedDeviceId
            ) {
              resolvedDeviceId = mappingResult.matchedDeviceId;
            } else if (
              currentDevices.length === 0 &&
              segmentedLog.detectedHostname
            ) {
              // Create provisional device from detected prompt hostname
              const newDev = await prisma.device.create({
                data: {
                  sessionId,
                  hostname: segmentedLog.detectedHostname,
                  role: "Primary",
                },
              });
              resolvedDeviceId = newDev.id;
              currentDevices.push(newDev);
            } else {
              // Log is ambiguous: quarantine commands and flag for user confirmation
              ambiguousLogs.push({
                fileId: logFile.id,
                filename: logFile.originalFilename,
                detectedHostname: segmentedLog.detectedHostname,
                candidates: currentDevices.map((d) => ({
                  deviceId: d.id,
                  hostname: d.hostname,
                  role: d.role,
                })),
              });
              continue; // do not assign to an arbitrary device
            }
          }

          // Idempotently persist command executions and reconcile obsolete segments
          const persistResult = await persistCommandSegments({
            sessionId,
            deviceId: resolvedDeviceId,
            sourceFileId: logFile.id,
            segments: segmentedLog.segments,
            adapter,
          });

          summary.commandsSegmented += persistResult.savedCount;
          summary.logsProcessed++;
          parsedLogFileIds.push(logFile.id);
        } catch (err) {
          console.error(`Error parsing log file ${logFile.originalFilename}:`, err);
        }
      }

      if (logFiles.length > 0) {
        stages.push({
          stage: "LOG_PARSING",
          status: ambiguousLogs.length > 0 ? "WARNING" : "COMPLETED",
          message:
            ambiguousLogs.length > 0
              ? `Parsed ${summary.logsProcessed} of ${logFiles.length} logs. ${ambiguousLogs.length} log(s) require device confirmation.`
              : `Successfully parsed ${summary.logsProcessed} log file(s) (${summary.commandsSegmented} command observations).`,
          itemsProcessed: summary.commandsSegmented,
        });
      } else {
        stages.push({
          stage: "LOG_PARSING",
          status: "SKIPPED",
          message: "No PuTTY session logs provided.",
        });
      }

      // =========================================================================
      // Stage 3: Deterministic Rule Evaluation & Fingerprint Comparison
      // =========================================================================
      const devicesToEvaluate = await prisma.device.findMany({
        where: { sessionId },
        include: {
          commandExecutions: {
            orderBy: [{ segmentIndex: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      const checklistDefinitions = adapter.getChecklistDefinition();
      summary.rulesTotal = checklistDefinitions.length * devicesToEvaluate.length;

      for (const device of devicesToEvaluate) {
        summary.devicesEvaluated++;

        // Run deterministic rule evaluation preserving all command observations
        const evaluationSummary = ruleEngine.evaluateDeviceChecks({
          deviceId: device.id,
          vendorId: session.vendor as VendorId,
          checklistDefinitions,
          commandExecutions: device.commandExecutions.map((e) => ({
            id: e.id,
            command: e.command,
            deviceId: e.deviceId,
            commandGroup: e.commandGroup,
            outputContent: e.outputContent,
            parseStatus: e.parseStatus,
            rawOutputRef: e.rawOutputRef,
          })),
        });

        // Upsert checklist results and check evidence fingerprints
        for (const finding of evaluationSummary.results) {
          const def = checklistDefinitions.find((d) => d.id === finding.checkId);
          const currentValue =
            (finding.extractedValues?.currentValue as string) || null;
          const expectedValue =
            (finding.extractedValues?.expectedValue as string) ||
            def?.thresholdDescription ||
            null;
          const rawExcerpt = currentValue || finding.remarks || "";
          const matchingExecutions = device.commandExecutions.filter(
            (e) =>
              finding.evidenceRefs?.includes(e.id) ||
              (def?.commands && ((e as any).commandId ? def.commands.includes((e as any).commandId) : def.commands.includes(e.command)))
          );
          const sourceExecutionHashes = matchingExecutions.map((e) =>
            createHash("sha256").update(e.outputContent || "").digest("hex")
          );

          const newFingerprint = this.computeFingerprint({
            deviceId: device.id,
            checkId: finding.checkId,
            ruleVersion: "v1.1",
            currentValue,
            status: finding.evaluationStatus,
            collectionState: finding.collectionState,
            sourceEvidenceIds: finding.evidenceRefs,
            sourceExecutionHashes,
            rawOutputExcerpt: rawExcerpt,
          });

          // Check prior checklist result
          const existingResult = await prisma.checklistResult.findUnique({
            where: {
              deviceId_checkId: {
                deviceId: device.id,
                checkId: finding.checkId,
              },
            },
            include: {
              reviewDecisions: {
                orderBy: { decidedAt: "desc" },
              },
            },
          });

          let reviewRequired = finding.reviewRequired;
          const priorApprovedDecision = existingResult?.reviewDecisions.find(
            (d) => d.decision === "APPROVED" || d.decision === "MODIFIED"
          );

          if (priorApprovedDecision && existingResult) {
            if (
              existingResult.evidenceFingerprint &&
              existingResult.evidenceFingerprint !== newFingerprint
            ) {
              // Evidence changed: Mark prior decision SUPERSEDED and flag for re-review
              await prisma.reviewDecision.update({
                where: { id: priorApprovedDecision.id },
                data: { decision: "SUPERSEDED" },
              });

              await prisma.reviewDecision.create({
                data: {
                  checklistResultId: existingResult.id,
                  decision: "PENDING",
                  proposedStatus: finding.evaluationStatus,
                  proposedRemarks: finding.remarks,
                  evidenceFingerprint: newFingerprint,
                  reviewer: "System",
                  reviewNotes: `Evidence changed between runs. Prior approval superseded.`,
                },
              });

              reviewRequired = true;
              summary.reReviewRequiredCount++;
            } else {
              // Evidence unchanged: retain approved decision
              reviewRequired = false;
            }
          }

          await prisma.checklistResult.upsert({
            where: {
              deviceId_checkId: {
                deviceId: device.id,
                checkId: finding.checkId,
              },
            },
            update: {
              checkName: def?.taskName || finding.checkId,
              sectionName: def?.targetSection || null,
              targetAppendix: def?.targetAppendix || null,
              status: finding.evaluationStatus,
              currentValue,
              expectedValue,
              remarks: finding.remarks,
              collectionState: finding.collectionState,
              evidenceFingerprint: newFingerprint,
              reviewRequired,
            },
            create: {
              deviceId: device.id,
              checkId: finding.checkId,
              checkName: def?.taskName || finding.checkId,
              sectionName: def?.targetSection || null,
              targetAppendix: def?.targetAppendix || null,
              collectionState: finding.collectionState,
              status: finding.evaluationStatus,
              currentValue,
              expectedValue,
              remarks: finding.remarks,
              evidenceFingerprint: newFingerprint,
              reviewRequired,
            },
          });

          if (finding.evaluationStatus === "PASS") summary.rulesPassed++;
          else if (finding.evaluationStatus === "WARNING") summary.rulesWarning++;
          else if (finding.evaluationStatus === "FAIL") summary.rulesFailed++;
          else if (finding.collectionState === "MISSING") summary.rulesMissing++;
        }
      }

      stages.push({
        stage: "RULE_EVALUATION",
        status: "COMPLETED",
        message: `Evaluated ${checklistDefinitions.length} checklist rules across ${devicesToEvaluate.length} device(s). ${summary.rulesPassed} Passed, ${summary.rulesWarning} Warning, ${summary.rulesFailed} Failed, ${summary.rulesMissing} Missing.`,
        itemsProcessed: summary.rulesPassed + summary.rulesWarning + summary.rulesFailed,
      });

      // =========================================================================
      // Stage 4: Atomic Two-Phase Terminal Evidence Rendering
      // =========================================================================
      let generatedEvidenceCount = 0;
      const stagedFilesToPromote: Array<{
        stagedPath: string;
        finalPath: string;
        evidenceData: any;
        checkIds: (string | null)[];
      }> = [];
      const obsoleteEvidenceIdsToDelete: string[] = [];
      const obsoleteStoragePathsToDelete: string[] = [];
      const temporaryStagedPaths: string[] = [];

      try {
        const adapterCommands = adapter.getCommands();

        for (const device of devicesToEvaluate) {
          const executionsWithOutput = device.commandExecutions.filter(
            (e) => e.outputContent && e.outputContent.trim().length > 0
          );

          for (const exec of executionsWithOutput) {
            const cleanCmd = exec.command.trim().toLowerCase();
            const cmdDef = adapterCommands.find(
              (c) =>
                c.command.toLowerCase() === cleanCmd ||
                c.expectedOutputs.some((exp) => cleanCmd.startsWith(exp.toLowerCase()))
            );
            const mappedCheckIds = cmdDef?.guideSource
              ? Array.from(new Set(cmdDef.mappedCheckIds || []))
              : [];

            const currentExecutionHash = createHash("sha256")
              .update(exec.outputContent || "")
              .digest("hex");

            // Check if existing valid evidence already exists for this execution with matching content
            const priorEvidence = await prisma.evidence.findMany({
              where: { commandExecutionId: exec.id, isExcluded: false },
            });

            let hasValidExistingFiles =
              priorEvidence.length > 0 &&
              priorEvidence.every((pe) => pe.sourceHash === currentExecutionHash) &&
              (mappedCheckIds.length === 0 || mappedCheckIds.every((checkId) => priorEvidence.some((evidence) => evidence.checkId === checkId)));
            if (hasValidExistingFiles) {
              for (const pe of priorEvidence) {
                const fExists = await storage.fileExists(pe.imageReference);
                if (!fExists) {
                  hasValidExistingFiles = false;
                  break;
                }
              }
            }

            if (hasValidExistingFiles) {
              // Evidence is already up-to-date for this unchanged execution
              generatedEvidenceCount += new Set(priorEvidence.map((evidence) => evidence.pageNumber)).size;
              continue;
            }

            // Otherwise, render new evidence pages for this execution
            const title = cmdDef?.description || cmdDef?.command || exec.command;
            const appendixMapping =
              cmdDef?.targetAppendix || (cmdDef?.guideSource ? "Terminal evidence" : "Appendix - Terminal Evidence");
            const evidenceCheckIds = mappedCheckIds.length > 0 ? mappedCheckIds : [null];

            // Mark prior evidence for this specific execution to be retired upon promotion
            for (const pe of priorEvidence) {
              obsoleteEvidenceIdsToDelete.push(pe.id);
              obsoleteStoragePathsToDelete.push(pe.imageReference);
            }

            // Render terminal pages
            const pages = await evidenceRenderer.renderEvidencePages({
              title,
              command: exec.command,
              rawOutput: exec.outputContent!,
              deviceHostname: device.hostname,
              appendixMapping,
              redactSecrets: true,
            });

            // 1. Render new files to staging
            for (const page of pages) {
              const stagedFilename = `staged_${runId}_${page.fileName}`;
              const storedStaged = await storage.saveFile(
                sessionId,
                "evidence",
                stagedFilename,
                page.pngBuffer,
                "image/png"
              );
              temporaryStagedPaths.push(storedStaged.storagePath);

              // 2. Validate staged file exists
              const valid = await storage.fileExists(storedStaged.storagePath);
              if (!valid) {
                throw new Error(
                  `Staged evidence validation failed: ${storedStaged.storagePath} not found.`
                );
              }

              // Final promoted file path
              const finalFilename = `cli_${device.hostname}_${exec.id}_${runId}_p${page.pageNumber}.png`.replace(
                /[^a-zA-Z0-9_.-]/g,
                "_"
              );
              const storedFinal = await storage.saveFile(
                sessionId,
                "evidence",
                finalFilename,
                page.pngBuffer,
                "image/png"
              );

              stagedFilesToPromote.push({
                stagedPath: storedStaged.storagePath,
                finalPath: storedFinal.storagePath,
                evidenceData: {
                  commandExecutionId: exec.id,
                  deviceId: device.id,
                  title,
                  appendixMapping,
                  imageReference: storedFinal.storagePath,
                  caption: `${appendixMapping}: ${title} (${device.hostname}) - Page ${page.pageNumber} of ${page.totalPages}`,
                  isRedacted: page.redactionsApplied > 0,
                  pageNumber: page.pageNumber,
                  totalPages: page.totalPages,
                  sourceLabel: "Rendered from PuTTY session log",
                  sourceHash: currentExecutionHash,
                  isExcluded: false,
                },
                checkIds: evidenceCheckIds,
              });
            }
          }
        }

        // 3. Verify worker still holds active lease before database transaction
        const hasLease = await pipelineLock.verifyLease(sessionId, runId);
        if (!hasLease) {
          throw new PipelineLockError(
            `Worker lost lease for session ${sessionId}. Aborting promotion.`,
            runId
          );
        }

        // 4. In one SQLite transaction: activate replacement evidence and retire previous evidence
        await prisma.$transaction(async (tx) => {
          // Double check lease inside transaction
          const currentSession = await tx.pMSession.findUnique({
            where: { id: sessionId },
            select: { processingRunId: true },
          });
          if (currentSession?.processingRunId !== runId) {
            throw new PipelineLockError(
              `Worker lease expired or taken over during promotion.`,
              runId
            );
          }

          if (obsoleteEvidenceIdsToDelete.length > 0) {
            await tx.evidence.deleteMany({
              where: { id: { in: obsoleteEvidenceIdsToDelete } },
            });
          }

          for (const item of stagedFilesToPromote) {
            for (const checkId of item.checkIds) {
              await tx.evidence.create({
                data: { ...item.evidenceData, checkId },
              });
            }
            generatedEvidenceCount++;
          }
        });

        // 5. Clean up obsolete storage files ONLY after the database transaction succeeds
        for (const oldPath of obsoleteStoragePathsToDelete) {
          try {
            await storage.deleteFile(oldPath);
          } catch {
            // non-blocking cleanup
          }
        }
        for (const stagedPath of temporaryStagedPaths) {
          try {
            await storage.deleteFile(stagedPath);
          } catch {
            // non-blocking cleanup
          }
        }

        summary.cliEvidencePages = generatedEvidenceCount;
        stages.push({
          stage: "EVIDENCE_RENDERING",
          status: "COMPLETED",
          message: `Rendered and atomically promoted terminal screenshots (${generatedEvidenceCount} page(s)).`,
          itemsProcessed: generatedEvidenceCount,
        });
      } catch (renderErr) {
        // Rollback / failure: preserve old evidence; clean up temporary staged and promoted files
        for (const item of stagedFilesToPromote) {
          try {
            await storage.deleteFile(item.finalPath);
          } catch {
            // ignore
          }
        }
        for (const stagedPath of temporaryStagedPaths) {
          try {
            await storage.deleteFile(stagedPath);
          } catch {
            // ignore
          }
        }
        stages.push({
          stage: "EVIDENCE_RENDERING",
          status: "WARNING",
          message: `Evidence rendering warning: ${renderErr instanceof Error ? renderErr.message : "Partial failure"}. Existing evidence preserved.`,
        });
      }

      // =========================================================================
      // Stage 5: Manual GUI Screenshot Alignment
      // =========================================================================
      const activeGuiEvidences = await prisma.evidence.findMany({
        where: {
          commandExecutionId: null,
          isExcluded: false,
          uploadedFile: {
            sessionId,
            type: "GUI_SCREENSHOT",
          },
        },
      });
      summary.guiScreenshotsActive = activeGuiEvidences.length;

      stages.push({
        stage: "GUI_MAPPING",
        status: "COMPLETED",
        message: `${activeGuiEvidences.length} manual GUI screenshot(s) active in report.`,
        itemsProcessed: activeGuiEvidences.length,
      });

      // =========================================================================
      // Stage 6: Review Preparation
      // =========================================================================
      await prisma.pMSession.update({
        where: { id: sessionId },
        data: { status: "READY_FOR_REVIEW" },
      });

      stages.push({
        stage: "REVIEW_PREPARATION",
        status: "COMPLETED",
        message: "PM findings compiled and ready for engineer review.",
      });

      return {
        sessionId,
        mode,
        status: ambiguousLogs.length > 0 ? "PARTIAL" : "READY_FOR_REVIEW",
        summary,
        stages,
        ambiguousLogs,
      };
    } finally {
      // Always release lease
      await pipelineLock.releaseLease(sessionId, runId);
    }
  }
}

export const reportPipeline = new ReportPipeline();
