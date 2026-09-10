CREATE TYPE "FxQuoteStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "FeeType" AS ENUM ('SHIPPING', 'CUSTOMS', 'SERVICE', 'TAX');
CREATE TYPE "FeeMethod" AS ENUM ('FIXED', 'PERCENT', 'PER_KG', 'WEIGHT_BRACKET', 'VALUE_BRACKET', 'PER_ITEM');
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUST', 'RETURN_RESTOCK', 'RETURN_QUARANTINE', 'RETURN_DAMAGED', 'WRITE_OFF');
CREATE TYPE "ReservationKind" AS ENUM ('HOLD', 'VERIFICATION');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONSUMED');

ALTER TABLE "Market" ADD COLUMN "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN "inventory" JSONB NOT NULL DEFAULT '{"lowStockThreshold":2}';
UPDATE "Integration" SET "isActive" = false WHERE "key" = 'pricing.phase02-test-rates';

CREATE TABLE "FxQuote" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "quoteCurrency" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceField" TEXT,
  "status" "FxQuoteStatus" NOT NULL DEFAULT 'SUGGESTED',
  "jumpPercent" DECIMAL(18,4),
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FxQuote_rate_positive" CHECK ("rate" > 0)
);

CREATE TABLE "FxOverride" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "note" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxOverride_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FxOverride_rate_positive" CHECK ("rate" > 0),
  CONSTRAINT "FxOverride_valid_range" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom")
);

CREATE TABLE "MarketPrice" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "productId" TEXT,
  "variantId" TEXT,
  "amount" DECIMAL(18,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "compareAtAmount" DECIMAL(18,4),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketPrice_target" CHECK (("productId" IS NOT NULL)::int + ("variantId" IS NOT NULL)::int = 1),
  CONSTRAINT "MarketPrice_amount_nonnegative" CHECK ("amount" >= 0),
  CONSTRAINT "MarketPrice_valid_range" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom")
);

CREATE TABLE "FeeRule" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "labelI18n" JSONB NOT NULL,
  "type" "FeeType" NOT NULL,
  "method" "FeeMethod" NOT NULL,
  "params" JSONB NOT NULL,
  "currency" TEXT NOT NULL,
  "province" TEXT,
  "city" TEXT,
  "postalPrefix" TEXT,
  "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "priority" INTEGER NOT NULL DEFAULT 0,
  "minAmount" DECIMAL(18,4),
  "maxAmount" DECIMAL(18,4),
  "absorb" BOOLEAN NOT NULL DEFAULT false,
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeeRule_valid_range" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom"),
  CONSTRAINT "FeeRule_limits" CHECK (("minAmount" IS NULL OR "minAmount" >= 0) AND ("maxAmount" IS NULL OR "maxAmount" >= 0))
);

CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameI18n" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockItem" (
  "id" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "onHand" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "quarantinedQty" INTEGER NOT NULL DEFAULT 0,
  "damagedQty" INTEGER NOT NULL DEFAULT 0,
  "lowStockThreshold" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockItem_available_nonnegative" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "quarantinedQty" >= 0 AND "damagedQty" >= 0 AND "onHand" - "reserved" >= 0)
);

CREATE TABLE "Lot" (
  "id" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "qtyReceived" INTEGER NOT NULL,
  "qtyRemaining" INTEGER NOT NULL,
  "unitCostAmount" DECIMAL(18,4) NOT NULL,
  "unitCostCurrency" TEXT NOT NULL,
  "unitCostAmountTry" DECIMAL(18,4) NOT NULL,
  "unitCostAmountUsd" DECIMAL(18,4) NOT NULL,
  "fxRateSnapshot" JSONB NOT NULL,
  "landedCostAmount" DECIMAL(18,4),
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lot_quantities" CHECK ("qtyReceived" > 0 AND "qtyRemaining" >= 0 AND "qtyRemaining" <= "qtyReceived"),
  CONSTRAINT "Lot_cost_nonnegative" CHECK ("unitCostAmount" >= 0 AND "unitCostAmountTry" >= 0 AND "unitCostAmountUsd" >= 0 AND ("landedCostAmount" IS NULL OR "landedCostAmount" >= 0))
);

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "lotId" TEXT,
  "type" "StockMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "referenceId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockMovement_quantity_nonzero" CHECK ("quantity" <> 0)
);

CREATE TABLE "Reservation" (
  "id" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "kind" "ReservationKind" NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "quantity" INTEGER NOT NULL,
  "referenceId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reservation_quantity_positive" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");
CREATE UNIQUE INDEX "StockItem_warehouseId_variantId_key" ON "StockItem"("warehouseId", "variantId");
CREATE INDEX "FxQuote_marketId_status_fetchedAt_idx" ON "FxQuote"("marketId", "status", "fetchedAt");
CREATE INDEX "FxQuote_quoteCurrency_status_idx" ON "FxQuote"("quoteCurrency", "status");
CREATE INDEX "FxQuote_acceptedById_idx" ON "FxQuote"("acceptedById");
CREATE UNIQUE INDEX "FxQuote_one_active_per_market" ON "FxQuote"("marketId") WHERE "status" = 'ACTIVE';
CREATE INDEX "FxOverride_marketId_validFrom_validUntil_idx" ON "FxOverride"("marketId", "validFrom", "validUntil");
CREATE INDEX "MarketPrice_marketId_productId_validFrom_idx" ON "MarketPrice"("marketId", "productId", "validFrom");
CREATE INDEX "MarketPrice_marketId_variantId_validFrom_idx" ON "MarketPrice"("marketId", "variantId", "validFrom");
CREATE INDEX "FeeRule_marketId_isActive_type_priority_idx" ON "FeeRule"("marketId", "isActive", "type", "priority");
CREATE INDEX "FeeRule_categoryIds_idx" ON "FeeRule" USING GIN ("categoryIds");
CREATE INDEX "StockItem_variantId_idx" ON "StockItem"("variantId");
CREATE INDEX "Lot_variantId_warehouseId_receivedAt_idx" ON "Lot"("variantId", "warehouseId", "receivedAt");
CREATE INDEX "StockMovement_variantId_warehouseId_createdAt_idx" ON "StockMovement"("variantId", "warehouseId", "createdAt");
CREATE INDEX "StockMovement_lotId_idx" ON "StockMovement"("lotId");
CREATE INDEX "Reservation_status_expiresAt_idx" ON "Reservation"("status", "expiresAt");
CREATE INDEX "Reservation_variantId_warehouseId_status_idx" ON "Reservation"("variantId", "warehouseId", "status");

ALTER TABLE "FxQuote" ADD CONSTRAINT "FxQuote_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FxQuote" ADD CONSTRAINT "FxQuote_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_expiry_by_kind" CHECK (("kind" = 'HOLD' AND "expiresAt" IS NOT NULL) OR ("kind" = 'VERIFICATION' AND "expiresAt" IS NULL));

CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_append_only"
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();
