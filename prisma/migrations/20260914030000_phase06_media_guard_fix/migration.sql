-- Correct the BEFORE DELETE return value for unrelated, non-financial media.
-- Keep the applied migration unchanged; expense documents remain protected.
CREATE OR REPLACE FUNCTION protect_expense_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind='expense' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expense document is immutable'; END IF;
  IF EXISTS(SELECT 1 FROM "Expense" WHERE "attachmentId"=OLD.id) OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW.tags IS DISTINCT FROM OLD.tags OR NEW."uploadedBy" IS DISTINCT FROM OLD."uploadedBy" THEN RAISE EXCEPTION 'Expense document is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION protect_recognized_lot_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'qtyRemaining') IS DISTINCT FROM (to_jsonb(OLD)-'qtyRemaining') AND
  (EXISTS(SELECT 1 FROM "PurchaseOrderItem" i JOIN "PurchaseOrder" p ON p.id=i."purchaseOrderId" WHERE i."lotId"=OLD.id AND p.status='RECEIVED') OR
   EXISTS(SELECT 1 FROM "StockMovement" s JOIN "JournalEntry" j ON j."requestKey"='cogs:'||s.id WHERE s."lotId"=OLD.id))
 THEN RAISE EXCEPTION 'Recognized lot cost is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_recognized_lot_cost BEFORE UPDATE ON "Lot" FOR EACH ROW EXECUTE FUNCTION protect_recognized_lot_cost();
