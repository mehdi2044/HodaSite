-- D55: a paid order may combine several credit reservations with one external payment.
-- Keep the original protection against approving multiple bank/cash payments.
DROP INDEX "one_approved_payment_per_order";
CREATE UNIQUE INDEX "one_approved_external_payment_per_order" ON "Payment"("orderId") WHERE status='APPROVED' AND method<>'STORE_CREDIT';
CREATE UNIQUE INDEX "one_payment_per_credit_use" ON "Payment"(reference) WHERE method='STORE_CREDIT';
CREATE FUNCTION phase05_payment_budget() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_total numeric; order_currency text; paid numeric;
BEGIN
 IF NEW.status='APPROVED' THEN
  SELECT "totalAmount",currency INTO order_total,order_currency FROM "Order" WHERE id=NEW."orderId" FOR UPDATE;
  IF NOT FOUND OR NEW.currency<>order_currency THEN RAISE EXCEPTION 'Payment order/currency mismatch'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid FROM "Payment" WHERE "orderId"=NEW."orderId" AND status='APPROVED' AND id<>NEW.id;
  IF paid+NEW.amount>order_total THEN RAISE EXCEPTION 'Approved payments exceed order total'; END IF;
 END IF;
 IF NEW.method='STORE_CREDIT' AND NOT EXISTS(
  SELECT 1 FROM "CreditUse" u JOIN "StoreCredit" c ON c.id=u."creditId"
  WHERE u.id=NEW.reference AND u."orderId"=NEW."orderId" AND u.amount=NEW.amount AND c.currency=NEW.currency AND u.status IN ('RESERVED','CONSUMED')
 ) THEN RAISE EXCEPTION 'Credit payment must match its reservation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_budget_guard BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION phase05_payment_budget();
