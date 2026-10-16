-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commandExecutionId" TEXT,
    "uploadedFileId" TEXT,
    "deviceId" TEXT,
    "checkId" TEXT,
    "title" TEXT NOT NULL,
    "appendixMapping" TEXT,
    "imageReference" TEXT NOT NULL,
    "caption" TEXT,
    "isRedacted" BOOLEAN NOT NULL DEFAULT false,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "totalPages" INTEGER NOT NULL DEFAULT 1,
    "sourceLabel" TEXT NOT NULL DEFAULT 'Rendered from PuTTY session log',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_commandExecutionId_fkey" FOREIGN KEY ("commandExecutionId") REFERENCES "CommandExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evidence_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Evidence" ("appendixMapping", "caption", "commandExecutionId", "createdAt", "deviceId", "id", "imageReference", "isRedacted", "pageNumber", "sourceLabel", "title", "totalPages") SELECT "appendixMapping", "caption", "commandExecutionId", "createdAt", "deviceId", "id", "imageReference", "isRedacted", "pageNumber", "sourceLabel", "title", "totalPages" FROM "Evidence";
DROP TABLE "Evidence";
ALTER TABLE "new_Evidence" RENAME TO "Evidence";
CREATE INDEX "Evidence_commandExecutionId_idx" ON "Evidence"("commandExecutionId");
CREATE INDEX "Evidence_uploadedFileId_idx" ON "Evidence"("uploadedFileId");
CREATE INDEX "Evidence_checkId_idx" ON "Evidence"("checkId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
