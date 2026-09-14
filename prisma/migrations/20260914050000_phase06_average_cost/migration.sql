-- CreateTable
CREATE TABLE "StockCostPolicy" (
    "stockItemId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'FIFO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCostPolicy_pkey" PRIMARY KEY ("stockItemId")
);

-- CreateTable
CREATE TABLE "StockValue" (
    "stockItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "amountTry" DECIMAL(18,4) NOT NULL,
    "amountUsd" DECIMAL(18,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockValue_pkey" PRIMARY KEY ("stockItemId")
);

-- CreateTable
CREATE TABLE "StockValuation" (
    "movementId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "amountTry" DECIMAL(18,4) NOT NULL,
    "amountUsd" DECIMAL(18,4) NOT NULL,
    "rateTry" DECIMAL(30,12) NOT NULL,
    "rateUsd" DECIMAL(30,12) NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockValuation_pkey" PRIMARY KEY ("movementId")
);

-- CreateIndex
CREATE INDEX "StockValuation_stockItemId_idx" ON "StockValuation"("stockItemId");

ALTER TABLE "StockCostPolicy" ADD FOREIGN KEY ("stockItemId") REFERENCES "StockItem"(id) ON DELETE RESTRICT;
ALTER TABLE "StockCostPolicy" ADD CHECK (method IN('FIFO','AVERAGE'));
ALTER TABLE "StockValue" ADD FOREIGN KEY ("stockItemId") REFERENCES "StockItem"(id) ON DELETE RESTRICT;
ALTER TABLE "StockValue" ADD CHECK(quantity>=0 AND amount>=0 AND "amountTry">=0 AND "amountUsd">=0);
ALTER TABLE "StockValuation" ADD FOREIGN KEY ("stockItemId") REFERENCES "StockItem"(id) ON DELETE RESTRICT;
ALTER TABLE "StockValuation" ADD FOREIGN KEY ("movementId") REFERENCES "StockMovement"(id) ON DELETE RESTRICT;
ALTER TABLE "StockValuation" ADD CHECK(quantity<>0 AND amount>=0 AND "amountTry">=0 AND "amountUsd">=0 AND "rateTry">0 AND "rateUsd">0);
CREATE TRIGGER immutable_stock_valuation BEFORE UPDATE OR DELETE ON "StockValuation" FOR EACH ROW EXECUTE FUNCTION immutable_finance_attribution();
CREATE FUNCTION verify_average_stock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "StockItem" s WHERE s.id=NEW."stockItemId" AND s."onHand"=(SELECT quantity FROM "StockValue" WHERE "stockItemId"=s.id)) THEN RAISE EXCEPTION 'AVERAGE_STOCK_MISMATCH'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER verify_average_stock AFTER INSERT OR UPDATE ON "StockValue" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_average_stock();
CREATE FUNCTION protect_cost_method() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD."stockItemId" ELSE NEW."stockItemId" END;
 IF TG_OP='UPDATE' AND OLD.method=NEW.method AND OLD."stockItemId"=NEW."stockItemId" THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM "StockValuation" WHERE "stockItemId"=target) OR EXISTS(SELECT 1 FROM "StockMovement" m JOIN "JournalEntry" j ON j."requestKey"='cogs:'||m.id WHERE m."stockItemId"=target) THEN RAISE EXCEPTION 'COST_METHOD_LOCKED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_cost_method BEFORE INSERT OR UPDATE OR DELETE ON "StockCostPolicy" FOR EACH ROW EXECUTE FUNCTION protect_cost_method();
