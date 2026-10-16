-- AlterTable
ALTER TABLE "ChecklistResult" ADD COLUMN "evidenceFingerprint" TEXT;

-- AlterTable
ALTER TABLE "CommandExecution" ADD COLUMN "segmentIndex" INTEGER;
ALTER TABLE "CommandExecution" ADD COLUMN "sourceFileId" TEXT;

-- AlterTable
ALTER TABLE "PMSession" ADD COLUMN "processingLeaseExpiresAt" DATETIME;
ALTER TABLE "PMSession" ADD COLUMN "processingRunId" TEXT;

-- AlterTable
ALTER TABLE "ReviewDecision" ADD COLUMN "evidenceFingerprint" TEXT;

-- CreateIndex
CREATE INDEX "CommandExecution_sourceFileId_idx" ON "CommandExecution"("sourceFileId");
