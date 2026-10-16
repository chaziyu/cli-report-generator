-- CreateTable
CREATE TABLE "PMSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT 'fortigate',
    "engineerName" TEXT,
    "pmDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "model" TEXT,
    "serialNumber" TEXT,
    "firmwareVersion" TEXT,
    "managementIp" TEXT,
    "role" TEXT,
    "haStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PMSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PMSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommandExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "commandGroup" TEXT,
    "rawOutputRef" TEXT,
    "outputContent" TEXT,
    "parseStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "parseError" TEXT,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommandExecution_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "sectionName" TEXT,
    "targetAppendix" TEXT,
    "collectionState" TEXT NOT NULL DEFAULT 'MISSING',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentValue" TEXT,
    "expectedValue" TEXT,
    "remarks" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChecklistResult_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commandExecutionId" TEXT,
    "deviceId" TEXT,
    "title" TEXT NOT NULL,
    "appendixMapping" TEXT,
    "imageReference" TEXT NOT NULL,
    "caption" TEXT,
    "isRedacted" BOOLEAN NOT NULL DEFAULT false,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "totalPages" INTEGER NOT NULL DEFAULT 1,
    "sourceLabel" TEXT NOT NULL DEFAULT 'Rendered from PuTTY session log',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_commandExecutionId_fkey" FOREIGN KEY ("commandExecutionId") REFERENCES "CommandExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistResultId" TEXT NOT NULL,
    "proposedStatus" TEXT,
    "proposedRemarks" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "finalStatus" TEXT,
    "finalRemarks" TEXT,
    "reviewer" TEXT NOT NULL,
    "reviewNotes" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewDecision_checklistResultId_fkey" FOREIGN KEY ("checklistResultId") REFERENCES "ChecklistResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "originalReportId" TEXT,
    "fileReference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PMSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PMSession_customer_idx" ON "PMSession"("customer");

-- CreateIndex
CREATE INDEX "PMSession_status_idx" ON "PMSession"("status");

-- CreateIndex
CREATE INDEX "Device_sessionId_idx" ON "Device"("sessionId");

-- CreateIndex
CREATE INDEX "Device_hostname_idx" ON "Device"("hostname");

-- CreateIndex
CREATE INDEX "UploadedFile_sessionId_idx" ON "UploadedFile"("sessionId");

-- CreateIndex
CREATE INDEX "UploadedFile_hashSha256_idx" ON "UploadedFile"("hashSha256");

-- CreateIndex
CREATE INDEX "CommandExecution_deviceId_idx" ON "CommandExecution"("deviceId");

-- CreateIndex
CREATE INDEX "CommandExecution_command_idx" ON "CommandExecution"("command");

-- CreateIndex
CREATE INDEX "ChecklistResult_deviceId_idx" ON "ChecklistResult"("deviceId");

-- CreateIndex
CREATE INDEX "ChecklistResult_status_idx" ON "ChecklistResult"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistResult_deviceId_checkId_key" ON "ChecklistResult"("deviceId", "checkId");

-- CreateIndex
CREATE INDEX "Evidence_commandExecutionId_idx" ON "Evidence"("commandExecutionId");

-- CreateIndex
CREATE INDEX "ReviewDecision_checklistResultId_idx" ON "ReviewDecision"("checklistResultId");

-- CreateIndex
CREATE INDEX "GeneratedReport_sessionId_idx" ON "GeneratedReport"("sessionId");
