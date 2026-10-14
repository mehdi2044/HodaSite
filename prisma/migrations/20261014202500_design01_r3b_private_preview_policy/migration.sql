-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "servicePolicy" JSONB;

-- CreateTable
CREATE TABLE "HomepagePreview" (
    "id" TEXT NOT NULL,
    "channelHash" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scopeMarketId" TEXT,
    "marketId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "blocks" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HomepagePreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomepagePreview_channelHash_key" ON "HomepagePreview"("channelHash");

-- CreateIndex
CREATE INDEX "HomepagePreview_ownerId_expiresAt_idx" ON "HomepagePreview"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "HomepagePreview_expiresAt_idx" ON "HomepagePreview"("expiresAt");

-- AddForeignKey
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_scopeMarketId_fkey" FOREIGN KEY ("scopeMarketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only new ephemeral data receives these contracts; retained rows are untouched.
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_sequence_positive" CHECK ("sequence" > 0);
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_locale_supported" CHECK ("locale" IN ('fa','tr','en'));
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_scope_consistent" CHECK ("scopeMarketId" IS NULL OR "scopeMarketId" = "marketId");
ALTER TABLE "HomepagePreview" ADD CONSTRAINT "HomepagePreview_channel_hash" CHECK ("channelHash" ~ '^[a-f0-9]{64}$');
