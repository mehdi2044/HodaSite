-- Additive R4 presentation only. Preserve all historical FKs/indexes/types.
ALTER TABLE "Category" ADD COLUMN "presentation" JSONB;
CREATE TABLE "CatalogCutout" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "colorId" TEXT NOT NULL,
  "variantId" TEXT, "mediaId" TEXT NOT NULL, "slot" TEXT NOT NULL, "anchor" TEXT,
  "geometry" JSONB NOT NULL, "validation" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogCutout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogCutout_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogCutout_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogCutout_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogCutout_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogCutout_version_nonnegative" CHECK ("version" >= 0),
  CONSTRAINT "CatalogCutout_slot_anchor" CHECK (
    ("slot"='ACCESSORY' AND "anchor" IS NOT NULL AND "anchor" IN ('HAND','NECK','HEAD'))
    OR ("slot" IN ('TOP','BOTTOM','ONE_PIECE','LAYER','SHOES') AND "anchor" IS NULL)),
  CONSTRAINT "CatalogCutout_geometry_version" CHECK (jsonb_typeof("geometry")='object' AND "geometry" ? 'version' AND "geometry"->>'version'='1')
);
CREATE UNIQUE INDEX "CatalogCutout_variantId_key" ON "CatalogCutout"("variantId");
CREATE UNIQUE INDEX "CatalogCutout_shared_product_color_key" ON "CatalogCutout"("productId","colorId") WHERE "variantId" IS NULL;
CREATE INDEX "CatalogCutout_productId_colorId_idx" ON "CatalogCutout"("productId","colorId");
CREATE INDEX "CatalogCutout_mediaId_idx" ON "CatalogCutout"("mediaId");
