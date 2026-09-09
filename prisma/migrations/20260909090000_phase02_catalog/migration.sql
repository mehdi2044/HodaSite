-- Phase 02 catalog. Additive only: no existing table or column is removed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ProductGender" AS ENUM ('WOMEN', 'MEN', 'KIDS', 'UNISEX');
CREATE TYPE "SizeScale" AS ENUM ('EU', 'TR', 'US', 'CA', 'INTL');

CREATE TABLE "Brand" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "nameI18n" JSONB NOT NULL,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "parentId" TEXT,
  "slugI18n" JSONB NOT NULL,
  "titleI18n" JSONB NOT NULL,
  "descriptionI18n" JSONB NOT NULL DEFAULT '{}',
  "seoI18n" JSONB NOT NULL DEFAULT '{}',
  "gender" "ProductGender" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "mediaId" TEXT,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Collection" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "titleI18n" JSONB NOT NULL,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Color" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameI18n" JSONB NOT NULL,
  "hex" TEXT NOT NULL,
  "swatchMediaId" TEXT,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Color_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Size" (
  "id" TEXT NOT NULL,
  "scale" "SizeScale" NOT NULL,
  "value" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Size_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "slugI18n" JSONB NOT NULL,
  "titleI18n" JSONB NOT NULL,
  "descriptionI18n" JSONB NOT NULL,
  "brandId" TEXT,
  "categoryId" TEXT NOT NULL,
  "gender" "ProductGender" NOT NULL,
  "material" TEXT,
  "fit" TEXT,
  "season" TEXT,
  "careI18n" JSONB NOT NULL DEFAULT '{}',
  "originCountry" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  "basePriceAmount" DECIMAL(18,4) NOT NULL,
  "basePriceCurrency" TEXT NOT NULL DEFAULT 'USD',
  "compareAtPriceAmount" DECIMAL(18,4),
  "defaultPurchaseCostAmount" DECIMAL(18,4),
  "defaultPurchaseCostCurrency" TEXT,
  "weightGrams" INTEGER NOT NULL DEFAULT 250,
  "seoI18n" JSONB NOT NULL DEFAULT '{}',
  "marketIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "searchText" TEXT NOT NULL DEFAULT '',
  "searchVector" TSVECTOR,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAttribute" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "valueI18n" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Variant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "colorId" TEXT NOT NULL,
  "sizeId" TEXT NOT NULL,
  "priceOverrideUsd" DECIMAL(18,4),
  "weightGrams" INTEGER,
  "dimensions" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductMedia" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VariantMedia" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "VariantMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SizeGuide" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "nameI18n" JSONB NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'cm',
  "tableI18n" JSONB NOT NULL,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SizeGuide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_CollectionToProduct" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");
CREATE INDEX "Brand_deletedAt_slug_idx" ON "Brand"("deletedAt", "slug");
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");
CREATE INDEX "Category_gender_deletedAt_idx" ON "Category"("gender", "deletedAt");
CREATE INDEX "Category_mediaId_idx" ON "Category"("mediaId");
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE INDEX "Collection_deletedAt_slug_idx" ON "Collection"("deletedAt", "slug");
CREATE UNIQUE INDEX "Color_code_key" ON "Color"("code");
CREATE INDEX "Color_deletedAt_code_idx" ON "Color"("deletedAt", "code");
CREATE INDEX "Color_swatchMediaId_idx" ON "Color"("swatchMediaId");
CREATE UNIQUE INDEX "Size_scale_value_groupKey_key" ON "Size"("scale", "value", "groupKey");
CREATE INDEX "Size_groupKey_sortOrder_idx" ON "Size"("groupKey", "sortOrder");
CREATE INDEX "Product_categoryId_status_deletedAt_idx" ON "Product"("categoryId", "status", "deletedAt");
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");
CREATE INDEX "Product_gender_status_idx" ON "Product"("gender", "status");
CREATE INDEX "Product_marketIds_idx" ON "Product" USING GIN ("marketIds");
CREATE INDEX "Product_tags_idx" ON "Product" USING GIN ("tags");
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");
CREATE INDEX "Product_searchText_trgm_idx" ON "Product" USING GIN ("searchText" gin_trgm_ops);
CREATE UNIQUE INDEX "Product_slug_fa_live_key" ON "Product" (("slugI18n"->>'fa')) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Product_slug_tr_live_key" ON "Product" (("slugI18n"->>'tr')) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Product_slug_en_live_key" ON "Product" (("slugI18n"->>'en')) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Category_slug_fa_live_key" ON "Category" (("slugI18n"->>'fa')) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Category_slug_tr_live_key" ON "Category" (("slugI18n"->>'tr')) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Category_slug_en_live_key" ON "Category" (("slugI18n"->>'en')) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ProductAttribute_productId_key_key" ON "ProductAttribute"("productId", "key");
CREATE INDEX "ProductAttribute_productId_idx" ON "ProductAttribute"("productId");
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");
CREATE UNIQUE INDEX "Variant_barcode_key" ON "Variant"("barcode");
CREATE UNIQUE INDEX "Variant_productId_colorId_sizeId_key" ON "Variant"("productId", "colorId", "sizeId");
CREATE INDEX "Variant_productId_isActive_idx" ON "Variant"("productId", "isActive");
CREATE INDEX "Variant_colorId_idx" ON "Variant"("colorId");
CREATE INDEX "Variant_sizeId_idx" ON "Variant"("sizeId");
CREATE UNIQUE INDEX "ProductMedia_productId_mediaId_key" ON "ProductMedia"("productId", "mediaId");
CREATE INDEX "ProductMedia_productId_sortOrder_idx" ON "ProductMedia"("productId", "sortOrder");
CREATE INDEX "ProductMedia_mediaId_idx" ON "ProductMedia"("mediaId");
CREATE UNIQUE INDEX "VariantMedia_variantId_mediaId_key" ON "VariantMedia"("variantId", "mediaId");
CREATE INDEX "VariantMedia_variantId_sortOrder_idx" ON "VariantMedia"("variantId", "sortOrder");
CREATE INDEX "VariantMedia_mediaId_idx" ON "VariantMedia"("mediaId");
CREATE UNIQUE INDEX "SizeGuide_scope_refId_key" ON "SizeGuide"("scope", "refId");
CREATE INDEX "SizeGuide_scope_deletedAt_idx" ON "SizeGuide"("scope", "deletedAt");
CREATE UNIQUE INDEX "_CollectionToProduct_AB_unique" ON "_CollectionToProduct"("A", "B");
CREATE INDEX "_CollectionToProduct_B_index" ON "_CollectionToProduct"("B");

ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Color" ADD CONSTRAINT "Color_swatchMediaId_fkey" FOREIGN KEY ("swatchMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantMedia" ADD CONSTRAINT "VariantMedia_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantMedia" ADD CONSTRAINT "VariantMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "_CollectionToProduct" ADD CONSTRAINT "_CollectionToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CollectionToProduct" ADD CONSTRAINT "_CollectionToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION hoda_catalog_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple', NEW."searchText");
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Product_search_vector_trigger"
BEFORE INSERT OR UPDATE OF "searchText" ON "Product"
FOR EACH ROW EXECUTE FUNCTION hoda_catalog_search_vector();
