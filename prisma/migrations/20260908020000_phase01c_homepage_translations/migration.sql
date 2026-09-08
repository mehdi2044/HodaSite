-- Phase 01c homepage composition and UI translation overrides (additive only).
CREATE TABLE "Homepage" (
    "id" TEXT NOT NULL,
    "marketId" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Homepage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Homepage_marketId_key" ON "Homepage"("marketId");
CREATE UNIQUE INDEX "Homepage_global_active_key" ON "Homepage" ((1))
  WHERE "marketId" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX "Homepage_deletedAt_idx" ON "Homepage"("deletedAt");
CREATE UNIQUE INDEX "Translation_entityType_entityId_field_locale_key"
  ON "Translation"("entityType", "entityId", "field", "locale");
CREATE INDEX "Translation_entityType_entityId_locale_idx"
  ON "Translation"("entityType", "entityId", "locale");
ALTER TABLE "Homepage" ADD CONSTRAINT "Homepage_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
