# وضعیت پیشرفت پروژه

> مکس (Claude Code): بعد از هر فاز این فایل را به‌روز کن. برای هر فاز بنویس: وضعیت، چه چیزی ساخته شد، **تست دستی به زبان ساده فارسی**، محدودیت‌های شناخته‌شده، سؤال‌ها برای مدیر پروژه.

| فاز | نام | وضعیت | تاریخ | PR |
|---|---|---|---|---|
| 00 | Foundation | ✅ Merge شده | ۲۰۲۶-۰۹-۰۳ | [#1](https://github.com/mehdi2044/HodaSite/pull/1) |
| 01a | Markets, Settings, Theme | ⬜ | | |
| 01b | Media Library | ⬜ | | |
| 01c | CMS & Storefront Design | ⬜ | | |
| 02 | Catalog & Storefront | ⬜ | | |
| — | **Checkpoint 1** (تست مهدی) | ⬜ | | |
| 03 | Pricing / FX / Fees / Inventory / Lot | ⬜ | | |
| 04 | Cart / Auth / Checkout / Payment | ⬜ | | |
| 05 | Shipping / Returns / RBAC / Backup-Restore | ⬜ | | |
| — | **Checkpoint 2** | ⬜ | | |
| 06 | Finance Core | ⬜ | | |
| 07 | AI Gateway / Data Entry | ⬜ | | |
| 08 | SEO / PWA / Performance / Launch Checklist | ⬜ | | |
| — | **Checkpoint 3 — Soft Launch** | ⬜ | | |
| 09 | CRM / Promotions / Loyalty | ⬜ | | |
| 10 | AI Shopping Agent | ⬜ | | |
| — | **Checkpoint 4** | ⬜ | | |
| 11 | Visual / Voice / Try-On / App | ⬜ | | |
| — | **Checkpoint 5** | ⬜ | | |

وضعیت‌ها: ⬜ شروع نشده · 🟡 در حال انجام · 🔍 در بازبینی · ✅ Merge شده · 🧪 تست‌شده توسط مهدی

---

## Backlog (موارد غیرمسدودکننده — منتقل‌شده از فازها)

_کارهایی که هیچ فازی را بلاک نمی‌کنند ولی نباید فراموش شوند. وقتی هرکدام انجام شد، خط بزنید و شمارهٔ PR را بنویسید._

- **هشدار Edge Runtime از JOSE / Auth.js:** هنگام بیلد، `jose` (وابستهٔ Auth.js) دربارهٔ APIهای Node در Edge Runtime هشدار می‌دهد. `middleware` فعلاً فقط امضای JWT را verify می‌کند و درست کار می‌کند؛ پیش از اینکه منطق سنگین‌تری به middleware اضافه شود باید بررسی شود. (فاز ۰۰، بخش A1.)
- **مهاجرت از `package.json#prisma` به `prisma.config.ts`:** Prisma این کلید را در نسخه‌های بعدی deprecate می‌کند. الان کار می‌کند؛ در یک فاز آینده منتقل شود.
- **چهار ناحیهٔ هنوز اصلاً راستی‌آزمایی‌نشده** (از «وضعیت راستی‌آزمایی» فاز ۰۰):
  - `S3Storage` روی MinIO / R2 واقعی — مسیر `s3` فقط در کد هست؛ smoke با `STORAGE_PROVIDER=local` اجرا شده، هرگز روی یک S3 واقعی نه.
  - mirror off-site بکاپ — `mc` نصب است ولی `BACKUP_OFFSITE_ENDPOINT` هرگز با یک مقصد واقعی تست نشده (OB6).
  - auto-HTTPS واقعی Caddy روی یک دامنهٔ واقعی.
  - اجباری‌کردن MFA / TOTP — طبق برنامه فاز ۰۵.
- **فلاکی‌بودن e2e موازی محلی:** `playwright.config.ts` فقط در CI (`isCI`) ورکرها را به ۱ محدود می‌کند؛ محلی به‌صورت پیش‌فرض موازی اجرا می‌شود و specهایی که وضعیت global (مثل maintenance) را toggle می‌کنند می‌توانند با تست‌های دیگر تداخل کنند. جدا از این، اولین برخورد با هر route روی `next dev` (کامپایل lazy) گاهی از تایم‌اوت پیش‌فرض ۵s در `expect(page).toHaveURL` عبور می‌کند و تست را قرمز نشان می‌دهد در حالی که ورود واقعاً موفق بوده (چند ثانیه دیرتر). راه‌حل فعلی: هر spec را جدا/سریال اجرا کنید، یا یک‌بار همهٔ route های مربوطه را گرم کنید. اصلاح واقعی (فاز آینده): `workers` محلی هم برای specهای toggle‌کننده به ۱ محدود شود یا آن specها با `test.describe.configure({ mode: "serial" })` ایزوله شوند.
- **تداخل `pnpm typecheck` با `next dev` زنده:** وقتی `next dev` در حال اجراست (مثلاً داخل کانتینر `app` با bind mount)، فایل تولیدی `.next/types/validator.ts` به مسیرهای `.js` کامپایل‌شده اشاره می‌کند که `tsc --noEmit` مستقیم (بدون زیرساخت resolve خود Next) نمی‌تواند پیدا کند، پس `pnpm typecheck` وقتی `.next/` تازه توسط یک `next dev` زنده ساخته شده fail می‌کند. غیرمرتبط با ویندوز یا این PR؛ یا قبل از typecheck دستی `.next` را پاک کنید، یا typecheck را وقتی dev server خاموش است اجرا کنید.

---

## گزارش فازها

### Phase 00

#### بازبینی دور اول — رفع ایرادها (Review round 1)

مرجع: `docs/reviews/PHASE00_FIX_ORDER.md`. کارها به ترتیب A → B → C انجام می‌شود؛ CI باید بعد از هر push سبز بماند.

| مورد | وضعیت | خلاصهٔ تغییر |
|---|---|---|
| A0 | ✅ | اسکیمای Prisma تک‌خطی بود و `prisma validate` با ۲۶ خطا رد می‌کرد؛ چندخطی شد، مایگریشن خالی (۰ بایت) با نسخهٔ واقعی (DDL کامل + FK + ایندکس) و `migration_lock.toml` جایگزین شد، و `postinstall: prisma generate` اضافه شد (pnpm 10 اسکریپت‌های وابستگی‌ها را اجرا نمی‌کند). |
| C3 | ✅ | (جلو کشیده شد) e2e در CI روی بیلد استاندالون اجرا می‌شود نه `next dev`؛ probe روی `/fa`؛ مرورگر Chromium. |
| A1 | ✅ | `src/middleware.ts` مسیرهای `/admin/*` (به‌جز `/admin/login`) را با **تأیید امضای JWT** محافظت می‌کند و کاربر بدون نشست را به `/admin/login?next=…` می‌فرستد. صفحه‌های محافظت‌شده زیر `admin/(dashboard)/` رفتند و لایهٔ آن‌ها نشست را دوباره روی سرور بررسی می‌کند (دفاع لایه‌ای). |
| A4 | ✅ | صفحهٔ ورود یک کامپوننت کلاینت شد که `signIn("credentials", …)` را صدا می‌زند، حالت loading و خطای درون‌خطی دارد و `next` را رعایت می‌کند. دکمهٔ «خروج» در پوستهٔ ادمین. تست‌های Playwright: ورود owner نمونه → داشبورد، و ریدایرکت `/admin` بدون نشست. |
| A2 | ✅ | هر Server Action ادمین با `auth()` + `assertCan(...)` شروع می‌شود (`saveBrand` → `settings.brand.edit`، `saveTheme` → `settings.theme.edit`) و رکورد AuditLog با `userId` واقعی می‌نویسد. مجوزها (`settings.brand.edit`، `settings.theme.edit`، `users.view`، `users.manage`، `media.upload`، `system.health.view`) برای `owner` و `admin` seed می‌شوند. تست واحد `tests/unit/admin-authz.spec.ts` تمام `src/app/admin/**/actions.ts` را glob می‌کند، **اگر صفر فایل پیدا شود fail می‌کند**، و fail می‌کند اگر فایلی `assertCan` نداشته باشد. Route handler ادمینی وجود ندارد؛ `/api/uploads` در A3. |
| A3 | ✅ | `/api/uploads` حالا نشست معتبر با مجوز `media.upload` می‌خواهد (بدون نشست → 401، بدون مجوز → 403). محتوای واقعی فایل با magic bytes (`file-type`) بررسی می‌شود و اگر نوع sniff‌شده در allow-list نباشد رد می‌شود (415). پسوند فایل ذخیره‌شده از **MIME تأییدشده** می‌آید نه از نام فایل کاربر؛ نام اصلی فقط در `Media.originalName`. سقف ۵MB و allow-list حفظ شد. تست‌های e2e: 401 بدون نشست، آپلود PNG واقعی → 201، فایل متنی با نام `.png` → 415. |
| A8 | ✅ | شمارندهٔ واقعی in-flight (`src/lib/request-metrics.ts`) — **per-instance، فرض تک‌کانتینر** (در فایل مستند شده). چون middleware نکست هوک «پایان پاسخ» ندارد، شمارش دور کار واقعی mutation انجام می‌شود (Server Actionها از طریق `withMutation`، و route handlerهای `uploads` و `cron/tick`). `GET /api/system/maintenance` مقدار واقعی `inFlight` را برمی‌گرداند. در حالت تعمیرات، نوشتن با 503 رد می‌شود؛ `/admin` و خود endpoint تعمیرات باز می‌مانند. یک گیت جلویی هم در middleware هست. |
| A8 (اصلاح بعد از بازبینی Vee) | ✅ | **رفع TOCTOU:** در `withMutation` و هر دو route handler، ترتیب برعکس شد — اول `enterRequest()`، بعد چک تعمیرات، و `leaveRequest()` در `finally`. پس یک restore هرگز `inFlight: 0` را در فاصلهٔ «چک تعمیرات» و «افزایش شمارنده» نمی‌بیند. **حذف کش کهنه از مسیر نوشتن:** وضعیت تعمیرات از یک flag درون‌پروسه می‌آید که `POST /api/system/maintenance` هم‌زمان (بدون رفت‌وبرگشت DB) ست می‌کند؛ DB فقط برای hydrate در cold start. تست قطعی (نه زمان‌محور): `tests/unit/mutation-gate.spec.ts` — یک mutation که بدنه‌اش روی promise کنترل‌شده بلاک است، flip تعمیرات، assert که `inFlight` همیشه ۱ است (نه ۰)، mutation جدید بعد از flip با `MaintenanceError` رد می‌شود و شمارنده را دست‌نخورده می‌گذارد، سپس release و بازگشت به ۰؛ و مسیر `finally` وقتی `fn()` throw می‌کند. |
| A5 | ✅ | `docker-compose.yml` بازنویسی شد به کامپوز واقعی تولید: `target: runner`، بدون mount سورس، بدون `pnpm dev`، بدون mailpit، بدون پورت روی هاست برای `app` (فقط از پشت Caddy)، همهٔ اعتبارنامه‌ها از `.env`. سرویس‌ها: `postgres`, `minio`, `migrate` (یک‌بار، از image `ops`)، `app`, `cron`, `ops`, `caddy`. `docker-compose.dev.yml` دست‌نخورده ماند — **به‌جز** یک اصلاح حداقلی YAML در دستور `cron` که با پارسر Go در Docker Compose v2 اصلاً parse نمی‌شد (`command` به شکل exec-list). |
| A6 | ✅ | `public/fonts/vazirmatn/` و `public/fonts/inter/` با فایل‌های woff2 واقعیِ variable از `@fontsource-variable/*` (وزن ۱۰۰–۹۰۰) + فایل LICENSE (هر دو SIL OFL 1.1). `scripts/vendor-fonts.mjs` برای به‌روزرسانی. `@font-face` در `tokens.css` با `unicode-range` درست بازنویسی شد؛ دیگر placeholder نیست. |
| A7 | ✅ | Dockerfile: در stage `deps` قبل از install، `COPY prisma ./prisma` جدا اضافه شد (postinstall به schema نیاز دارد)؛ در stage `ops` سه خط جدا `COPY package.json ./` / `COPY prisma ./prisma` / `COPY scripts ./scripts` جایگزین `COPY package.json prisma scripts /app/` شد تا `schema.prisma` در `/app/prisma/` بنشیند و step 6 restore.sh کار کند. `entrypoint.sh` فقط سرور را استارت می‌کند؛ مایگریشن به سرویس `migrate` (image ops، دارای Prisma CLI) منتقل شد. `scripts/deploy.sh` حالا `/app/scripts/backup/backup.sh` را صدا می‌زند. |
| **بخش A** | ✅ **کامل و تأییدشده** | A0–A8 + اصلاح TOCTOU در A8 (یافتهٔ Vee). A1–A7 توسط هر دو بازبین تأیید شد. |
| B1 | ✅ | `Money.#amount` واقعاً private شد؛ سطح عمومی: `add/sub/mul/percent/round/compare/toString/format` — هیچ متدی `number` نمی‌گیرد/برنمی‌گرداند. قانون ESLint `no-restricted-syntax` (`Number(`، `parseFloat(`، `.toNumber(`) به `src/modules/{pricing,fees,orders,finance}` محدود شد + `tests/unit/eslint-money-rule.spec.ts` وجودش را ساختاری چک می‌کند. تست پوشه‌اسکن حذف شد. |
| B2 | ✅ | `can(userId, permission, scope?: { marketId?, categoryId?, section? })` و `assertCan(...)` هم‌امضا. تطبیق: grant بدون scope = «همهٔ scopeها»؛ grant دارای scope فقط وقتی مطابق است که هر کلیدِ موجود در grant با مقدار درخواست برابر باشد (درخواستِ بدون scope با grant دارای scope مطابق نیست). override با deny در scope مطابق، بلاک می‌کند. `scopeMatches` export و مستقیم تست شد + تست `can()` با mock دیتابیس: مثبت داخل scope، منفی خارج scope، منفی بدون scope. اجرای سطح کوئری = فاز ۰۵. |
| B3 (صفحهٔ کاربران) | ✅ | ساخت/ویرایش/غیرفعال‌کردن کاربر پیاده شد: `src/app/admin/(dashboard)/users/{page,new,[id]}` + `actions.ts` با `auth()` + `assertCan(..., "users.manage")` + اعتبارسنجی Zod + `withMutation` + رکورد AuditLog برای هر عملیات. کاربر غیرفعال نمی‌تواند وارد شود (در `authorize()` چک می‌شود). تست e2e سریالی: owner یک کاربر می‌سازد → کاربر می‌تواند وارد شود → owner غیرفعالش می‌کند → دیگر نمی‌تواند وارد شود. |
| B4 | ✅ | مجموعهٔ اجزای پایه در `src/components/ui`: `Button` (۴ حالت/۲ اندازه)، `Input`، `Select`، `Card`، `Badge`، `Table`، `Dialog` (روی `<dialog>` نیتیو)، `Sheet` (پنل کشویی)، `Toast` (`ToastProvider` + `useToast`). همه با Tailwind + توکن‌ها. صفحهٔ `/admin/design` همه را نمایش می‌دهد؛ فرم‌های `settings/brand`، `settings/theme`، `users/new`، `users/[id]` از این اجزا استفاده می‌کنند. تست e2e: لاگین → `/admin/design` → باز کردن Dialog. |
| B5 | ✅ | Tailwind v4 کامل نصب شد: `@tailwindcss/postcss` + `postcss.config.mjs`؛ `@theme inline` در `tokens.css` توکن‌ها را به utility‌ها وصل می‌کند (`bg-primary`، `text-muted`، `rounded-token`). CSS بیلدشده حاوی کلاس‌های واقعی Tailwind است (تأییدشده). |
| B6 | ✅ | `next-intl` واقعاً سیم‌کشی شد: `createNextIntlPlugin` در `next.config.ts`، `src/i18n/{routing,request}.ts`، middleware locale برای storefront (و دست‌نگه‌داشتن از `/admin` و `/api`)، `[locale]/layout.tsx` با `NextIntlClientProvider`، و `layout.tsx` ریشه `<html lang dir>` را از `getLocale()` می‌سازد. `[locale]/page.tsx` از `getTranslations()` استفاده می‌کند نه `import()` دستی. `/` → `/fa`؛ `/fa` → `lang=fa dir=rtl`، `/en` → `lang=en dir=ltr`، `/fa/xx` → 404، `/admin/login` → `lang=fa dir=rtl`. صفحه‌های storefront عمداً `force-dynamic` ماندند تا تغییر برند/رنگ بدون rebuild دیده شود. |
| B7 | ✅ | `catch {}` خالی حذف شد: `getAppearance()`، `admin/users/page.tsx` و `admin/system/health` حالا خطا را `console.error` می‌کنند و حالت خطا نشان می‌دهند. `/api/health` وقتی دیتابیس در دسترس نیست **status 503** با فیلد `reason` برمی‌گرداند (وقتی سالم است 200 + `db/storage/lastBackup/lastFx`). تست e2e مسیر سالم را چک می‌کند. |
| B8 | ✅ | `runJobs` جاب‌ها را در یک تراکنش با `SELECT ... FOR UPDATE SKIP LOCKED` (raw SQL) claim می‌کند و بعد به `RUNNING` می‌برد؛ دو runner همزمان هرگز یک ردیف را برنمی‌دارند. `registerJobHandler` اضافه شد. تست: `tests/integration/jobs-lock.spec.ts` — دو/سه runner همزمان روی ۱ و ۶ جاب pending؛ هندلر دقیقاً یک‌بار به‌ازای هر جاب اجرا می‌شود. **CI-only** (به Postgres نیاز دارد؛ روی این ماشین skip می‌شود). |
| B9 | ✅ | همه‌جا `STORAGE_PROVIDER` (نه `STORAGE_DRIVER`): `storage/index.ts`، `api/health`، `admin/system/health`، `prisma/seed.ts`، `.env.example`، `docs/07_SETUP_GUIDE_FA.md`. **کامنت‌های درون‌خطی از `.env.example` حذف شد** — هر مقدار دیگر `# ...` را جذب نمی‌کند (تأیید با `docker compose config`: `BACKUP_OFFSITE_ENDPOINT: ""`). مقدارها `local | s3` (MinIO و R2 هر دو `s3`). |
| B10 | ✅ | `src/app/media/[...key]/route.ts` فایل‌های نوشته‌شده توسط `LocalStorage` را سرو می‌کند (و در `s3` به presigned URL ریدایرکت). `middleware` مسیر `/media/` را کنار می‌گذارد تا locale-redirect نشود. kindهای خصوصی (`receipt`، `backup`) نشست + مجوز `media.upload` می‌خواهند، وگرنه 404 (بدون لو دادن وجود فایل). `getBytes` به `StorageProvider` اضافه شد. تست e2e: بعد از آپلود، فایل با 200 و `content-type: image/png` و بایت‌های یکسان سرو می‌شود. |
| B11 | ✅ | همهٔ ۳ نقطهٔ `auditLog.create` (brand/theme/users) `userId` واقعی می‌نویسند (در A2/B3 انجام شد). مایگریشن `20260903000000_auditlog_append_only`: `DROP COLUMN "updatedAt"` + تریگر Postgres که `UPDATE`/`DELETE` روی `AuditLog` را با EXCEPTION رد می‌کند (append-only، D24). `updatedAt` از مدل حذف شد. تست integration: INSERT مجاز، UPDATE و DELETE رد می‌شوند. |
| B12 | ✅ | فلگ `--rollback` از `scripts/deploy.sh` حذف شد (فقط pull+restart بود، rollback واقعی نبود). **به فاز ۰۵ موکول شد:** rollback واقعی = تگ‌کردن image به‌ازای هر دیپلوی + نگه‌داشتن تگ قبلی + بازگردانی از بکاپ امنیتیِ پیش‌ازدیپلوی هنگام شکست. تا آن زمان: `restore.sh` داخل `ops`. `docs/07_SETUP_GUIDE_FA.md` هم به‌روز شد. |
| بخش B | ✅ **کامل و تأییدشده** | B1–B12؛ Vee بخش A را رسماً بست و بخش B را تأیید کرد. |
| C1 | ✅ | معنای `Money.round` در doc comment نوشته شد و با تست پین شد: نزدیک‌ترین مضرب `increment` (mode نصفِ دقیق را می‌شکند)؛ با `ending`، نزدیک‌ترین نقطهٔ charm `m·increment + ending`. تست‌های مرزی: `increment "1000"` + ending؛ مقدار زیر ending (کلمپ به ≥ ending، هرگز منفی برای مبلغ نامنفی)؛ دقیقاً روی مرز (13.49 → HALF_UP 13.99 / HALF_EVEN 12.99)؛ HALF_UP/HALF_EVEN روی `.5` (با منفی)؛ مبلغ منفی (-13.20 → -13.01). **یک باگ پیدا و رفع شد:** کد قبلی همیشه به سطل charm پایین‌تر می‌افتاد وقتی `bucket + ending` از مبلغ بیشتر می‌شد → ۱۳.۷۰ می‌شد ۱۲.۹۹ (کاهش یک واحد کامل) و فرض `increment === 1` داشت. ۱۳.۲۰ → ۱۲.۹۹ تغییری نکرد. |
| C2 | ✅ | نقش‌های غیر-owner واقعاً least-privilege seed می‌شوند: مجموعهٔ حداقلیِ هر نقش (`admin/data_entry/warehouse/accountant/support/marketing`)؛ هیچ‌کدام `security.role.manage` ندارند، فقط admin `users.manage`. `tests/integration/role-least-privilege.spec.ts` از طریق `can()` چک می‌کند هر نقش چه چیزی باید داشته باشد و چه چیزی **نباید** (warehouse ≠ ویرایش قیمت/مدیریت کاربر، data_entry ≠ publish/دیدن هزینه، support ≠ مدیریت مجوز)، و یک مورد منفی را از طریق یک server action واقعی (`saveTheme` کاربر warehouse را با `FORBIDDEN` رد می‌کند). |
| C4 | ✅ | توضیح PR #1 و همین فایل بازنویسی شدند تا فقط ادعاهای راستی‌آزمایی‌شده داشته باشند؛ ادعای غلط ۴۰۳ Prisma رد شد؛ تقسیم سه‌طرفهٔ زیر. |
| D — runtime واقعی Docker | ✅ | job جدید `docker-runtime` در `.github/workflows/ci.yml` (باید در branch protection **required** شود). `scripts/ci/runtime-smoke.sh` + `ops-restore-cycle.sh` + `ops-negative-guards.sh`: `.env` با رازهای تصادفی واقعی → `docker compose up -d --wait` → تأیید اجرای مایگریشن‌ها روی Postgres واقعی و `/api/health: db ok` → seed → یک چرخهٔ کامل داخل `ops`: `backup.sh` → `verify.sh` → تغییر ردیف → `restore.sh --yes` → assert بازگشت ردیف + وجود بکاپ امنیتی + خاموش‌شدن maintenance + اجرای `prisma migrate deploy` از داخل ops بدون Docker socket + بازگشت فایل media بعد از swap اتمیک. موارد منفی: `run.sh` داخل image واقعی، zip با `../evil` رد، media tar با symlink رد، `manifest.json` دستکاری‌شده در checksum شکست می‌خورد. `down -v` + آپلود لاگ‌ها به‌عنوان artifact. Dockerfile ops حالا `zip` و `mc` هم دارد. `verify.sh` برای فاز فعلی سازگار شد (Market/User اجباری؛ Product/Variant فقط اگر موجود باشند). `app` در compose تولید حالا healthcheck دارد. |

**وضعیت راستی‌آزمایی (Phase 00 review round 1 — نهایی، پایان C + D):**

_این ماشین ویندوز است و Postgres/Docker daemon ندارد؛ هر چیزی که به آن‌ها نیاز دارد فقط در CI اجرا می‌شود._

- **محلی اجرا شد و سبز:** `prisma validate` · `prisma format --check` · `pnpm lint` · `pnpm typecheck` · `pnpm test` (۳۲ تست unit؛ ۸ تست integration که بدون `DATABASE_URL` خودشان skip می‌شوند) · `docker compose -f … config` هر دو فایل · `bash -n` روی همهٔ اسکریپت‌های شل. Smoke با `next dev`: گارد `/admin` + ریدایرکت `?next=`، مسیر locale (`/`→`/fa`، `<html lang dir>`، `/fa/xx`→۴۰۴)، سرو فونت‌ها + LICENSE، `/media/*` بدون locale-redirect، `/api/system/maintenance*` و ۴۰۱‌ها.
- **فقط در CI اجرا شد و سبز:**
  - job `checks`: `prisma migrate deploy` (هر دو مایگریشن) + `db seed` روی Postgres 16، `pnpm build` کامل، `bash scripts/backup/tests/run.sh`، `pnpm e2e` (۱۶ تست)، و تست‌های integration روی Postgres واقعی: `jobs-lock` (FOR UPDATE SKIP LOCKED، دو/سه runner همزمان)، `audit-append-only` (trigger)، `role-least-privilege` (۸ تست شامل رد یک server action واقعی).
  - job `docker`: `docker build --target runner .` و `--target ops .`، بررسی `schema.prisma` + Prisma CLI در image ops، `docker compose config`.
  - job `docker-runtime` (**باید در branch protection required شود**): استک تولید کامل بالا می‌آید با `.env` رازهای تصادفی؛ مایگریشن‌ها روی کانتینر Postgres واقعی اجرا شده‌اند؛ `app` سالم است و `/api/health: db ok` می‌دهد و پورت هاست ندارد؛ seed (۳ بازار)؛ `ops` بدون Docker socket؛ چرخهٔ کامل داخل `ops`: `backup.sh --kind manual` → `verify.sh` → تغییر ردیف → `restore.sh --yes` → assert بازگشت ردیف + بکاپ امنیتی + خاموش‌شدن maintenance + swap اتمیک media + `prisma migrate deploy` از داخل ops؛ موارد منفی: `run.sh` در image واقعی، zip با `../evil` رد، media tar با symlink رد، `manifest.json` دستکاری‌شده در checksum شکست. لاگ compose/ops به‌عنوان artifact آپلود می‌شود، سپس `down -v`.
- **هنوز اصلاً راستی‌آزمایی نشده:** رفتار عملیِ `S3Storage` روی MinIO/R2 واقعی (مسیر `s3` در کد هست و در `/media/*` به presigned URL ریدایرکت می‌کند، ولی هرگز روی یک S3 واقعی اجرا نشده — smoke با `STORAGE_PROVIDER=local` است)؛ mirror off-site بکاپ (`mc` نصب شده ولی `BACKUP_OFFSITE_ENDPOINT` در smoke خالی است → `NOT_CONFIGURED`)؛ auto-HTTPS واقعی Caddy با دامنهٔ واقعی؛ MFA/TOTP (طبق برنامه فاز ۰۵).

**باگ‌هایی که job `docker-runtime` پیدا کرد و رفع شد:** (۱) image runner بدون `openssl` → کرش Prisma؛ (۲) `postgresql-client` نسخهٔ ۱۵ در ops در برابر Postgres 16؛ (۳) `--arg label` در `backup.sh` روی jq 1.7+؛ (۴) `/data/media` به‌عنوان mount point → swap اتمیک ناممکن؛ (۵) فرض ستون در `zip_uncompressed_bytes` روی `unzip` دبیان.

**یادداشت ADR پیشنهادی (شمارهٔ D توسط پیکسل بعد از بازبینی وی‌بانو):**
نشست ادمین از استراتژی **JWT** استفاده می‌کند، نه `session.strategy: "database"`، چون Auth.js v5 از Credentials provider با نشست دیتابیسی پشتیبانی نمی‌کند (خطای صریح: «Credentials provider is present but the JWT strategy is not enabled»). جدول‌های `Account`/`Session` در اسکیما می‌مانند برای جریان magic-link مشتری در فاز ۰۴. عمر نشست کوتاه است: **۸ ساعت** (`SESSION_MAX_AGE_SECONDS` در `src/modules/auth/config.ts`). `AUTH_SECRET` اجباری است و بدون آن سرور بالا نمی‌آید (`src/instrumentation.ts`)؛ هیچ مقدار پیش‌فرضی در کد نیست.

**احراز هویت ≠ مجوز.** امضای معتبر JWT به‌تنهایی هرگز نباید دسترسی بدهد: غیرفعال‌کردن یک کاربر یا تغییر مجوزهایش باید فوری اثر کند، مستقل از عمر ۸‌ساعتهٔ توکن. امروز `can()` کاربر را در هر اکشنِ مجازشده از دیتابیس می‌خواند و `isActive` را چک می‌کند، پس مسیر اکشن پوشش داده شده است. **پیگیری فاز ۰۵:** `sessionVersion` / ابطال توکن (تا آن زمان، فقط دیدن صفحه‌های ادمین ممکن است تا انقضای توکن عقب بیفتد؛ هیچ اکشنی اجرا نمی‌شود).

### تصمیم‌های گرفته‌شده در طول کار
_(هر تغییر کوچکی که Claude/مهدی در طول فازها تأیید کردند اینجا ثبت شود؛ تغییرات بزرگ به `02_DECISIONS.md` می‌رود)_

#### وضعیت
✅ **Merge شده — ۳ سپتامبر ۲۰۲۶.** PR [#1](https://github.com/mehdi2044/HodaSite/pull/1) (merge commit `eddded2`)؛ هر دو بازبین (Pixel + Vee) تأیید کردند؛ CI هر سه job سبز؛ شاخهٔ فاز حذف شد. سه ADR ثبت شد: D42 (نشست JWT ادمین)، D43 (rollback واقعی → فاز ۰۵)، D44 (انضباط برنچ).

#### چه چیزی ساخته شد
- اسکلت Next.js 15 سه‌زبانه با `next-intl` واقعاً سیم‌کشی‌شده، RTL از طریق `<html dir>`، تم دیتابیس‌محور، Tailwind v4 + مجموعهٔ اجزای `src/components/ui`.
- پنل مدیریت پشت **middleware با تأیید امضای JWT**: ورود مدیر کارآمد، CRUD کاربر (ساخت/ویرایش/غیرفعال‌سازی)، تنظیم برند/رنگ، صفحهٔ اجزا، سلامت سیستم. هر Server Action با `auth()` + `assertCan()` و AuditLog.
- PostgreSQL/Prisma با دو مایگریشن (اسکیمای اولیه + `AuditLog` فقط-افزودنی با trigger)، نقش‌ها با **least-privilege** و `can()` scope-aware، صف کار با `SELECT … FOR UPDATE SKIP LOCKED`، ذخیره‌سازی local/S3 با سرو `/media/*` و آپلود magic-byte، دادهٔ نمونهٔ سه بازار.
- Docker: `docker-compose.yml` تولید واقعی (فقط پشت Caddy، سرویس `migrate` یک‌بار، `ops` بدون Docker socket)، `docker-compose.dev.yml`، بکاپ/ریستور سخت‌گیری‌شده. سه job در CI: `checks`، `docker`، `docker-runtime` (استک واقعی + چرخهٔ بکاپ/ریستور).
- `Money` نوع بستهٔ Decimal با معنای گردکردن مستند و پین‌شده؛ ثابت‌ماندن snapshot نرخ ارز.

#### تست دستی ساده (روی سرور یا هر ماشین دارای Docker)
1. `cp .env.example .env`؛ در `.env` این‌ها را پر کنید: `AUTH_SECRET` (خروجی `openssl rand -base64 33`)، `POSTGRES_PASSWORD`، `CRON_SECRET`، `MAINTENANCE_SECRET`، و رمز مدیر (`ADMIN_PASSWORD`). کامنت درون‌خطی ننویسید.
2. `docker compose -f docker-compose.dev.yml up --build`.
3. در موبایل `http://localhost:3000/` را باز کنید → به `/fa` می‌رود و راست‌چین است. `/tr` و `/en` چپ‌چین.
4. `http://localhost:3000/admin` → به صفحهٔ ورود می‌رود. با ایمیل/رمز `.env` وارد شوید → داشبورد.
5. در «کاربران» یک کاربر جدید بسازید، وارد شوید، سپس غیرفعالش کنید → دیگر نمی‌تواند وارد شود.
6. در «برند» نام سایت و در «پوسته» رنگ اصلی را عوض کنید؛ صفحهٔ فروشگاه (`/fa`) را تازه کنید → تغییر دیده می‌شود (بدون rebuild).
7. `http://localhost:3000/api/health` → `{"db":"ok", …}` با کد ۲۰۰ (اگر دیتابیس قطع باشد کد ۵۰۳ و فیلد `reason`).
8. داخل `ops`: `docker compose -f docker-compose.dev.yml exec ops bash scripts/ci/ops-restore-cycle.sh` → چرخهٔ کامل بکاپ/verify/restore.

#### محدودیت‌های شناخته‌شده
- کاتالوگ، قیمت‌گذاری، سبد و ورود مشتری عمداً مربوط به فازهای بعدی‌اند.
- MFA/TOTP در اسکیما آماده است؛ اجباری‌کردن در فاز ۰۵. ابطال فوری توکن (`sessionVersion`) هم فاز ۰۵ — تا آن زمان فقط *دیدن* صفحه‌های ادمین ممکن است تا انقضای توکن (۸ ساعت) عقب بیفتد؛ هیچ اکشنی اجرا نمی‌شود چون `can()` هر بار `isActive` را چک می‌کند.
- `S3Storage` روی MinIO/R2 واقعی و mirror off-site بکاپ هنوز اجرا نشده (بخش «تست‌نشده» بالا).
- `deploy.sh --rollback` حذف شد؛ rollback واقعی فاز ۰۵ (B12).
