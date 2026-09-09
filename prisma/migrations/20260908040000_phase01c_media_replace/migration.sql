-- Phase 01c: atomic media replacement (additive only).
CREATE TABLE "MediaReplacement" (
  "id" TEXT NOT NULL, "mediaId" TEXT NOT NULL,
  "baseStorageKey" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "url" TEXT NOT NULL, "originalName" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL, "mime" TEXT NOT NULL,
  "width" INTEGER, "height" INTEGER, "variants" JSONB NOT NULL DEFAULT '{}',
  "blurDataUrl" TEXT, "dominantColor" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "error" TEXT,
  "oldStorageKey" TEXT, "oldVariants" JSONB, "requestedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaReplacement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaReplacement_mediaId_fkey" FOREIGN KEY ("mediaId")
    REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MediaReplacement_storageKey_key" ON "MediaReplacement"("storageKey");
CREATE INDEX "MediaReplacement_mediaId_createdAt_idx" ON "MediaReplacement"("mediaId", "createdAt");
CREATE INDEX "MediaReplacement_status_idx" ON "MediaReplacement"("status");
CREATE UNIQUE INDEX "MediaReplacement_one_active_per_media" ON "MediaReplacement"("mediaId")
  WHERE "status" IN ('PENDING', 'PROCESSING', 'SWAPPED', 'CLEANUP_FAILED');
