-- Existing wallet debt remains the first tranche; no historical data is rewritten.
CREATE TABLE "FittingCoinDebtOverflow" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "balance" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FittingCoinDebtOverflow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FittingCoinDebtOverflow_balance_check" CHECK ("amount" > 0 AND "balance" >= 0 AND "balance" <= "amount")
);
CREATE UNIQUE INDEX "FittingCoinDebtOverflow_customerId_sourceKey_key" ON "FittingCoinDebtOverflow"("customerId", "sourceKey");
CREATE INDEX "FittingCoinDebtOverflow_customerId_createdAt_idx" ON "FittingCoinDebtOverflow"("customerId", "createdAt");
ALTER TABLE "FittingCoinDebtOverflow" ADD CONSTRAINT "FittingCoinDebtOverflow_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
