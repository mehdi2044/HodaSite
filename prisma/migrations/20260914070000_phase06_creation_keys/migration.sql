-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_marketId_requestKey_key" ON "Supplier"("marketId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_marketId_requestKey_key" ON "Partner"("marketId", "requestKey");

