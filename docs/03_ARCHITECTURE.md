# Architecture

Single Next.js application, modular monolith. Persian summary at the end.

## 1. Runtime topology (production)

```
Internet ──▶ Caddy (TLS, gzip/brotli, static cache)
               ├──▶ app  (Next.js, node 20)  ──▶ postgres:16
               │                              ──▶ minio (S3 API, media + receipts + backups)
               └──▶ minio (public bucket via /media/*)
             cron (alpine + curl): hits /api/cron/tick every minute
             ops (same Dockerfile, stage `ops`: node + app prisma/ + postgres-client + mc + zstd + jq + file; NO docker socket):
                 daily backup/prune/verify, executes RestoreRequests, runs migrations itself, pre-deploy backups.
                 The ONLY place restore ever runs. Off-site mirror → independent provider (launch condition).
```

`docker-compose.yml` (prod) and `docker-compose.dev.yml` (local) share the same service names.

## 2. Repository layout

```
.
├── AGENTS.md
├── docs/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── scripts/backup/{backup.sh,restore.sh,prune.sh}
├── public/fonts/{vazirmatn,inter}/…
├── messages/{fa,tr,en}.json            # base UI strings (DB overrides win)
├── src/
│   ├── app/
│   │   ├── [locale]/(storefront)/…    # home, category, product, cart, checkout, account, pages/[slug]
│   │   ├── admin/…                    # admin panel (its own layout, always LTR/RTL by admin language)
│   │   └── api/
│   │       ├── cron/tick
│   │       ├── uploads/…
│   │       ├── webhooks/[provider]
│   │       └── health
│   ├── modules/                       # DOMAIN LOGIC — framework-agnostic where possible
│   │   ├── markets/        (Market, MarketSettings, market resolution)
│   │   ├── settings/       (SiteSettings incl. finance currencies, ThemeSettings, Menus, Translations, Pages/CMS blocks)
│   │   ├── catalog/        (Product, Variant, Category, Collection, Brand, Media, SizeGuide)
│   │   ├── inventory/      (StockItem, Lot, StockMovement, Reservation HOLD/VERIFICATION, Warehouse, COGS)
│   │   ├── pricing/        (PriceList, FxQuote suggested/active, FxOverride, Money, rounding, market markup)
│   │   ├── fees/           (FeeRule engine + simulator)
│   │   ├── cart/
│   │   ├── checkout/       (order creation, snapshots, payment instruction)
│   │   ├── orders/         (state machine, timeline, invoice PDF)
│   │   ├── payments/       (PaymentProvider interface, OfflineBankTransfer, Receipt)
│   │   ├── shipping/       (ShippingWorkflow, Shipment, Leg, CarrierProvider)
│   │   ├── customers/      (Customer, Address, Consent, Wishlist)
│   │   ├── auth/           (Auth.js config, OTP, admin MFA, sessions)
│   │   ├── access/         (Role, Permission, Scope, UserOverride, `can()` helper, AuditLog)
│   │   ├── notifications/  (Email/SMS providers, templates from DB)
│   │   ├── search/         (Postgres FTS, normalization)
│   │   ├── finance/        (later phases: ledger, expenses, partners, margins)
│   │   ├── crm/            (later phases)
│   │   ├── ai/             (AiProvider gateway, usage log, data-entry assistant)
│   │   ├── backup/         (list/download/upload validation, RestoreRequest creation — execution happens in ops)
│   │   ├── jobs/           (Job table, scheduler, handlers registry)
│   │   └── integrations/   (concrete providers: fx/frankfurter, storage/{local,s3}, email/{resend,smtp}, …)
│   ├── components/         (ui/ = shadcn primitives; storefront/; admin/)
│   ├── lib/                (db, money, i18n, dates, http, env)
│   └── styles/
├── tests/{unit,e2e}/
├── docker-compose.yml, docker-compose.dev.yml, Dockerfile, Caddyfile
└── .env.example
```

Rule: `app/` (routes, pages, server actions) may import from `modules/*`. `modules/*` never import from `app/`. Modules import each other only via their public `index.ts`.

## 3. Key cross-cutting mechanisms

### 3.1 Market & locale resolution (middleware)
1. URL locale segment → locale (`fa|tr|en`).
2. Market: cookie `market` → query `?market=` → default market of locale (fa→IR, tr→TR, en→CA) → geo hint only as suggestion banner.
3. Both are passed to server components via `getRequestContext()`; every price/fee/shipping computation receives `{marketId, locale, currency}` explicitly. No global singletons.

### 3.2 Settings & theme
- `SiteSettings` (singleton row, JSON per section: brand, contact, seo, social, legal, checkout options).
- `ThemeSettings` (colors, fonts, radius, hero style, logo/favicon media ids) → rendered as `<style>:root{--color-primary:…}</style>` in root layout, cached with `unstable_cache` and revalidated by tag `settings` on save.
- `Menu` + `MenuItem` (header/footer/mobile), `Page` (CMS with block JSON), `Banner` sets, all translated via `Translation` rows keyed `(entityType, entityId, field, locale)`.
- UI strings: `messages/*.json` as defaults; `Translation` rows with `entityType='ui'` override at runtime (merged and cached per locale).

### 3.3 Money & pricing pipeline
```
Product/Variant.basePrice in pricingBaseCurrency (USD) 
  → active FxQuote(USD→marketCurrency) (or valid FxOverride) 
  → × Market.markupPercent 
  → rounding rule (Market.roundingRule) 
  → optional MarketPrice override (manual fixed price for that market) 
  = displayPrice (cached per variant+market for 15 min)
```
`Money` value object: `{ amount: Decimal, currency: 'USD'|'TRY'|'CAD'|'IRT' }`. Never add two Moneys of different currency. Three currency roles (D04): pricing base (USD), functional/legal (TRY), reporting (USD); every stored amount keeps its original currency and, where finance needs it, TRY/USD snapshot equivalents.

### 3.4 Fees engine
`computeFees({ market, address, items[], subtotal, weightGrams })` → `FeeLine[]` `{type, ruleId, label(locale), amount, absorbed}`. Rules resolved by scope specificity (city > province > market), then priority. Pure function, fully unit-tested. Same function used by cart preview, checkout, admin simulator.

### 3.5 Order snapshot
On `placeOrder`: copy product title/variant/sku/price/currency/fx rate/fee lines/addresses into `Order*` tables. Later edits to catalog never affect existing orders.

### 3.6 Inventory reservation (D14)
`placeOrder` locks the affected `StockItem` rows with `SELECT … FOR UPDATE` in a fixed order (by `variantId`) inside one transaction, then creates `Reservation(kind=HOLD, expiresAt = now + market.holdHours)`; a DB check constraint guarantees `onHand - reserved >= 0` (D38). Receipt upload upgrades it to `kind=VERIFICATION` (no expiry). Available = onHand − active reserved. Jobs `expire-holds` (every minute) and `cancel-unpaid-orders` (deadline). Approval converts the reservation to `StockMovement(OUT)` with FIFO lot cost; if stock is gone the order goes to `NEEDS_REVIEW`.

### 3.7 Access control
`can(user, 'order.receipt.approve', { marketId })` — role permissions ∪ user overrides, filtered by scope (market/category/section). Every server action calls `assertCan()` first. Sensitive actions write `AuditLog`.

### 3.8 Provider interfaces (in `modules/integrations`)
```ts
interface FxProvider     { getRates(base: 'USD', symbols: string[]): Promise<Record<string, {rate: Decimal, fetchedAt: Date, sourceField?: string}>> }  // frankfurter | navasan | manual
interface StorageProvider{ put(key, buffer, meta): Promise<Url>; getSignedUrl(key): …; delete(key) }
interface EmailProvider  { send(to, templateKey, locale, data) }
interface SmsProvider    { send(to, templateKey, locale, data) }
interface PaymentProvider{ createPayment(order): PaymentInstruction | RedirectUrl; handleWebhook(req); verify(payment) }
interface CarrierProvider{ quote(leg, parcel); createShipment(leg); track(trackingNo) }
interface AiProvider     { complete(task, input, {locale, budget}): AiResult }
```
Active provider chosen by `Integration` table row (admin-configurable) with env-based secrets. Every provider has a `manual`/`noop` implementation so the shop never breaks when an integration is down.

### 3.9 Jobs
`Job {id, type, payload, runAt, attempts, status, lockedAt, lastError}`. `/api/cron/tick` (protected by `CRON_SECRET`) claims due jobs with `FOR UPDATE SKIP LOCKED`, runs handlers (fx-refresh, expire-reservations, cancel-unpaid-orders, backup-daily, send-email, media-optimize, low-stock-alert).

### 3.10 Observability
- `/api/health` (db, storage, last backup age, last fx age, disk).
- Structured logs (pino) → stdout → docker logs; optional Sentry DSN via env.
- Admin "System Health" page reads the same data.

## 4. Storefront rendering
- Category/product/home/pages: SSR with ISR-like caching (`revalidate` + tags). Cart/checkout/account: dynamic.
- Images via `next/image` with custom loader pointing to our media service (`/media/{id}/{w}.webp`).
- PWA: `manifest.webmanifest` generated from `SiteSettings`; service worker caches shell + images only (never cart/price/API).
- SEO: `hreflang` for 3 locales × markets, canonical, JSON-LD Product/Offer/Breadcrumb, sitemap per market.

---

## خلاصهٔ فارسی برای مهدی
- کل سایت یک برنامه است که در چند «جعبه» (Docker) روی یک سرور اجرا می‌شود: خود سایت، دیتابیس، انبار فایل‌ها، یک زمان‌بند و یک «کارگر عملیاتی» (ops) که بکاپ می‌گیرد و فقط او اجازهٔ بازگردانی دارد.
- کد داخلش به «ماژول»های جداگانه تقسیم شده (محصولات، قیمت، هزینه‌ها، سفارش، پرداخت، حمل، تنظیمات، …) تا اگر روزی بخواهیم بخشی را جدا یا عوض کنیم، بقیه خراب نشود.
- هر چیزی که با سرویس بیرونی کار می‌کند (نرخ ارز، ایمیل، پرداخت، حمل، AI) پشت یک «درگاه استاندارد» است؛ یعنی می‌شود سرویس را عوض کرد بدون اینکه سایت را دوباره بنویسیم، و همیشه یک «راه دستی» وجود دارد.
- تنظیمات ظاهر و متن‌ها در دیتابیس است و از ادمین عوض می‌شود.
