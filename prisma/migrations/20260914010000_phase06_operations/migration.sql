-- AlterTable
ALTER TABLE "JournalEntry" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FinanceConfig" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMPTZ(3),
    "marginPercent" DECIMAL(18,4) NOT NULL DEFAULT 10,
    "slowDays" INTEGER NOT NULL DEFAULT 90,
    "deviationPercent" DECIMAL(18,4) NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinanceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "rateTry" DECIMAL(30,12) NOT NULL,
    "rateUsd" DECIMAL(30,12) NOT NULL,
    "fxAsOf" TIMESTAMPTZ(3) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "additionalCost" DECIMAL(18,4) NOT NULL,
    "allocation" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchaseTotal" DECIMAL(18,4) NOT NULL,
    "weight" DECIMAL(18,4) NOT NULL,
    "allocatedCost" DECIMAL(18,4) NOT NULL,
    "landedTotal" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "roundingRemainder" DECIMAL(18,4) NOT NULL,
    "lotId" TEXT,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "rateTry" DECIMAL(30,12) NOT NULL,
    "rateUsd" DECIMAL(30,12) NOT NULL,
    "fxAsOf" TIMESTAMPTZ(3) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "attachmentId" TEXT,
    "recurrenceMonths" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownershipPercent" DECIMAL(18,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalTransaction" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "rateTry" DECIMAL(30,12) NOT NULL,
    "rateUsd" DECIMAL(30,12) NOT NULL,
    "fxAsOf" TIMESTAMPTZ(3) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "purchaseOrderId" TEXT,
    "journalId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_marketId_idx" ON "Supplier"("marketId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_warehouseId_idx" ON "PurchaseOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdById_idx" ON "PurchaseOrder"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_marketId_requestKey_key" ON "PurchaseOrder"("marketId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderItem_lotId_key" ON "PurchaseOrderItem"("lotId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_variantId_idx" ON "PurchaseOrderItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_journalId_key" ON "Expense"("journalId");

-- CreateIndex
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

-- CreateIndex
CREATE INDEX "Expense_approvedById_idx" ON "Expense"("approvedById");

-- CreateIndex
CREATE INDEX "Expense_attachmentId_idx" ON "Expense"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_marketId_requestKey_key" ON "Expense"("marketId", "requestKey");

-- CreateIndex
CREATE INDEX "Partner_marketId_idx" ON "Partner"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalTransaction_journalId_key" ON "CapitalTransaction"("journalId");

-- CreateIndex
CREATE INDEX "CapitalTransaction_partnerId_idx" ON "CapitalTransaction"("partnerId");

-- CreateIndex
CREATE INDEX "CapitalTransaction_purchaseOrderId_idx" ON "CapitalTransaction"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "CapitalTransaction_createdById_idx" ON "CapitalTransaction"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalTransaction_marketId_requestKey_key" ON "CapitalTransaction"("marketId", "requestKey");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalTransaction" ADD CONSTRAINT "CapitalTransaction_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Additive references and contracts; old commerce records remain untouched.
ALTER TABLE "FinanceConfig" ADD FOREIGN KEY (id) REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "Supplier" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id) ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrderItem" ADD FOREIGN KEY ("variantId") REFERENCES "Variant"(id) ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrderItem" ADD FOREIGN KEY ("lotId") REFERENCES "Lot"(id) ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD FOREIGN KEY ("attachmentId") REFERENCES "Media"(id) ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD FOREIGN KEY ("journalId") REFERENCES "JournalEntry"(id) ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD FOREIGN KEY ("approvedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Partner" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "CapitalTransaction" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "CapitalTransaction" ADD FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"(id) ON DELETE RESTRICT;
ALTER TABLE "CapitalTransaction" ADD FOREIGN KEY ("journalId") REFERENCES "JournalEntry"(id) ON DELETE RESTRICT;
ALTER TABLE "CapitalTransaction" ADD FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "FinanceConfig" ADD CHECK ("marginPercent" BETWEEN 0 AND 100 AND "slowDays" BETWEEN 1 AND 3650 AND "deviationPercent" BETWEEN 0 AND 1000);
ALTER TABLE "Partner" ADD CHECK ("ownershipPercent">0 AND "ownershipPercent"<=100);
ALTER TABLE "PurchaseOrderItem" ADD CHECK (quantity>0 AND "purchaseTotal">0 AND weight>0 AND "allocatedCost">=0 AND "landedTotal"="purchaseTotal"+"allocatedCost" AND "unitCost">=0 AND "landedTotal"="unitCost"*quantity+"roundingRemainder");
ALTER TABLE "PurchaseOrder" ADD CHECK (status IN ('DRAFT','RECEIVED','CANCELLED') AND allocation IN ('VALUE','WEIGHT') AND "additionalCost">=0 AND "rateTry">0 AND "rateUsd">0 AND currency IN ('TRY','USD','CAD','IRT'));
ALTER TABLE "Expense" ADD CHECK (amount>0 AND status IN ('PENDING','APPROVED','VOIDED') AND "rateTry">0 AND "rateUsd">0 AND "recurrenceMonths" BETWEEN 0 AND 12 AND currency IN ('TRY','USD','CAD','IRT'));
ALTER TABLE "CapitalTransaction" ADD CHECK (amount>0 AND kind IN ('CONTRIBUTION','WITHDRAWAL','PROFIT_SHARE') AND "rateTry">0 AND "rateUsd">0 AND currency IN ('TRY','USD','CAD','IRT'));
CREATE FUNCTION phase06_operations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial history cannot be deleted'; END IF;
 IF TG_TABLE_NAME='CapitalTransaction' THEN RAISE EXCEPTION 'Capital history is immutable'; END IF;
 IF TG_TABLE_NAME='PurchaseOrder' THEN
   IF OLD.status<>'DRAFT' OR (to_jsonb(NEW)-'status'-'receivedAt'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'receivedAt'-'updatedAt') THEN RAISE EXCEPTION 'Purchase history is immutable'; END IF;
 END IF;
 IF TG_TABLE_NAME='Expense' THEN
   IF OLD.status<>'PENDING' OR (to_jsonb(NEW)-'status'-'approvedById'-'journalId'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'approvedById'-'journalId'-'updatedAt') THEN RAISE EXCEPTION 'Expense history is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_purchase_guard BEFORE UPDATE OR DELETE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION phase06_operations_guard();
CREATE TRIGGER finance_expense_guard BEFORE UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION phase06_operations_guard();
CREATE TRIGGER finance_capital_guard BEFORE UPDATE OR DELETE ON "CapitalTransaction" FOR EACH ROW EXECUTE FUNCTION phase06_operations_guard();
CREATE FUNCTION phase06_purchase_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NOT EXISTS (SELECT 1 FROM "PurchaseOrder" WHERE id=NEW."purchaseOrderId" AND status='DRAFT') THEN RAISE EXCEPTION 'Purchase is final'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR OLD."lotId" IS NOT NULL OR (to_jsonb(NEW)-'lotId') IS DISTINCT FROM (to_jsonb(OLD)-'lotId') OR NOT EXISTS(SELECT 1 FROM "PurchaseOrder" WHERE id=OLD."purchaseOrderId" AND status='DRAFT') THEN RAISE EXCEPTION 'Purchase item is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_purchase_item_guard BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseOrderItem" FOR EACH ROW EXECUTE FUNCTION phase06_purchase_item_guard();
INSERT INTO "LedgerAccount" (id,"marketId",currency,code,"nameI18n",kind)
SELECT 'ledger-'||md5(m.id||':'||c.currency||':'||a.code),m.id,c.currency,a.code,a.names,'LIABILITY'
FROM "Market" m CROSS JOIN (VALUES ('TRY'),('USD'),('CAD'),('IRT')) c(currency)
CROSS JOIN (VALUES ('payables','{"fa":"حساب پرداختنی","tr":"Borçlar","en":"Accounts payable"}'::jsonb),('store_credit','{"fa":"اعتبار مشتریان","tr":"Müşteri kredisi","en":"Store credit liability"}'::jsonb)) a(code,names)
ON CONFLICT ("marketId",currency,code) DO NOTHING;
