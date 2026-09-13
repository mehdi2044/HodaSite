-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameI18n" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "fxAsOf" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reversalOfId" TEXT,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL,
    "credit" DECIMAL(18,4) NOT NULL,
    "debitTry" DECIMAL(18,4) NOT NULL,
    "creditTry" DECIMAL(18,4) NOT NULL,
    "debitUsd" DECIMAL(18,4) NOT NULL,
    "creditUsd" DECIMAL(18,4) NOT NULL,
    "rateTry" DECIMAL(30,12) NOT NULL,
    "rateUsd" DECIMAL(30,12) NOT NULL,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_marketId_currency_code_key" ON "LedgerAccount"("marketId", "currency", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_marketId_effectiveAt_id_idx" ON "JournalEntry"("marketId", "effectiveAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_marketId_requestKey_key" ON "JournalEntry"("marketId", "requestKey");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_entryId_idx" ON "JournalLine"("accountId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalLine_entryId_position_key" ON "JournalLine"("entryId", "position");

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerAccount" ADD CONSTRAINT ledger_account_contract CHECK (
  currency IN ('TRY','USD','CAD','IRT') AND length(code) BETWEEN 1 AND 80
  AND kind IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')
);
ALTER TABLE "JournalEntry" ADD CONSTRAINT journal_header_contract CHECK (
  status IN ('DRAFT','POSTED') AND length("requestKey") BETWEEN 1 AND 100
  AND "requestHash" ~ '^[0-9a-f]{64}$' AND length(trim(memo)) BETWEEN 1 AND 500
  AND isfinite("effectiveAt") AND isfinite("fxAsOf")
);
ALTER TABLE "JournalLine" ADD CONSTRAINT journal_amount_contract CHECK (
  position BETWEEN 0 AND 999 AND currency IN ('TRY','USD','CAD','IRT')
  AND debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
  AND "rateTry" > 0 AND "rateTry" < 'NaN'::numeric AND "rateUsd" > 0 AND "rateUsd" < 'NaN'::numeric
  AND (currency <> 'TRY' OR "rateTry" = 1) AND (currency <> 'USD' OR "rateUsd" = 1)
  AND debit < 'NaN'::numeric AND credit < 'NaN'::numeric
  AND "debitTry" = round(debit * "rateTry", 4) AND "creditTry" = round(credit * "rateTry", 4)
  AND "debitUsd" = round(debit * "rateUsd", 4) AND "creditUsd" = round(credit * "rateUsd", 4)
);

CREATE FUNCTION phase06_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - ARRAY['nameI18n','isActive']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['nameI18n','isActive']) THEN
    RAISE EXCEPTION 'IMMUTABLE_LEDGER_ACCOUNT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_account_guard BEFORE UPDATE OR DELETE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION phase06_account_guard();

CREATE FUNCTION phase06_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'JOURNAL_MUST_START_DRAFT'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR OLD.status <> 'DRAFT' OR NEW.status <> 'POSTED'
    OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'IMMUTABLE_JOURNAL';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION phase06_entry_guard();

CREATE FUNCTION phase06_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "JournalEntry"; a "LedgerAccount";
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'IMMUTABLE_JOURNAL_LINE'; END IF;
  SELECT * INTO STRICT e FROM "JournalEntry" WHERE id=NEW."entryId" FOR UPDATE;
  IF e.status <> 'DRAFT' THEN RAISE EXCEPTION 'JOURNAL_SEALED'; END IF;
  SELECT * INTO STRICT a FROM "LedgerAccount" WHERE id=NEW."accountId" FOR SHARE;
  IF a."marketId" <> e."marketId" OR a.currency <> NEW.currency OR (NOT a."isActive" AND e."reversalOfId" IS NULL) THEN
    RAISE EXCEPTION 'INVALID_LEDGER_ACCOUNT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION phase06_line_guard();

-- Deferred verification sees the whole transaction, including all its lines.
-- An unfinished draft can never survive commit. No update/delete escape hatch.
CREATE FUNCTION phase06_verify_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "JournalEntry"; original "JournalEntry"; n bigint;
BEGIN
  SELECT * INTO STRICT e FROM "JournalEntry" WHERE id=NEW.id;
  IF e.status <> 'POSTED' THEN RAISE EXCEPTION 'UNPOSTED_JOURNAL'; END IF;
  SELECT count(*) INTO n FROM "JournalLine" WHERE "entryId"=e.id;
  IF n < 2 OR n > 1000 OR EXISTS (
    SELECT 1 FROM "JournalLine" WHERE "entryId"=e.id HAVING min(position)<>0 OR max(position)<>n-1
  ) THEN RAISE EXCEPTION 'INVALID_JOURNAL_LINES'; END IF;
  IF EXISTS (
    SELECT currency FROM "JournalLine" WHERE "entryId"=e.id GROUP BY currency
    HAVING sum(debit)<>sum(credit) OR min("rateTry")<>max("rateTry") OR min("rateUsd")<>max("rateUsd")
  ) OR EXISTS (
    SELECT 1 FROM "JournalLine" WHERE "entryId"=e.id
    HAVING sum("debitTry")<>sum("creditTry") OR sum("debitUsd")<>sum("creditUsd")
  ) THEN RAISE EXCEPTION 'UNBALANCED_JOURNAL'; END IF;
  IF e."reversalOfId" IS NOT NULL THEN
    SELECT * INTO STRICT original FROM "JournalEntry" WHERE id=e."reversalOfId";
    IF original.status <> 'POSTED' OR original."reversalOfId" IS NOT NULL
      OR original."marketId"<>e."marketId" OR e."fxAsOf"<>original."fxAsOf"
      OR e."effectiveAt"<original."effectiveAt"
      OR n<>(SELECT count(*) FROM "JournalLine" WHERE "entryId"=original.id)
      OR EXISTS (
        SELECT position,"accountId",currency,debit,credit,"debitTry","creditTry","debitUsd","creditUsd","rateTry","rateUsd"
        FROM "JournalLine" WHERE "entryId"=e.id
        EXCEPT
        SELECT position,"accountId",currency,credit,debit,"creditTry","debitTry","creditUsd","debitUsd","rateTry","rateUsd"
        FROM "JournalLine" WHERE "entryId"=original.id
      ) THEN RAISE EXCEPTION 'INVALID_JOURNAL_REVERSAL'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT OR UPDATE ON "JournalEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION phase06_verify_journal();

-- Existing installations gain the explicit accountant grant; custom roles/denies stay intact.
INSERT INTO "RolePermission" ("id", "roleId", permission, "updatedAt")
SELECT 'ledger-post-' || id, id, 'finance.journal.post', CURRENT_TIMESTAMP FROM "Role" WHERE key='accountant'
ON CONFLICT ("roleId",permission) DO NOTHING;

-- Add chart accounts to existing markets without replacing configured accounts.
INSERT INTO "LedgerAccount" (id,"marketId",currency,code,"nameI18n",kind)
SELECT 'ledger-' || md5(m.id || ':' || c.currency || ':' || a.code), m.id, c.currency, a.code, a."nameI18n", a.kind
FROM "Market" m CROSS JOIN (VALUES ('TRY'),('USD'),('CAD'),('IRT')) c(currency)
CROSS JOIN jsonb_to_recordset('[{"code": "cash", "kind": "ASSET", "nameI18n": {"fa": "صندوق", "tr": "Kasa", "en": "Cash"}}, {"code": "bank", "kind": "ASSET", "nameI18n": {"fa": "بانک", "tr": "Banka", "en": "Bank"}}, {"code": "inventory", "kind": "ASSET", "nameI18n": {"fa": "موجودی کالا", "tr": "Stok", "en": "Inventory"}}, {"code": "cogs", "kind": "EXPENSE", "nameI18n": {"fa": "بهای کالای فروش‌رفته", "tr": "Satılan malın maliyeti", "en": "Cost of goods sold"}}, {"code": "sales", "kind": "INCOME", "nameI18n": {"fa": "فروش", "tr": "Satış", "en": "Sales"}}, {"code": "shipping_income", "kind": "INCOME", "nameI18n": {"fa": "درآمد ارسال", "tr": "Kargo geliri", "en": "Shipping income"}}, {"code": "shipping_expense", "kind": "EXPENSE", "nameI18n": {"fa": "هزینهٔ ارسال", "tr": "Kargo gideri", "en": "Shipping expense"}}, {"code": "customs", "kind": "EXPENSE", "nameI18n": {"fa": "گمرک", "tr": "Gümrük", "en": "Customs"}}, {"code": "tax_collected", "kind": "LIABILITY", "nameI18n": {"fa": "مالیات وصول‌شده", "tr": "Tahsil edilen vergi", "en": "Tax collected"}}, {"code": "fees", "kind": "INCOME", "nameI18n": {"fa": "درآمد خدمات", "tr": "Hizmet geliri", "en": "Service income"}}, {"code": "expenses", "kind": "EXPENSE", "nameI18n": {"fa": "هزینه‌های عمومی", "tr": "Genel giderler", "en": "General expenses"}}, {"code": "partner_capital", "kind": "EQUITY", "nameI18n": {"fa": "سرمایهٔ شرکا", "tr": "Ortak sermayesi", "en": "Partner capital"}}, {"code": "partner_draws", "kind": "EQUITY", "nameI18n": {"fa": "برداشت شرکا", "tr": "Ortak çekişleri", "en": "Partner draws"}}, {"code": "clearing", "kind": "ASSET", "nameI18n": {"fa": "حساب واسط", "tr": "Geçici hesap", "en": "Clearing"}}]'::jsonb) a(code text, kind text, "nameI18n" jsonb)
ON CONFLICT ("marketId",currency,code) DO NOTHING;
