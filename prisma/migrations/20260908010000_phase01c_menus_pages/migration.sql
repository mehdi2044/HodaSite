-- Phase 01c vertical slice 1: menus and CMS pages. Additive only.
CREATE TABLE "Menu" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "marketId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Page" (
  "id" TEXT NOT NULL,
  "slugI18n" JSONB NOT NULL,
  "titleI18n" JSONB NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'static',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "seoI18n" JSONB NOT NULL DEFAULT '{}',
  "marketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "blocks" JSONB NOT NULL DEFAULT '[]',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
  "id" TEXT NOT NULL,
  "menuId" TEXT NOT NULL,
  "parentId" TEXT,
  "labelI18n" JSONB NOT NULL,
  "linkType" TEXT NOT NULL DEFAULT 'url',
  "url" TEXT,
  "pageId" TEXT,
  "referenceId" TEXT,
  "target" TEXT NOT NULL DEFAULT '_self',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "visibleIn" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Menu_key_marketId_key" ON "Menu"("key", "marketId");
-- PostgreSQL considers NULL values distinct in a normal unique index.
CREATE UNIQUE INDEX "Menu_global_key_unique" ON "Menu"("key") WHERE "marketId" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX "Menu_key_deletedAt_idx" ON "Menu"("key", "deletedAt");
CREATE INDEX "Menu_marketId_idx" ON "Menu"("marketId");
CREATE INDEX "Page_status_deletedAt_idx" ON "Page"("status", "deletedAt");
CREATE INDEX "MenuItem_menuId_parentId_sortOrder_idx" ON "MenuItem"("menuId", "parentId", "sortOrder");
CREATE INDEX "MenuItem_pageId_idx" ON "MenuItem"("pageId");

ALTER TABLE "Menu" ADD CONSTRAINT "Menu_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Menu" ADD CONSTRAINT "Menu_key_check" CHECK ("key" IN ('header', 'mobile', 'footer'));
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_linkType_check" CHECK ("linkType" IN ('url', 'page', 'category', 'collection'));
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_target_check" CHECK ("target" IN ('_self', '_blank'));
ALTER TABLE "Page" ADD CONSTRAINT "Page_type_check" CHECK ("type" IN ('static', 'landing'));
ALTER TABLE "Page" ADD CONSTRAINT "Page_status_check" CHECK ("status" IN ('draft', 'published'));
