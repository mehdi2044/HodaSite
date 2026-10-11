CREATE OR REPLACE FUNCTION fitting_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','storageKey','errorCode','savedName','savedAt','startedAt','completedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','storageKey','errorCode','savedName','savedAt','startedAt','completedAt','updatedAt']) THEN RAISE EXCEPTION 'Fitting session charge and snapshot are immutable'; END IF; RETURN NEW; END; $$;

ALTER TABLE "FittingCoinGrant" ADD COLUMN "ruleSnapshot" JSONB;
