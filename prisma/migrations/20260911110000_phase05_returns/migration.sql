-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "returnSettings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "returnRequestId" TEXT;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "decisionNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "policySnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "receivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "refundAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReturnItem" ADD COLUMN     "refundAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditUse" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditUse_orderId_creditId_key" ON "CreditUse"("orderId", "creditId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_orderId_requestKey_key" ON "ReturnRequest"("orderId", "requestKey");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditUse" ADD CONSTRAINT "CreditUse_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditUse" ADD CONSTRAINT "CreditUse_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "StoreCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReturnRequest" ADD CONSTRAINT "return_version_amount" CHECK (version>=0 AND "refundAmount">=0);
ALTER TABLE "ReturnItem" ADD CONSTRAINT "return_item_amount" CHECK ("refundAmount">=0);
ALTER TABLE "CreditUse" ADD CONSTRAINT "credit_use_valid" CHECK (amount>0 AND status IN ('RESERVED','CONSUMED','RELEASED'));
CREATE FUNCTION phase05_return_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Return history is retained'; END IF;
 IF TG_TABLE_NAME='ReturnRequest' THEN
  IF OLD.status IN ('REJECTED','RESOLVED') OR NEW.version<>OLD.version+1 OR
   (to_jsonb(NEW)-ARRAY['status','version','decisionNote','receivedAt','resolvedAt','refundId','exchangeOrderId','resolution','updatedAt']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','version','decisionNote','receivedAt','resolvedAt','refundId','exchangeOrderId','resolution','updatedAt']) THEN RAISE EXCEPTION 'Return snapshot is immutable'; END IF;
  IF NOT ((OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR
          (OLD.status='APPROVED' AND NEW.status IN ('IN_TRANSIT','RECEIVED')) OR
          (OLD.status='IN_TRANSIT' AND NEW.status='RECEIVED') OR
          (OLD.status='RECEIVED' AND NEW.status='RESOLVED')) THEN RAISE EXCEPTION 'Invalid return transition'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['condition','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['condition','updatedAt']) OR
   NOT EXISTS(SELECT 1 FROM "ReturnRequest" WHERE id=OLD."returnRequestId" AND status IN ('APPROVED','IN_TRANSIT')) THEN RAISE EXCEPTION 'Return item is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER return_history_guard BEFORE UPDATE OR DELETE ON "ReturnRequest" FOR EACH ROW EXECUTE FUNCTION phase05_return_guard();
CREATE TRIGGER return_item_guard BEFORE UPDATE OR DELETE ON "ReturnItem" FOR EACH ROW EXECUTE FUNCTION phase05_return_guard();
CREATE FUNCTION phase05_credit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Credit history is retained'; END IF;
 IF TG_TABLE_NAME='StoreCredit' THEN
  IF (to_jsonb(NEW)-ARRAY['balance','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['balance','updatedAt']) THEN RAISE EXCEPTION 'Credit identity and amount are immutable'; END IF;
 ELSE
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'RESERVED' OR NOT EXISTS(SELECT 1 FROM "StoreCredit" c JOIN "Order" o ON o."customerId"=c."customerId" AND o.currency=c.currency WHERE c.id=NEW."creditId" AND o.id=NEW."orderId") THEN RAISE EXCEPTION 'Credit ownership mismatch'; END IF;
  ELSE
   IF OLD.status<>'RESERVED' OR NEW.status NOT IN ('CONSUMED','RELEASED') OR
    (to_jsonb(NEW)-ARRAY['status','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updatedAt']) THEN RAISE EXCEPTION 'Credit use is immutable'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER store_credit_guard BEFORE UPDATE OR DELETE ON "StoreCredit" FOR EACH ROW EXECUTE FUNCTION phase05_credit_guard();
CREATE TRIGGER credit_use_guard BEFORE INSERT OR UPDATE OR DELETE ON "CreditUse" FOR EACH ROW EXECUTE FUNCTION phase05_credit_guard();
INSERT INTO "RolePermission" (id,"roleId",permission,"createdAt","updatedAt")
SELECT 'return-manage-'||id,id,'return.manage',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "Role" WHERE key IN ('admin','warehouse','accountant') ON CONFLICT ("roleId",permission) DO NOTHING;
