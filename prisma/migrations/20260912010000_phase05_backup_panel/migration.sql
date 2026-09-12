-- CreateTable
CREATE TABLE "OpsTask" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "authorizedAt" TIMESTAMPTZ(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "log" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OpsTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "expectedBytes" BIGINT NOT NULL,
    "receivedBytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BackupUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "hourUtc" INTEGER NOT NULL DEFAULT 3,
    "includeMedia" BOOLEAN NOT NULL DEFAULT true,
    "keepDaily" INTEGER NOT NULL DEFAULT 7,
    "keepWeekly" INTEGER NOT NULL DEFAULT 4,
    "keepMonthly" INTEGER NOT NULL DEFAULT 6,
    "verifyWeekday" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BackupSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpsTask_requestKey_key" ON "OpsTask"("requestKey");

-- CreateIndex
CREATE INDEX "OpsTask_status_createdAt_idx" ON "OpsTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BackupUpload_ownerId_status_idx" ON "BackupUpload"("ownerId", "status");


ALTER TABLE "OpsTask" ADD CONSTRAINT "OpsTask_type_check" CHECK ("type" IN ('BACKUP','VERIFY','EXPORT','RESTORE','VALIDATE_UPLOAD'));
ALTER TABLE "OpsTask" ADD CONSTRAINT "OpsTask_status_check" CHECK ("status" IN ('PENDING','RUNNING','DONE','FAILED'));
ALTER TABLE "OpsTask" ADD CONSTRAINT "OpsTask_restore_auth_check" CHECK ("type" <> 'RESTORE' OR ("requestedBy" IS NOT NULL AND "authorizedAt" IS NOT NULL));
ALTER TABLE "BackupUpload" ADD CONSTRAINT "BackupUpload_size_check" CHECK ("expectedBytes" > 0 AND "receivedBytes" >= 0 AND "receivedBytes" <= "expectedBytes");
ALTER TABLE "BackupSettings" ADD CONSTRAINT "BackupSettings_values_check" CHECK ("hourUtc" BETWEEN 0 AND 23 AND "verifyWeekday" BETWEEN 0 AND 6 AND "keepDaily" BETWEEN 1 AND 365 AND "keepWeekly" BETWEEN 0 AND 104 AND "keepMonthly" BETWEEN 0 AND 120);
