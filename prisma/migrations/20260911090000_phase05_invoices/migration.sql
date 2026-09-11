-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "invoiceSettings" JSONB NOT NULL DEFAULT '{}';

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "mediaId" TEXT,
    "generationToken" TEXT,
    "generationUntil" TIMESTAMPTZ(3),
    "requestedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_mediaId_key" ON "Invoice"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_version_key" ON "Invoice"("orderId", "version");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_version_positive" CHECK ("version" > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_status_valid" CHECK ("status" IN ('PENDING','READY','FAILED'));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ready_media" CHECK (("status" = 'READY') = ("mediaId" IS NOT NULL));
CREATE FUNCTION phase05_protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Invoice history is immutable'; END IF;
 IF OLD."status" = 'READY' OR NEW."id" <> OLD."id" OR NEW."orderId" <> OLD."orderId" OR NEW."version" <> OLD."version" OR NEW."snapshot" <> OLD."snapshot" OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy" OR NEW."createdAt" <> OLD."createdAt" THEN
  RAISE EXCEPTION 'Invoice snapshot is immutable';
 END IF;
 IF NEW."mediaId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Media" WHERE id=NEW."mediaId" AND kind='invoice' AND "deletedAt" IS NULL AND mime='application/pdf' AND status='READY' AND url='' AND "storageKey" LIKE 'invoices/' || NEW.id || '/%') THEN RAISE EXCEPTION 'Invoice media must be private'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_immutable BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION phase05_protect_invoice();
CREATE FUNCTION phase05_protect_invoice_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind='invoice' OR EXISTS (SELECT 1 FROM "Invoice" WHERE "mediaId"=OLD.id) THEN RAISE EXCEPTION 'Invoice media is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_media_immutable BEFORE UPDATE OR DELETE ON "Media" FOR EACH ROW EXECUTE FUNCTION phase05_protect_invoice_media();
INSERT INTO "RolePermission" (id,"roleId",permission,"createdAt","updatedAt")
SELECT 'invoice-view-' || id, id, 'order.invoice.view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Role" WHERE key IN ('admin','accountant')
ON CONFLICT ("roleId",permission) DO NOTHING;

CREATE FUNCTION phase05_validate_invoice_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status <> 'PENDING' OR NEW."mediaId" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "Order" WHERE id=NEW."orderId" AND "paidAt" IS NOT NULL) THEN RAISE EXCEPTION 'Invoice requires a paid order and pending generation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_initial_state BEFORE INSERT ON "Invoice" FOR EACH ROW EXECUTE FUNCTION phase05_validate_invoice_insert();
