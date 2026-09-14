-- CreateTable
CREATE TABLE "FinanceAttribution" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT,
    "revenueTry" DECIMAL(18,4) NOT NULL,
    "revenueUsd" DECIMAL(18,4) NOT NULL,
    "costTry" DECIMAL(18,4) NOT NULL,
    "costUsd" DECIMAL(18,4) NOT NULL,
    "expenseTry" DECIMAL(18,4) NOT NULL,
    "expenseUsd" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "FinanceAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAttribution_marketId_orderId_idx" ON "FinanceAttribution"("marketId", "orderId");

-- CreateIndex
CREATE INDEX "FinanceAttribution_variantId_idx" ON "FinanceAttribution"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAttribution_entryId_orderItemId_key" ON "FinanceAttribution"("entryId", "orderItemId");

ALTER TABLE "FinanceAttribution" ADD FOREIGN KEY ("entryId") REFERENCES "JournalEntry"(id) ON DELETE RESTRICT;
ALTER TABLE "FinanceAttribution" ADD FOREIGN KEY ("orderId") REFERENCES "Order"(id) ON DELETE RESTRICT;
ALTER TABLE "FinanceAttribution" ADD FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"(id) ON DELETE RESTRICT;
CREATE FUNCTION immutable_finance_attribution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable finance attribution'; END $$;
CREATE TRIGGER immutable_finance_attribution BEFORE UPDATE OR DELETE ON "FinanceAttribution" FOR EACH ROW EXECUTE FUNCTION immutable_finance_attribution();
CREATE FUNCTION protect_expense_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind='expense' AND (TG_OP='DELETE' OR EXISTS(SELECT 1 FROM "Expense" WHERE "attachmentId"=OLD.id) OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW.tags IS DISTINCT FROM OLD.tags OR NEW."uploadedBy" IS DISTINCT FROM OLD."uploadedBy") THEN RAISE EXCEPTION 'Expense document is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_expense_media BEFORE UPDATE OR DELETE ON "Media" FOR EACH ROW EXECUTE FUNCTION protect_expense_media();
