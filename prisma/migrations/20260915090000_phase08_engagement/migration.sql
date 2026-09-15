-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "reply" TEXT NOT NULL DEFAULT '',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewPhoto" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "ReviewPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlugRedirect" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchEvidence" (
    "id" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "testedAt" TIMESTAMPTZ(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_customerId_productId_marketId_key" ON "Wishlist"("customerId", "productId", "marketId");

-- CreateIndex
CREATE INDEX "Review_productId_marketId_locale_status_createdAt_idx" ON "Review"("productId", "marketId", "locale", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_customerId_productId_marketId_key" ON "Review"("customerId", "productId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPhoto_mediaId_key" ON "ReviewPhoto"("mediaId");

-- CreateIndex
CREATE INDEX "StockAlert_active_notifiedAt_idx" ON "StockAlert"("active", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockAlert_customerId_variantId_marketId_key" ON "StockAlert"("customerId", "variantId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_customerId_idx" ON "PushSubscription"("customerId");

-- CreateIndex
CREATE INDEX "SlugRedirect_kind_entityId_idx" ON "SlugRedirect"("kind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SlugRedirect_kind_locale_oldSlug_key" ON "SlugRedirect"("kind", "locale", "oldSlug");

-- CreateIndex
CREATE INDEX "LaunchEvidence_gate_origin_revision_createdAt_idx" ON "LaunchEvidence"("gate", "origin", "revision", "createdAt");

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPhoto" ADD CONSTRAINT "ReviewPhoto_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPhoto" ADD CONSTRAINT "ReviewPhoto_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK (rating BETWEEN 1 AND 5), ADD CONSTRAINT "Review_status_check" CHECK (status IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE "LaunchEvidence" ADD CONSTRAINT "LaunchEvidence_result_check" CHECK (result IN ('PASS','FAIL'));
CREATE FUNCTION hoda_slug_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lang text; old_slug text; new_slug text;
BEGIN
 FOREACH lang IN ARRAY ARRAY['fa','tr','en'] LOOP
  new_slug := NEW."slugI18n"->>lang;
  IF TG_OP = 'UPDATE' THEN old_slug := OLD."slugI18n"->>lang; ELSE old_slug := NULL; END IF;
  IF new_slug IS DISTINCT FROM old_slug THEN
   DELETE FROM "SlugRedirect" WHERE kind = TG_ARGV[0] AND locale = lang AND "oldSlug" = new_slug;
   IF old_slug IS NOT NULL AND old_slug <> '' THEN
    INSERT INTO "SlugRedirect" (id, kind, locale, "oldSlug", "entityId") VALUES (md5(random()::text || clock_timestamp()::text), TG_ARGV[0], lang, old_slug, NEW.id)
    ON CONFLICT (kind, locale, "oldSlug") DO UPDATE SET "entityId" = EXCLUDED."entityId", "createdAt" = now();
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER product_slug_history AFTER INSERT OR UPDATE OF "slugI18n" ON "Product" FOR EACH ROW EXECUTE FUNCTION hoda_slug_history('p');
CREATE TRIGGER category_slug_history AFTER INSERT OR UPDATE OF "slugI18n" ON "Category" FOR EACH ROW EXECUTE FUNCTION hoda_slug_history('c');
CREATE TRIGGER page_slug_history AFTER INSERT OR UPDATE OF "slugI18n" ON "Page" FOR EACH ROW EXECUTE FUNCTION hoda_slug_history('pages');
CREATE FUNCTION hoda_launch_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Launch evidence is append-only'; END $$;
CREATE TRIGGER launch_evidence_immutable BEFORE UPDATE OR DELETE ON "LaunchEvidence" FOR EACH ROW EXECUTE FUNCTION hoda_launch_evidence_immutable();
INSERT INTO "NotificationTemplate" (id,key,channel,"subjectI18n","bodyI18n","isActive","createdAt","updatedAt") VALUES ('phase08-stock-available','stock.available','email','{"fa":"موجودی دوباره: {{productName}}","tr":"Yeniden stokta: {{productName}}","en":"Back in stock: {{productName}}"}','{"fa":"کالای درخواستی شما دوباره موجود است: {{productUrl}}\nمدیریت اعلان‌ها: {{accountUrl}}","tr":"İstediğiniz ürün yeniden stokta: {{productUrl}}\nBildirimlerinizi yönetin: {{accountUrl}}","en":"The item you requested is available again: {{productUrl}}\nManage notifications: {{accountUrl}}"}',true,now(),now()) ON CONFLICT (key,channel) DO NOTHING;
