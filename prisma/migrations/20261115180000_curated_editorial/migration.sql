-- CreateEnum
CREATE TYPE "EditorialKind" AS ENUM ('LOOK', 'ARTICLE');

-- CreateEnum
CREATE TYPE "WeeklyLookSlot" AS ENUM ('MAIN', 'WOMEN', 'MEN', 'GIRLS', 'BOYS');

-- CreateTable
CREATE TABLE "EditorialEntry" (
    "id" TEXT NOT NULL,
    "kind" "EditorialKind" NOT NULL,
    "slugFa" TEXT NOT NULL,
    "slugTr" TEXT NOT NULL,
    "slugEn" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "minVisibleVersion" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EditorialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "approvedBy" TEXT,
    "visibleFrom" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EditorialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuratedLookItem" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CuratedLookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyLookFeature" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "slot" "WeeklyLookSlot" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WeeklyLookFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditorialEntry_kind_deletedAt_id_idx" ON "EditorialEntry"("kind", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialEntry_kind_slugFa_key" ON "EditorialEntry"("kind", "slugFa");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialEntry_kind_slugTr_key" ON "EditorialEntry"("kind", "slugTr");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialEntry_kind_slugEn_key" ON "EditorialEntry"("kind", "slugEn");

-- CreateIndex
CREATE INDEX "EditorialRevision_entryId_visibleFrom_idx" ON "EditorialRevision"("entryId", "visibleFrom");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialRevision_entryId_number_key" ON "EditorialRevision"("entryId", "number");

-- CreateIndex
CREATE INDEX "CuratedLookItem_productId_idx" ON "CuratedLookItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CuratedLookItem_revisionId_position_key" ON "CuratedLookItem"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CuratedLookItem_revisionId_productId_key" ON "CuratedLookItem"("revisionId", "productId");

-- CreateIndex
CREATE INDEX "WeeklyLookFeature_entryId_idx" ON "WeeklyLookFeature"("entryId");

-- CreateIndex
CREATE INDEX "WeeklyLookFeature_slot_startsAt_endsAt_idx" ON "WeeklyLookFeature"("slot", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "EditorialRevision" ADD CONSTRAINT "EditorialRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EditorialEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratedLookItem" ADD CONSTRAINT "CuratedLookItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EditorialRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratedLookItem" ADD CONSTRAINT "CuratedLookItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyLookFeature" ADD CONSTRAINT "WeeklyLookFeature_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EditorialEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "EditorialRevision" ADD CONSTRAINT "EditorialRevision_approval_check" CHECK (("approvedBy" IS NULL) = ("visibleFrom" IS NULL));
ALTER TABLE "WeeklyLookFeature" ADD CONSTRAINT "WeeklyLookFeature_window_check" CHECK ("startsAt" < "endsAt");
