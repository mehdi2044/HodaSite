-- Preserve primary liability and wallet identity, just like overflow debt tranches.
-- Debt repayment/accrual and housekeeping timestamps remain mutable.
CREATE FUNCTION fitting_wallet_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR
    (to_jsonb(NEW)-ARRAY['debt','updatedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['debt','updatedAt']) THEN
    RAISE EXCEPTION 'Fitting wallet identity is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER fitting_wallet_guard BEFORE UPDATE OR DELETE
  ON "FittingWallet" FOR EACH ROW EXECUTE FUNCTION fitting_wallet_guard();
