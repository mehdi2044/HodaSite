# Database & Backup

## 1. Conventions (binding)
- PostgreSQL 16, Prisma. Table names PascalCase singular (Prisma default), columns camelCase.
- Every table: `id` (cuid/uuid string), `createdAt`, `updatedAt`. Content tables (Product, Category, Page, Media, Menu, …) also `deletedAt` (soft delete). **Financial/order tables (Order, OrderItem, Payment, Refund, StockMovement, JournalEntry) have NO `deletedAt`** — they are immutable and status-based (D24); corrections are compensating records.
- Money: `amount numeric(18,4)` + `currency varchar(3)` side-by-side, always, in the **original transaction currency**. Column names end with `Amount`, e.g. `subtotalAmount`, `subtotalCurrency`. Where finance needs it, add snapshot equivalents `…AmountTry`, `…AmountUsd` + `fxRateSnapshot` (D04). Currency codes: `USD`, `TRY`, `CAD`, `IRT` (Toman).
- Dates in UTC (`timestamptz`). No Jalali in DB.
- Translations: **either** JSON column `titleI18n {fa,tr,en}` for simple entities (Category, Brand, Collection, Attribute) **or** the generic `Translation` table for long content/CMS/UI strings. Product uses JSON columns for `title`, `description`, `seoTitle`, `seoDescription`, `altText`.
- Never store computed totals without their snapshot inputs (rate, rule ids).
- Indexes on every FK, on `(marketId, status)` for orders, on `sku`, `slug`, `email`, and a GIN index for FTS.
- Enums as Postgres enums via Prisma (`OrderStatus`, `FeeType`, `FeeMethod`, `PaymentStatus`, …).

## 2. Entity map (MVP; later phases extend, never rename)

### Markets & settings
- `Market(code IR|TR|CA, name, currency, isActive, salesPaused, defaultLocale, enabledLocales[], markupPercent, roundingRule json, holdHours, paymentDeadlineHours, fxMode AUTO_ACCEPT|REQUIRE_APPROVAL, fxStaleHours, fxMaxJumpPercent, volumetricDivisor, supportChannels json, seo json)`
- `SiteSettings.finance json {pricingBaseCurrency:'USD', functionalCurrency:'TRY', reportingCurrency:'USD'}` (D04)
- `MarketBankAccount(marketId, label, bankName, holder, accountNumber, iban, cardNumber, instructionsI18n json, isActive, sortOrder)`
- `SiteSettings(id='default', brand json, contact json, seo json, social json, checkout json, maintenance json)`
- `ThemeSettings(id='default', colors json, fonts json, radius, logoMediaId, logoDarkMediaId, faviconMediaId, heroStyle, customCss)`
- `Menu(key header|footer|mobile, marketId?)` / `MenuItem(menuId, parentId, labelI18n, url, target, sortOrder, visibleIn[] markets)`
- `Page(slug, type static|landing, blocks json, status, seoI18n, marketIds[])`
- `Banner(placement, mediaId, titleI18n, subtitleI18n, ctaI18n, url, startsAt, endsAt, marketIds[], sortOrder)`
- `Translation(entityType, entityId, field, locale, value)` — unique on all four keys
- `NotificationTemplate(key, channel email|sms, subjectI18n, bodyI18n, isActive)`
- `Integration(key fx|email|sms|storage|payment.*|carrier.*|ai, provider, config json (non-secret), isActive)`

### Catalog
- `Brand`, `Category(parentId, slug, titleI18n, gender WOMEN|MEN|KIDS|UNISEX, sortOrder, mediaId)`, `Collection`
- `Product(slug, titleI18n, descriptionI18n, brandId, categoryId, collectionIds[], gender, material, fit, season, careI18n, originCountry, status DRAFT|ACTIVE|ARCHIVED, basePriceAmount numeric, basePriceCurrency (= pricingBaseCurrency), compareAtPriceAmount?, defaultPurchaseCostAmount?, defaultPurchaseCostCurrency?, weightGrams default, seoI18n, marketIds[] visibility, tags[], searchVector tsvector)` — real cost basis comes from `Lot` (D32)
- `ProductAttribute(productId, key, valueI18n)` (extra specs)
- `Variant(productId, sku unique, barcode?, colorId, sizeId, priceOverrideUsd?, weightGrams?, dimensions json?, mediaIds[], isActive)`
- `Color(name I18n, hex)`, `Size(scale EU|TR|US|CA|INTL, value, sortOrder, groupKey)`
- `Media(kind image|video|receipt|document, storageKey, url, width, height, bytes, mime, altI18n, variants json {w: url}, uploadedBy)`
- `SizeGuide(scope brand|category|product, refId, tableI18n json)`
- `MarketPrice(variantId|productId, marketId, amount, currency, startsAt, endsAt)` manual override

### Inventory
- `Warehouse(code, name, countryCode, isDefault)`
- `StockItem(variantId, warehouseId, onHand int, reserved int, quarantinedQty int, damagedQty int)`  unique (variant, warehouse) — only `onHand - reserved` is sellable (V-7)
- `Lot(variantId, warehouseId, supplierId?, purchaseOrderId?, qtyReceived, qtyRemaining, unitCostAmount, unitCostCurrency (original), unitCostAmountTry, unitCostAmountUsd, fxRateSnapshot json, landedCostAmount?, receivedAt)` (D32 — created in Phase 03, full PO UI in Phase 06)
- `StockMovement(stockItemId, lotId?, type IN|OUT|ADJUST|RETURN_RESTOCK|RETURN_QUARANTINE|RETURN_DAMAGED|WRITE_OFF, qty, unitCostAmount?, unitCostCurrency?, reason, refType, refId, userId)` — immutable
- `Reservation(orderId, variantId, warehouseId, qty, expiresAt, kind HOLD|VERIFICATION, status ACTIVE|CONSUMED|RELEASED|EXPIRED)` (D14)

### Pricing
- `FxQuote(base 'USD', quote TRY|CAD|IRT, rate numeric(18,8), source frankfurter|navasan|manual, sourceField?, fetchedAt, status SUGGESTED|ACTIVE|REJECTED|SUPERSEDED, acceptedBy?, acceptedAt?)` — provider suggestions and the active selling rate live in one history table (D06)
- `FxOverride(quote, rate, startsAt, endsAt, note, createdBy)` — manual override wins while valid

### Fees
- `FeeRule(marketId, type SHIPPING|TAX|CUSTOMS|SERVICE, labelI18n, scope json {province?, city?, postalPrefix?, categoryIds?}, method FIXED|PERCENT|PER_KG|WEIGHT_BRACKET|VALUE_BRACKET|PER_ITEM, params json, minAmount?, maxAmount?, currency, absorb bool, taxable bool, priority int, isActive, validFrom?, validTo?)`

### Customers & auth
- `Customer(email unique, firstName, lastName, phone, locale, preferredMarketId, birthDate?, gender?, marketingConsent json, notes)`
- `Address(customerId, label, country, province, city, line1, line2, postalCode, phone, isDefault)`
- `AuthOtp(email, codeHash, expiresAt, attempts)`; `Session` per Auth.js
- `Wishlist(customerId, variantId)`

### Commerce
- `Cart(id, customerId?, marketId, locale, currency, expiresAt)` / `CartItem(cartId, variantId, qty)`
- `Order(number unique e.g. TR-100245, marketId, customerId, status, locale, currency, subtotalAmount, feeTotalAmount, discountAmount, totalAmount, totalAmountTry, totalAmountUsd, fxSnapshot json, holdExpiresAt, paymentDeadlineAt, shippingAddress json, billingAddress json, customerNote, adminNote, placedAt, paidAt, shippedAt, deliveredAt, cancelledAt, cancelReason, parentOrderId?, kind SALE|EXCHANGE)` — statuses incl. `NEEDS_REVIEW` (stock gone at approval time)
- `OrderItem(orderId, variantId, productSnapshot json {title, sku, color, size, image}, unitPriceAmount, qty, lineTotalAmount, weightGrams)`
- `OrderFee(orderId, type, label, ruleId, amount, absorbed)`
- `OrderEvent(orderId, type, fromStatus, toStatus, note, userId, createdAt)` (timeline)
- `Payment(orderId, provider, method, status PENDING|SUBMITTED|APPROVED|REJECTED|VOIDED|FAILED, amount, currency, bankAccountId?, reference, submittedAt, reviewedBy, reviewedAt, rejectReason)` — immutable rows; a re-upload after rejection creates a new Payment row
- `Receipt(paymentId, mediaId, note)`
- `Invoice(orderId, number, pdfMediaId, issuedAt)`
- `Refund(orderId, paymentId?, amount, method, reason, status, createdBy)`

### Shipping
- `ShippingWorkflow(marketId, name, isDefault)` / `ShippingLegTemplate(workflowId, sortOrder, type INTERNATIONAL|DOMESTIC, carrierProvider manual|…, labelI18n)`
- `Shipment(orderId, workflowId, status)` / `ShipmentLeg(shipmentId, sortOrder, type, carrierName, service, trackingNumber, trackingUrl, costAmount, costCurrency, status PENDING|IN_TRANSIT|DELIVERED|FAILED, shippedAt, eta, deliveredAt)` / `TrackingEvent(legId, at, status, description)`
- `ReturnRequest(orderId, customerId, type RETURN|EXCHANGE, reasonCode, note, status REQUESTED|APPROVED|REJECTED|IN_TRANSIT|RECEIVED|RESOLVED, resolution REFUND|STORE_CREDIT|EXCHANGE, refundId?, exchangeOrderId?)` / `ReturnItem(returnRequestId, orderItemId, qty, condition ReturnedItemCondition RESTOCK|QUARANTINE|DAMAGED, exchangeVariantId?)` / `StoreCredit(customerId, amount, currency, balance, expiresAt, sourceReturnId)` (D33 — data model Phase 04, flows Phase 05, full portal Phase 09)

### Access & audit
- `User(email, passwordHash, name, isActive, mfaSecret?, mfaEnabled, lastLoginAt)`
- `Role(key, nameI18n)` / `RolePermission(roleId, permission)` / `UserRole(userId, roleId, scope json {markets[], categories[], sections[]})` / `UserPermissionOverride(userId, permission, allow bool, scope json)`
- `AuditLog(userId, action, entityType, entityId, before json, after json, ip, createdAt)` — append-only, no update/delete
- `Job(...)`, `Backup(kind manual|scheduled|safety, status DONE|FAILED, offsiteStatus PENDING|OK|FAILED|NOT_CONFIGURED, offsiteSyncedAt?, fileKey, sizeBytes, dbSizeBytes, mediaIncluded, verifiedAt?, verifyResult json?, createdBy, startedAt, finishedAt, error, checksum)` — off-site failure is never silent (SystemAlert in production)
- `RestoreRequest(backupId?, uploadedFileKey?, mode FULL|DB_ONLY|MEDIA_ONLY, requestedBy, mfaVerifiedAt, status PENDING|VALIDATING|RUNNING|DONE|FAILED|CANCELLED, log text, startedAt, finishedAt)` — executed by the `ops` container only

Later phases add: Finance (`Account`, `JournalEntry`, `JournalLine`, `Expense`, `Partner`, `CapitalTransaction`, `LandedCost`), CRM (`Segment`, `Campaign`, `LoyaltyAccount`, `PointsTransaction`, `Coupon`, `Promotion`, `Review`), AI (`AiConversation`, `AiUsage`, `PromptVersion`, `Embedding`).

## 3. Backup & restore system (D23)

### 3.1 What gets backed up
1. **Database:** `pg_dump -Fc` (custom, compressed, restorable selectively).
2. **Media:** everything in the media bucket/volume (product images, receipts, invoices, logos).
3. **Config:** `.env` is **not** backed up automatically (secrets) — owner keeps it in a password manager; `docs/07_SETUP_GUIDE_FA.md` explains.

### 3.2 Schedule & retention
- Daily at 03:30 server time (configurable in admin `Settings → Backup`).
- Retention: 7 daily, 4 weekly, 6 monthly (configurable).
- Location: `/backups` volume on the server **and** off-site bucket (R2/B2/Hetzner Object Storage) via `mc mirror`. If off-site is not configured, admin System Health shows a warning.

### 3.3 Scripts (`scripts/backup/`) — run inside the `ops` container, never inside `app`
`ops` is built from the same `Dockerfile` (stage `ops`): node 20 + the app's `prisma/` folder (schema + migrations + CLI) + postgres-client 16 + `mc` + `zstd` + `jq` + `unzip` + `file`. It runs `prisma migrate deploy` itself. **It has no Docker socket.** It reaches the app only via HTTP (`/api/system/maintenance` with `MAINTENANCE_SECRET`, which also reports `inFlight` request count for draining).
- `backup.sh [--label TEXT] [--no-media] [--kind manual|scheduled|safety]` → `backups/YYYY-MM-DD_HHMM_<label>/{db.dump, media.tar.zst, manifest.json, checksums.sha256}`; manifest: projectId, app version, **full list of applied migrations**, media file count. `checksums.sha256` is computed **after** the manifest and **includes it** (explicit file list), so manifest fields cannot be tampered with unnoticed. Labels are sanitized to `[A-Za-z0-9._-]`. Writes a `Backup` row. Off-site mirror result recorded as `offsiteStatus = OK | FAILED | NOT_CONFIGURED`; in production anything but OK raises a CRITICAL `SystemAlert` (local backup still counts as done).
- `restore.sh <backup-dir|zip> --yes [--db-only] [--media-only]` — hardened contract:
  1. **Validate input (nothing touched yet)**: zip → `lib.sh:check_zip_archive` (reject absolute paths, `..`, > `MAX_FILES`; **real uncompressed size** summed from the per-entry size column of `unzip -Z -l` and cross-checked against the summary line — never `awk '{print $3}'` on `unzip -Zt`, which returns the word `bytes`); extract to a private temp dir; require `manifest.json` with matching `projectId`; verify `checksums.sha256`; **migration compatibility as a set check**: every migration listed in the manifest must exist in the code's `prisma/migrations` (no lexicographic name comparison); **media archive** → `lib.sh:check_tar_archive`: any symlink/hardlink/device/absolute/`..` entry rejects the whole restore; file count and **uncompressed byte total** (column 3 of `tar -tv`, space-safe) are capped by the same `RESTORE_MAX_*` limits (zip-bomb guard).
  2. **Maintenance mode ON is mandatory + drain**: call `/api/system/maintenance` with `MAINTENANCE_SECRET`, **abort if the app does not confirm** (no `|| true`); wait until `inFlight == 0` (max 60s). A `trap` guarantees: on failure maintenance stays ON and a CRITICAL `SystemAlert` is written; on success maintenance goes OFF.
  3. **Safety backup** (`--kind safety`) taken **while in maintenance** so it is a true point-in-time snapshot; abort if it fails.
  4. **DB restore** with `pg_restore --clean --if-exists --exit-on-error` inside a single transaction where possible (`--single-transaction`).
  5. **Atomic media restore**: extract to `media.restore-tmp` → validate **before swap** with the shared helper `lib.sh:validate_media_dir` (file count vs manifest, 25 sampled files non-empty with correct MIME, 25 sampled `Media.storageKey` rows of the just-restored DB exist on disk) → only then `mv media media.prev && mv media.restore-tmp media` → remove `media.prev` only after the final verify (keep on failure for recovery). `verify.sh --live` also re-runs the media validation on the live dir. `validate_media_dir` is **fail-closed**: if the `Media.storageKey` query fails for any reason the validation fails (exit 4); `MEDIA_DB_CHECK=skip` is honoured only when `NODE_ENV != production`.
  **Tests:** `scripts/backup/tests/run.sh` exercises every guard above with crafted archives and a stubbed `psql` (no DB needed) and runs in CI on every PR (D41).
  6. `prisma migrate deploy` run **directly inside `ops`** (it ships the app's `prisma/` folder), then `verify.sh --live`; any failure → exit non-zero, maintenance stays ON, alert raised.
  7. Maintenance OFF; write result to `RestoreRequest`.
- `prune.sh` applies retention.
- `verify.sh <backup> [--live]` (D36): restores into a temporary database `restore_check_<ts>`, then checks: `pg_restore` exit code; migration **set** in dump equals manifest; row counts for core tables > 0; FK/orphan queries (OrderItem→Order, Payment→Order, Variant→Product, StockItem→Variant); one sample Order loads with items; checksums; **media really extracted to a temp dir**, 25 sampled files checked for non-empty + correct MIME (`file --mime-type`), and 25 sampled `Media` rows checked to have a file in the archive. Result JSON stored in `Backup.verifyResult`. Weekly job.

### 3.4 Admin UI (`/admin/system/backups`) — Phase 05
- List of backups (date, size, kind, verified ✔/✖ with details, off-site ✔/✖).
- Buttons: **Backup now** (job in `ops`), **Download** (signed URL), **Upload backup file** (chunked, size-capped, stored quarantined until validated), **Request restore**.
- Restore request: only `owner` role; requires re-entering password + TOTP; shows exactly what will be replaced; creates `RestoreRequest`. The web app **never** runs `pg_restore` itself; the `ops` container polls `RestoreRequest` (or is triggered by the cron service) and streams its log back to the request row, visible live in admin.
- Backup settings: time, retention, off-site target status (credentials stay in env — D31), include media yes/no.

### 3.5 Uploading a backup (owner's requirement)
Owner can upload any previously downloaded backup zip from this system and request a restore. Validation per §3.3 step 1 happens before anything else; invalid files are rejected with a clear reason.

### 3.6 Off-site backup is a launch condition (D23)
Postgres + MinIO + `/backups` on one VPS = one failure domain. Production **must** have off-site mirroring to a provider independent from the hosting provider (e.g., Backblaze B2, Cloudflare R2, Wasabi). `System Health` shows a red alert and `Launch checklist` fails if it is not configured or the last mirror is older than 36h.

### 3.7 Migration safety
- Every phase's migrations are additive where possible. Destructive changes require a two-step migration (add → backfill → drop in a later phase) and a note in PROGRESS.md.
- `prisma migrate deploy` runs automatically on container start (`entrypoint.sh`), after a pre-migration backup taken by `ops`.

---

## خلاصهٔ فارسی برای مهدی
- همهٔ اطلاعات (محصول، سفارش، مشتری، تنظیمات، نرخ‌ها) در یک دیتابیس PostgreSQL است؛ عکس‌ها و فیش‌ها در انبار فایل.
- **هر شب** خودکار یک نسخهٔ کامل از دیتابیس + فایل‌ها گرفته می‌شود، روی سرور نگه داشته می‌شود و یک کپی هم به یک فضای ابری خارجی می‌رود.
- در پنل ادمین صفحهٔ «بکاپ» دارید: بکاپ فوری، دانلود، آپلود یک بکاپ قدیمی و **درخواست بازگردانی** (با رمز + کد MFA؛ قبل از بازگردانی خودکار یک بکاپ امنیتی گرفته می‌شود). خود بازگردانی را یک «کارگر جداگانه» (کانتینر ops) انجام می‌دهد، نه خود سایت — تا اگر وسط کار مشکلی شد، سایت و داده‌های فعلی آسیب نبینند.
- کپی خارجی بکاپ (روی یک سرویس جدا از هاست) **شرط لانچ** است، نه اختیاری.
- هفته‌ای یک‌بار سیستم خودش یک بکاپ را در یک دیتابیس آزمایشی باز می‌کند تا مطمئن شود بکاپ‌ها سالم‌اند.
- هیچ سفارش یا پرداختی هرگز حذف یا ویرایش نمی‌شود؛ فقط وضعیت می‌گیرد (لغو/باطل/مرجوع) و اصلاح با رکورد جبرانی انجام می‌شود.
