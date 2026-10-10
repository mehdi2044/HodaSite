CREATE FUNCTION fitting_debt_overflow_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR
    (to_jsonb(NEW)-ARRAY['balance','updatedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['balance','updatedAt']) THEN
    RAISE EXCEPTION 'Fitting debt identity is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER fitting_debt_overflow_guard BEFORE UPDATE OR DELETE
  ON "FittingCoinDebtOverflow" FOR EACH ROW EXECUTE FUNCTION fitting_debt_overflow_guard();
