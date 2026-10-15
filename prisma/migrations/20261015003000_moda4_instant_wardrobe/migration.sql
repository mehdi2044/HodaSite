CREATE TABLE "CustomerInstantLook" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomerInstantLook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerInstantLook_version_check" CHECK ("version" > 0),
  CONSTRAINT "CustomerInstantLook_name_check" CHECK (length("name") BETWEEN 1 AND 120),
  CONSTRAINT "CustomerInstantLook_snapshot_check" CHECK ((jsonb_typeof("snapshot")='object' AND "snapshot"->>'version'='1' AND jsonb_typeof("snapshot"->'variantIds')='array' AND jsonb_array_length("snapshot"->'variantIds') BETWEEN 1 AND 4) IS TRUE)
);
CREATE UNIQUE INDEX "CustomerInstantLook_customerId_requestKey_key" ON "CustomerInstantLook"("customerId", "requestKey");
CREATE INDEX "CustomerInstantLook_customerId_marketId_archivedAt_createdAt_idx" ON "CustomerInstantLook"("customerId", "marketId", "archivedAt", "createdAt");
ALTER TABLE "CustomerInstantLook" ADD CONSTRAINT "CustomerInstantLook_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerInstantLook" ADD CONSTRAINT "CustomerInstantLook_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
