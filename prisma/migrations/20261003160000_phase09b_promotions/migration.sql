-- CreateTable
CREATE TABLE "PromotionProgram" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionProgramRevision" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ownerNotes" TEXT NOT NULL,
    "titleI18n" JSONB NOT NULL,
    "descriptionI18n" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "mutationKey" TEXT NOT NULL,
    "mutationHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionProgramRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionCoupon" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "totalUsageCap" INTEGER,
    "perCustomerCap" INTEGER,
    "actorId" TEXT NOT NULL,
    "mutationKey" TEXT NOT NULL,
    "mutationIndex" INTEGER NOT NULL,
    "mutationHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionOrderEvaluation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionOrderEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "couponId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionUsageRelease" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionUsageRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionProgram_marketId_id_idx" ON "PromotionProgram"("marketId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionProgramRevision_mutationKey_key" ON "PromotionProgramRevision"("mutationKey");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionProgramRevision_programId_version_key" ON "PromotionProgramRevision"("programId", "version");

-- CreateIndex
CREATE INDEX "PromotionCoupon_programId_id_idx" ON "PromotionCoupon"("programId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCoupon_marketId_code_key" ON "PromotionCoupon"("marketId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCoupon_mutationKey_mutationIndex_key" ON "PromotionCoupon"("mutationKey", "mutationIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionOrderEvaluation_orderId_key" ON "PromotionOrderEvaluation"("orderId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_programId_idx" ON "PromotionRedemption"("programId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_couponId_idx" ON "PromotionRedemption"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_evaluationId_programId_key" ON "PromotionRedemption"("evaluationId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionUsageRelease_evaluationId_key" ON "PromotionUsageRelease"("evaluationId");

-- AddForeignKey
ALTER TABLE "PromotionProgram" ADD CONSTRAINT "PromotionProgram_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProgramRevision" ADD CONSTRAINT "PromotionProgramRevision_programId_fkey" FOREIGN KEY ("programId") REFERENCES "PromotionProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCoupon" ADD CONSTRAINT "PromotionCoupon_programId_fkey" FOREIGN KEY ("programId") REFERENCES "PromotionProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionOrderEvaluation" ADD CONSTRAINT "PromotionOrderEvaluation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PromotionOrderEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_programId_revision_fkey" FOREIGN KEY ("programId", "revision") REFERENCES "PromotionProgramRevision"("programId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PromotionCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionUsageRelease" ADD CONSTRAINT "PromotionUsageRelease_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PromotionOrderEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D72: never mutate historical rule, monetary or release evidence.
CREATE FUNCTION promotion_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Promotion evidence is append-only'; END; $$;
CREATE TRIGGER promotion_revision_immutable BEFORE UPDATE OR DELETE ON "PromotionProgramRevision" FOR EACH ROW EXECUTE FUNCTION promotion_evidence_immutable();
CREATE TRIGGER promotion_evaluation_immutable BEFORE UPDATE OR DELETE ON "PromotionOrderEvaluation" FOR EACH ROW EXECUTE FUNCTION promotion_evidence_immutable();
CREATE TRIGGER promotion_redemption_immutable BEFORE UPDATE OR DELETE ON "PromotionRedemption" FOR EACH ROW EXECUTE FUNCTION promotion_evidence_immutable();
CREATE TRIGGER promotion_release_immutable BEFORE UPDATE OR DELETE ON "PromotionUsageRelease" FOR EACH ROW EXECUTE FUNCTION promotion_evidence_immutable();

ALTER TABLE "PromotionProgram" ADD CONSTRAINT promotion_version_positive CHECK (version > 0), ADD CONSTRAINT promotion_currency CHECK (currency IN ('USD','CAD','TRY','IRT'));
ALTER TABLE "PromotionProgramRevision" ADD CONSTRAINT promotion_revision_positive CHECK (version > 0);
ALTER TABLE "PromotionCoupon" ADD CONSTRAINT coupon_status CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')), ADD CONSTRAINT coupon_version CHECK (version > 0), ADD CONSTRAINT coupon_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{3,63}$'), ADD CONSTRAINT coupon_caps CHECK (("totalUsageCap" IS NULL OR "totalUsageCap" >= 0) AND ("perCustomerCap" IS NULL OR "perCustomerCap" >= 0)), ADD CONSTRAINT coupon_dates CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT redemption_amount CHECK (amount > 0), ADD CONSTRAINT redemption_currency CHECK (currency IN ('USD','CAD','TRY','IRT'));
ALTER TABLE "PromotionUsageRelease" ADD CONSTRAINT promotion_release_reason CHECK (reason = 'CANCELLED_UNPAID');

CREATE FUNCTION promotion_program_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Archive programs instead of deleting'; END IF;
  IF NEW.id <> OLD.id OR NEW."marketId" <> OLD."marketId" OR NEW.currency <> OLD.currency OR NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Immutable program identity or invalid revision'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER promotion_program_guard BEFORE UPDATE OR DELETE ON "PromotionProgram" FOR EACH ROW EXECUTE FUNCTION promotion_program_guard();

CREATE FUNCTION promotion_coupon_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Archive coupons instead of deleting'; END IF;
  IF TG_OP = 'UPDATE' AND ((to_jsonb(NEW) - ARRAY['status','version','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','updatedAt']) OR NEW.version <> OLD.version + 1 OR OLD.status = 'ARCHIVED') THEN RAISE EXCEPTION 'Immutable coupon terms or invalid version'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "PromotionProgram" p WHERE p.id=NEW."programId" AND p."marketId"=NEW."marketId") THEN RAISE EXCEPTION 'Coupon market mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER promotion_coupon_guard BEFORE INSERT OR UPDATE OR DELETE ON "PromotionCoupon" FOR EACH ROW EXECUTE FUNCTION promotion_coupon_guard();

CREATE FUNCTION promotion_redemption_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "PromotionOrderEvaluation" e JOIN "Order" o ON o.id=e."orderId" JOIN "PromotionProgram" p ON p.id=NEW."programId" WHERE e.id=NEW."evaluationId" AND p."marketId"=o."marketId" AND p.currency=o.currency AND NEW.currency=o.currency) THEN RAISE EXCEPTION 'Redemption market or currency mismatch'; END IF;
  IF NEW."couponId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PromotionCoupon" c WHERE c.id=NEW."couponId" AND c."programId"=NEW."programId") THEN RAISE EXCEPTION 'Redemption coupon mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER promotion_redemption_guard BEFORE INSERT ON "PromotionRedemption" FOR EACH ROW EXECUTE FUNCTION promotion_redemption_guard();

CREATE FUNCTION promotion_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_row "Order"%ROWTYPE;
BEGIN
  SELECT o.* INTO order_row FROM "Order" o JOIN "PromotionOrderEvaluation" e ON e."orderId"=o.id WHERE e.id=NEW."evaluationId" FOR UPDATE OF o;
  IF order_row.id IS NULL OR order_row.status <> 'CANCELLED' OR order_row."paidAt" IS NOT NULL OR EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId"=order_row.id AND p.status='APPROVED') THEN RAISE EXCEPTION 'Only cancelled never-paid usage can be released'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER promotion_release_guard BEFORE INSERT ON "PromotionUsageRelease" FOR EACH ROW EXECUTE FUNCTION promotion_release_guard();
