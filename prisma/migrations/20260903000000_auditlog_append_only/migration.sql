-- AuditLog is append-only (D24 / fix-order B11).

-- 1. Drop updatedAt.
ALTER TABLE "AuditLog" DROP COLUMN "updatedAt";

-- 2. Block UPDATE and DELETE with a trigger that raises, so an accidental
--    write fails loudly instead of silently succeeding.
CREATE OR REPLACE FUNCTION forbid_auditlog_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (D24): % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditlog_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_auditlog_mutation();

CREATE TRIGGER auditlog_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_auditlog_mutation();
