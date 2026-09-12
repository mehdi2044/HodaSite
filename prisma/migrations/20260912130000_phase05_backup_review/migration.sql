ALTER TABLE "BackupSettings" ADD COLUMN "minuteUtc" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "BackupSettings" ADD CONSTRAINT "BackupSettings_minuteUtc_check" CHECK ("minuteUtc" BETWEEN 0 AND 59);
ALTER TABLE "Backup" ADD COLUMN "localPrunedAt" TIMESTAMPTZ(3);
UPDATE "Backup" SET "localPrunedAt" = "updatedAt", status = 'DONE', error = NULL WHERE error = 'RETENTION_PRUNED';
