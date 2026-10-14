-- D77: additive CMS metadata. Existing Homepage.blocks remains published;
-- new private drafts explicitly set isPublished=false. No retained-data backfill.
ALTER TABLE "Homepage"
  ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "draftBlocks" JSONB,
  ADD COLUMN "draftRevisionId" TEXT,
  ADD COLUMN "publishedRevisionId" TEXT,
  ADD COLUMN "scheduledRevisionId" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "scheduledById" TEXT,
  ADD COLUMN "scheduledVersion" INTEGER,
  ADD COLUMN "scheduleError" TEXT;
ALTER TABLE "Homepage" ADD CONSTRAINT "Homepage_version_nonnegative" CHECK ("version" >= 0);
-- Snapshots use existing append-only AuditLog rows, not a parallel revision store.
