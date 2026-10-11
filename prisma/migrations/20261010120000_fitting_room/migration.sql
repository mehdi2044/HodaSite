-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "coinPackCoins" DECIMAL(18,4),
ADD COLUMN     "fittingSlot" TEXT;

-- CreateTable
CREATE TABLE "FittingWallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "debt" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FittingWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FittingCoinGrant" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "balance" DECIMAL(18,4) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FittingCoinGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FittingCoinEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FittingCoinEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FittingSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "modelId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "allocations" JSONB NOT NULL,
    "costCoins" DECIMAL(18,4) NOT NULL,
    "storageKey" TEXT,
    "errorCode" TEXT,
    "savedName" TEXT,
    "savedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FittingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FittingWallet_customerId_key" ON "FittingWallet"("customerId");

-- CreateIndex
CREATE INDEX "FittingCoinGrant_customerId_expiresAt_idx" ON "FittingCoinGrant"("customerId", "expiresAt");

-- CreateIndex
CREATE INDEX "FittingCoinGrant_orderId_idx" ON "FittingCoinGrant"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FittingCoinGrant_customerId_sourceKey_key" ON "FittingCoinGrant"("customerId", "sourceKey");

-- CreateIndex
CREATE INDEX "FittingCoinEntry_customerId_createdAt_idx" ON "FittingCoinEntry"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FittingCoinEntry_customerId_sourceKey_key" ON "FittingCoinEntry"("customerId", "sourceKey");

-- CreateIndex
CREATE INDEX "FittingSession_customerId_createdAt_idx" ON "FittingSession"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "FittingSession_status_createdAt_idx" ON "FittingSession"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FittingSession_customerId_requestKey_key" ON "FittingSession"("customerId", "requestKey");

-- AddForeignKey
ALTER TABLE "FittingWallet" ADD CONSTRAINT "FittingWallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FittingCoinGrant" ADD CONSTRAINT "FittingCoinGrant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FittingCoinEntry" ADD CONSTRAINT "FittingCoinEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FittingSession" ADD CONSTRAINT "FittingSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Product" ADD CONSTRAINT "Product_coin_pack_positive" CHECK ("coinPackCoins" IS NULL OR "coinPackCoins" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_fitting_slot_valid" CHECK ("fittingSlot" IS NULL OR "fittingSlot" IN ('TOP','BOTTOM','ONE_PIECE','LAYER','ACCESSORY','SHOES'));
ALTER TABLE "FittingWallet" ADD CONSTRAINT "FittingWallet_debt_nonnegative" CHECK (debt >= 0);
ALTER TABLE "FittingCoinGrant" ADD CONSTRAINT "FittingCoinGrant_balance_valid" CHECK (amount > 0 AND balance >= 0 AND balance <= amount AND "revokedAmount" >= 0 AND "revokedAmount" <= amount);
ALTER TABLE "FittingSession" ADD CONSTRAINT "FittingSession_cost_positive" CHECK ("costCoins" > 0);
ALTER TABLE "FittingSession" ADD CONSTRAINT "FittingSession_status_valid" CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED','REVIEW'));
CREATE FUNCTION fitting_coin_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fitting coin entries are append-only'; END; $$;
CREATE TRIGGER fitting_coin_entry_immutable BEFORE UPDATE OR DELETE ON "FittingCoinEntry" FOR EACH ROW EXECUTE FUNCTION fitting_coin_entry_immutable();
CREATE FUNCTION fitting_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['balance','revokedAt','revokedAmount','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['balance','revokedAt','revokedAmount','updatedAt']) THEN RAISE EXCEPTION 'Fitting grant identity is immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER fitting_grant_guard BEFORE UPDATE OR DELETE ON "FittingCoinGrant" FOR EACH ROW EXECUTE FUNCTION fitting_grant_guard();

CREATE FUNCTION fitting_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','storageKey','errorCode','savedName','startedAt','completedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','storageKey','errorCode','savedName','startedAt','completedAt','updatedAt']) THEN RAISE EXCEPTION 'Fitting session charge and snapshot are immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER fitting_session_guard BEFORE UPDATE OR DELETE ON "FittingSession" FOR EACH ROW EXECUTE FUNCTION fitting_session_guard();
