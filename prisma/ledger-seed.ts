import { Prisma } from "@prisma/client";

export const LEDGER_CHART = [
  {
    code: "store_credit",
    kind: "LIABILITY",
    nameI18n: {
      fa: "اعتبار مشتریان",
      tr: "Müşteri kredisi",
      en: "Store credit liability",
    },
  },
  {
    code: "payables",
    kind: "LIABILITY",
    nameI18n: { fa: "حساب پرداختنی", tr: "Borçlar", en: "Accounts payable" },
  },
  {
    code: "cash",
    kind: "ASSET",
    nameI18n: {
      fa: "صندوق",
      tr: "Kasa",
      en: "Cash",
    },
  },
  {
    code: "bank",
    kind: "ASSET",
    nameI18n: {
      fa: "بانک",
      tr: "Banka",
      en: "Bank",
    },
  },
  {
    code: "inventory",
    kind: "ASSET",
    nameI18n: {
      fa: "موجودی کالا",
      tr: "Stok",
      en: "Inventory",
    },
  },
  {
    code: "cogs",
    kind: "EXPENSE",
    nameI18n: {
      fa: "بهای کالای فروش‌رفته",
      tr: "Satılan malın maliyeti",
      en: "Cost of goods sold",
    },
  },
  {
    code: "sales",
    kind: "INCOME",
    nameI18n: {
      fa: "فروش",
      tr: "Satış",
      en: "Sales",
    },
  },
  {
    code: "shipping_income",
    kind: "INCOME",
    nameI18n: {
      fa: "درآمد ارسال",
      tr: "Kargo geliri",
      en: "Shipping income",
    },
  },
  {
    code: "shipping_expense",
    kind: "EXPENSE",
    nameI18n: {
      fa: "هزینهٔ ارسال",
      tr: "Kargo gideri",
      en: "Shipping expense",
    },
  },
  {
    code: "customs",
    kind: "EXPENSE",
    nameI18n: {
      fa: "گمرک",
      tr: "Gümrük",
      en: "Customs",
    },
  },
  {
    code: "tax_collected",
    kind: "LIABILITY",
    nameI18n: {
      fa: "مالیات وصول‌شده",
      tr: "Tahsil edilen vergi",
      en: "Tax collected",
    },
  },
  {
    code: "fees",
    kind: "INCOME",
    nameI18n: {
      fa: "درآمد خدمات",
      tr: "Hizmet geliri",
      en: "Service income",
    },
  },
  {
    code: "expenses",
    kind: "EXPENSE",
    nameI18n: {
      fa: "هزینه‌های عمومی",
      tr: "Genel giderler",
      en: "General expenses",
    },
  },
  {
    code: "partner_capital",
    kind: "EQUITY",
    nameI18n: {
      fa: "سرمایهٔ شرکا",
      tr: "Ortak sermayesi",
      en: "Partner capital",
    },
  },
  {
    code: "partner_draws",
    kind: "EQUITY",
    nameI18n: {
      fa: "برداشت شرکا",
      tr: "Ortak çekişleri",
      en: "Partner draws",
    },
  },
  {
    code: "clearing",
    kind: "ASSET",
    nameI18n: {
      fa: "حساب واسط",
      tr: "Geçici hesap",
      en: "Clearing",
    },
  },
];

/** Add missing chart accounts without changing existing names or active flags. */
export async function seedLedgerAccounts(db: Prisma.TransactionClient) {
  await db.$executeRaw`INSERT INTO "LedgerAccount" (id,"marketId",currency,code,"nameI18n",kind)
SELECT 'ledger-' || md5(m.id || ':' || c.currency || ':' || a.code), m.id, c.currency, a.code, a."nameI18n", a.kind
FROM "Market" m CROSS JOIN (VALUES ('TRY'),('USD'),('CAD'),('IRT')) c(currency)
CROSS JOIN jsonb_to_recordset(${JSON.stringify(LEDGER_CHART)}::jsonb) a(code text, kind text, "nameI18n" jsonb)
ON CONFLICT ("marketId",currency,code) DO NOTHING`;
}
