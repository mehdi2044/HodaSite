# وضعیت پیشرفت پروژه

> Codex: بعد از هر فاز این فایل را به‌روز کن. برای هر فاز بنویس: وضعیت، چه چیزی ساخته شد، **تست دستی به زبان ساده فارسی**، محدودیت‌های شناخته‌شده و سؤال‌های باز برای وی‌بانو/مهدی.

| فاز | نام                                        | وضعیت           | تاریخ      | PR                                                 |
| --- | ------------------------------------------ | --------------- | ---------- | -------------------------------------------------- |
| 00  | Foundation                                 | ✅ Merge شده    | ۲۰۲۶-۰۹-۰۳ | [#1](https://github.com/mehdi2044/HodaSite/pull/1) |
| 01a | Markets, Settings, Theme                   | ✅ Merge شده    | ۲۰۲۶-۰۹-۰۵ | [#4](https://github.com/mehdi2044/HodaSite/pull/4) |
| 01b | Media Library                              | ✅ Merge شده    | ۲۰۲۶-۰۹-۰۸ | [#5](https://github.com/mehdi2044/HodaSite/pull/5) |
| 01c | CMS & Storefront Design                    | ✅ Merge شده    | ۲۰۲۶-۰۹-۰۹ | [#6](https://github.com/mehdi2044/HodaSite/pull/6) |
| 02  | Catalog & Storefront                       | ✅ Merge شده    | ۲۰۲۶-۰۹-۰۹ | [#7](https://github.com/mehdi2044/HodaSite/pull/7) |
| —   | **Checkpoint 1** (تست مهدی)                | ⏸ معوق          | ۲۰۲۶-۰۹-۰۹ | [#8](https://github.com/mehdi2044/HodaSite/pull/8) |
| 03  | Pricing / FX / Fees / Inventory / Lot      | ✅ Merge شده | ۲۰۲۶-۰۹-۱۰ | [#9](https://github.com/mehdi2044/HodaSite/pull/9) |
| 04  | Cart / Auth / Checkout / Payment           | ✅ Merge شده | ۲۰۲۶-۰۹-۱۰ | [#11](https://github.com/mehdi2044/HodaSite/pull/11) |
| 05  | Shipping / Returns / RBAC / Backup-Restore | 🟡 در حال انجام              |            |                                                    |
| —   | **Checkpoint 2**                           | ⬜              |            |                                                    |
| 06  | Finance Core                               | ⬜              |            |                                                    |
| 07  | AI Gateway / Data Entry                    | ⬜              |            |                                                    |
| 08  | SEO / PWA / Performance / Launch Checklist | ⬜              |            |                                                    |
| —   | **Checkpoint 3 — Soft Launch**             | ⬜              |            |                                                    |
| 09  | CRM / Promotions / Loyalty                 | ⬜              |            |                                                    |
| 10  | AI Shopping Agent                          | ⬜              |            |                                                    |
| —   | **Checkpoint 4**                           | ⬜              |            |                                                    |
| 11  | Visual / Voice / Try-On / App              | ⬜              |            |                                                    |
| —   | **Checkpoint 5**                           | ⬜              |            |                                                    |

وضعیت‌ها: ⬜ شروع نشده · 🟡 در حال انجام · 🔍 در بازبینی · ✅ Merge شده · 🧪 تست‌شده توسط مهدی

---

## Backlog (موارد غیرمسدودکننده — منتقل‌شده از فازها)

_کارهایی که هیچ فازی را بلاک نمی‌کنند ولی نباید فراموش شوند. وقتی هرکدام انجام شد، خط بزنید و شمارهٔ PR را بنویسید._

- **هشدار Edge Runtime از JOSE / Auth.js:** هنگام بیلد، `jose` (وابستهٔ Auth.js) دربارهٔ APIهای Node در Edge Runtime هشدار می‌دهد. `middleware` فعلاً فقط امضای JWT را verify می‌کند و درست کار می‌کند؛ پیش از اینکه منطق سنگین‌تری به middleware اضافه شود باید بررسی شود. (فاز ۰۰، بخش A1.)
- **مهاجرت از `package.json#prisma` به `prisma.config.ts`:** Prisma این کلید را در نسخه‌های بعدی deprecate می‌کند. الان کار می‌کند؛ در یک فاز آینده منتقل شود.
- **چهار ناحیهٔ هنوز اصلاً راستی‌آزمایی‌نشده** (از «وضعیت راستی‌آزمایی» فاز ۰۰):
  - `S3Storage` روی مقصد staging/R2 واقعی — مسیر `s3` و سازگاری S3 روی MinIO واقعی در `docker-runtime` اثبات شده است؛ فقط اتصال به مقصد بیرونی نهایی staging/R2 هنوز آزموده نشده.
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

| مورد                          | وضعیت                  | خلاصهٔ تغییر                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0                            | ✅                     | اسکیمای Prisma تک‌خطی بود و `prisma validate` با ۲۶ خطا رد می‌کرد؛ چندخطی شد، مایگریشن خالی (۰ بایت) با نسخهٔ واقعی (DDL کامل + FK + ایندکس) و `migration_lock.toml` جایگزین شد، و `postinstall: prisma generate` اضافه شد (pnpm 10 اسکریپت‌های وابستگی‌ها را اجرا نمی‌کند).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| C3                            | ✅                     | (جلو کشیده شد) e2e در CI روی بیلد استاندالون اجرا می‌شود نه `next dev`؛ probe روی `/fa`؛ مرورگر Chromium.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| A1                            | ✅                     | `src/middleware.ts` مسیرهای `/admin/*` (به‌جز `/admin/login`) را با **تأیید امضای JWT** محافظت می‌کند و کاربر بدون نشست را به `/admin/login?next=…` می‌فرستد. صفحه‌های محافظت‌شده زیر `admin/(dashboard)/` رفتند و لایهٔ آن‌ها نشست را دوباره روی سرور بررسی می‌کند (دفاع لایه‌ای).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A4                            | ✅                     | صفحهٔ ورود یک کامپوننت کلاینت شد که `signIn("credentials", …)` را صدا می‌زند، حالت loading و خطای درون‌خطی دارد و `next` را رعایت می‌کند. دکمهٔ «خروج» در پوستهٔ ادمین. تست‌های Playwright: ورود owner نمونه → داشبورد، و ریدایرکت `/admin` بدون نشست.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A2                            | ✅                     | هر Server Action ادمین با `auth()` + `assertCan(...)` شروع می‌شود (`saveBrand` → `settings.brand.edit`، `saveTheme` → `settings.theme.edit`) و رکورد AuditLog با `userId` واقعی می‌نویسد. مجوزها (`settings.brand.edit`، `settings.theme.edit`، `users.view`، `users.manage`، `media.upload`، `system.health.view`) برای `owner` و `admin` seed می‌شوند. تست واحد `tests/unit/admin-authz.spec.ts` تمام `src/app/admin/**/actions.ts` را glob می‌کند، **اگر صفر فایل پیدا شود fail می‌کند**، و fail می‌کند اگر فایلی `assertCan` نداشته باشد. Route handler ادمینی وجود ندارد؛ `/api/uploads` در A3.                                                                                                                                                                                                                                                                                                                                                                          |
| A3                            | ✅                     | `/api/uploads` حالا نشست معتبر با مجوز `media.upload` می‌خواهد (بدون نشست → 401، بدون مجوز → 403). محتوای واقعی فایل با magic bytes (`file-type`) بررسی می‌شود و اگر نوع sniff‌شده در allow-list نباشد رد می‌شود (415). پسوند فایل ذخیره‌شده از **MIME تأییدشده** می‌آید نه از نام فایل کاربر؛ نام اصلی فقط در `Media.originalName`. سقف ۵MB و allow-list حفظ شد. تست‌های e2e: 401 بدون نشست، آپلود PNG واقعی → 201، فایل متنی با نام `.png` → 415.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A8                            | ✅                     | شمارندهٔ واقعی in-flight (`src/lib/request-metrics.ts`) — **per-instance، فرض تک‌کانتینر** (در فایل مستند شده). چون middleware نکست هوک «پایان پاسخ» ندارد، شمارش دور کار واقعی mutation انجام می‌شود (Server Actionها از طریق `withMutation`، و route handlerهای `uploads` و `cron/tick`). `GET /api/system/maintenance` مقدار واقعی `inFlight` را برمی‌گرداند. در حالت تعمیرات، نوشتن با 503 رد می‌شود؛ `/admin` و خود endpoint تعمیرات باز می‌مانند. یک گیت جلویی هم در middleware هست.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A8 (اصلاح بعد از بازبینی Vee) | ✅                     | **رفع TOCTOU:** در `withMutation` و هر دو route handler، ترتیب برعکس شد — اول `enterRequest()`، بعد چک تعمیرات، و `leaveRequest()` در `finally`. پس یک restore هرگز `inFlight: 0` را در فاصلهٔ «چک تعمیرات» و «افزایش شمارنده» نمی‌بیند. **حذف کش کهنه از مسیر نوشتن:** وضعیت تعمیرات از یک flag درون‌پروسه می‌آید که `POST /api/system/maintenance` هم‌زمان (بدون رفت‌وبرگشت DB) ست می‌کند؛ DB فقط برای hydrate در cold start. تست قطعی (نه زمان‌محور): `tests/unit/mutation-gate.spec.ts` — یک mutation که بدنه‌اش روی promise کنترل‌شده بلاک است، flip تعمیرات، assert که `inFlight` همیشه ۱ است (نه ۰)، mutation جدید بعد از flip با `MaintenanceError` رد می‌شود و شمارنده را دست‌نخورده می‌گذارد، سپس release و بازگشت به ۰؛ و مسیر `finally` وقتی `fn()` throw می‌کند.                                                                                                                                                                                                 |
| A5                            | ✅                     | `docker-compose.yml` بازنویسی شد به کامپوز واقعی تولید: `target: runner`، بدون mount سورس، بدون `pnpm dev`، بدون mailpit، بدون پورت روی هاست برای `app` (فقط از پشت Caddy)، همهٔ اعتبارنامه‌ها از `.env`. سرویس‌ها: `postgres`, `minio`, `migrate` (یک‌بار، از image `ops`)، `app`, `cron`, `ops`, `caddy`. `docker-compose.dev.yml` دست‌نخورده ماند — **به‌جز** یک اصلاح حداقلی YAML در دستور `cron` که با پارسر Go در Docker Compose v2 اصلاً parse نمی‌شد (`command` به شکل exec-list).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A6                            | ✅                     | `public/fonts/vazirmatn/` و `public/fonts/inter/` با فایل‌های woff2 واقعیِ variable از `@fontsource-variable/*` (وزن ۱۰۰–۹۰۰) + فایل LICENSE (هر دو SIL OFL 1.1). `scripts/vendor-fonts.mjs` برای به‌روزرسانی. `@font-face` در `tokens.css` با `unicode-range` درست بازنویسی شد؛ دیگر placeholder نیست.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A7                            | ✅                     | Dockerfile: در stage `deps` قبل از install، `COPY prisma ./prisma` جدا اضافه شد (postinstall به schema نیاز دارد)؛ در stage `ops` سه خط جدا `COPY package.json ./` / `COPY prisma ./prisma` / `COPY scripts ./scripts` جایگزین `COPY package.json prisma scripts /app/` شد تا `schema.prisma` در `/app/prisma/` بنشیند و step 6 restore.sh کار کند. `entrypoint.sh` فقط سرور را استارت می‌کند؛ مایگریشن به سرویس `migrate` (image ops، دارای Prisma CLI) منتقل شد. `scripts/deploy.sh` حالا `/app/scripts/backup/backup.sh` را صدا می‌زند.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **بخش A**                     | ✅ **کامل و تأییدشده** | A0–A8 + اصلاح TOCTOU در A8 (یافتهٔ Vee). A1–A7 توسط هر دو بازبین تأیید شد.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B1                            | ✅                     | `Money.#amount` واقعاً private شد؛ سطح عمومی: `add/sub/mul/percent/round/compare/toString/format` — هیچ متدی `number` نمی‌گیرد/برنمی‌گرداند. قانون ESLint `no-restricted-syntax` (`Number(`، `parseFloat(`، `.toNumber(`) به `src/modules/{pricing,fees,orders,finance}` محدود شد + `tests/unit/eslint-money-rule.spec.ts` وجودش را ساختاری چک می‌کند. تست پوشه‌اسکن حذف شد.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B2                            | ✅                     | `can(userId, permission, scope?: { marketId?, categoryId?, section? })` و `assertCan(...)` هم‌امضا. تطبیق: grant بدون scope = «همهٔ scopeها»؛ grant دارای scope فقط وقتی مطابق است که هر کلیدِ موجود در grant با مقدار درخواست برابر باشد (درخواستِ بدون scope با grant دارای scope مطابق نیست). override با deny در scope مطابق، بلاک می‌کند. `scopeMatches` export و مستقیم تست شد + تست `can()` با mock دیتابیس: مثبت داخل scope، منفی خارج scope، منفی بدون scope. اجرای سطح کوئری = فاز ۰۵.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B3 (صفحهٔ کاربران)            | ✅                     | ساخت/ویرایش/غیرفعال‌کردن کاربر پیاده شد: `src/app/admin/(dashboard)/users/{page,new,[id]}` + `actions.ts` با `auth()` + `assertCan(..., "users.manage")` + اعتبارسنجی Zod + `withMutation` + رکورد AuditLog برای هر عملیات. کاربر غیرفعال نمی‌تواند وارد شود (در `authorize()` چک می‌شود). تست e2e سریالی: owner یک کاربر می‌سازد → کاربر می‌تواند وارد شود → owner غیرفعالش می‌کند → دیگر نمی‌تواند وارد شود.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B4                            | ✅                     | مجموعهٔ اجزای پایه در `src/components/ui`: `Button` (۴ حالت/۲ اندازه)، `Input`، `Select`، `Card`، `Badge`، `Table`، `Dialog` (روی `<dialog>` نیتیو)، `Sheet` (پنل کشویی)، `Toast` (`ToastProvider` + `useToast`). همه با Tailwind + توکن‌ها. صفحهٔ `/admin/design` همه را نمایش می‌دهد؛ فرم‌های `settings/brand`، `settings/theme`، `users/new`، `users/[id]` از این اجزا استفاده می‌کنند. تست e2e: لاگین → `/admin/design` → باز کردن Dialog.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B5                            | ✅                     | Tailwind v4 کامل نصب شد: `@tailwindcss/postcss` + `postcss.config.mjs`؛ `@theme inline` در `tokens.css` توکن‌ها را به utility‌ها وصل می‌کند (`bg-primary`، `text-muted`، `rounded-token`). CSS بیلدشده حاوی کلاس‌های واقعی Tailwind است (تأییدشده).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| B6                            | ✅                     | `next-intl` واقعاً سیم‌کشی شد: `createNextIntlPlugin` در `next.config.ts`، `src/i18n/{routing,request}.ts`، middleware locale برای storefront (و دست‌نگه‌داشتن از `/admin` و `/api`)، `[locale]/layout.tsx` با `NextIntlClientProvider`، و `layout.tsx` ریشه `<html lang dir>` را از `getLocale()` می‌سازد. `[locale]/page.tsx` از `getTranslations()` استفاده می‌کند نه `import()` دستی. `/` → `/fa`؛ `/fa` → `lang=fa dir=rtl`، `/en` → `lang=en dir=ltr`، `/fa/xx` → 404، `/admin/login` → `lang=fa dir=rtl`. صفحه‌های storefront عمداً `force-dynamic` ماندند تا تغییر برند/رنگ بدون rebuild دیده شود.                                                                                                                                                                                                                                                                                                                                                                    |
| B7                            | ✅                     | `catch {}` خالی حذف شد: `getAppearance()`، `admin/users/page.tsx` و `admin/system/health` حالا خطا را `console.error` می‌کنند و حالت خطا نشان می‌دهند. `/api/health` وقتی دیتابیس در دسترس نیست **status 503** با فیلد `reason` برمی‌گرداند (وقتی سالم است 200 + `db/storage/lastBackup/lastFx`). تست e2e مسیر سالم را چک می‌کند.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B8                            | ✅                     | `runJobs` جاب‌ها را در یک تراکنش با `SELECT ... FOR UPDATE SKIP LOCKED` (raw SQL) claim می‌کند و بعد به `RUNNING` می‌برد؛ دو runner همزمان هرگز یک ردیف را برنمی‌دارند. `registerJobHandler` اضافه شد. تست: `tests/integration/jobs-lock.spec.ts` — دو/سه runner همزمان روی ۱ و ۶ جاب pending؛ هندلر دقیقاً یک‌بار به‌ازای هر جاب اجرا می‌شود. **CI-only** (به Postgres نیاز دارد؛ روی این ماشین skip می‌شود).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B9                            | ✅                     | همه‌جا `STORAGE_PROVIDER` (نه `STORAGE_DRIVER`): `storage/index.ts`، `api/health`، `admin/system/health`، `prisma/seed.ts`، `.env.example`، `docs/07_SETUP_GUIDE_FA.md`. **کامنت‌های درون‌خطی از `.env.example` حذف شد** — هر مقدار دیگر `# ...` را جذب نمی‌کند (تأیید با `docker compose config`: `BACKUP_OFFSITE_ENDPOINT: ""`). مقدارها `local                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | s3`(MinIO و R2 هر دو`s3`). |
| B10                           | ✅                     | `src/app/media/[...key]/route.ts` فایل‌های نوشته‌شده توسط `LocalStorage` را سرو می‌کند (و در `s3` به presigned URL ریدایرکت). `middleware` مسیر `/media/` را کنار می‌گذارد تا locale-redirect نشود. kindهای خصوصی (`receipt`، `backup`) نشست + مجوز `media.upload` می‌خواهند، وگرنه 404 (بدون لو دادن وجود فایل). `getBytes` به `StorageProvider` اضافه شد. تست e2e: بعد از آپلود، فایل با 200 و `content-type: image/png` و بایت‌های یکسان سرو می‌شود.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B11                           | ✅                     | همهٔ ۳ نقطهٔ `auditLog.create` (brand/theme/users) `userId` واقعی می‌نویسند (در A2/B3 انجام شد). مایگریشن `20260903000000_auditlog_append_only`: `DROP COLUMN "updatedAt"` + تریگر Postgres که `UPDATE`/`DELETE` روی `AuditLog` را با EXCEPTION رد می‌کند (append-only، D24). `updatedAt` از مدل حذف شد. تست integration: INSERT مجاز، UPDATE و DELETE رد می‌شوند.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B12                           | ✅                     | فلگ `--rollback` از `scripts/deploy.sh` حذف شد (فقط pull+restart بود، rollback واقعی نبود). **به فاز ۰۵ موکول شد:** rollback واقعی = تگ‌کردن image به‌ازای هر دیپلوی + نگه‌داشتن تگ قبلی + بازگردانی از بکاپ امنیتیِ پیش‌ازدیپلوی هنگام شکست. تا آن زمان: `restore.sh` داخل `ops`. `docs/07_SETUP_GUIDE_FA.md` هم به‌روز شد.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| بخش B                         | ✅ **کامل و تأییدشده** | B1–B12؛ Vee بخش A را رسماً بست و بخش B را تأیید کرد.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C1                            | ✅                     | معنای `Money.round` در doc comment نوشته شد و با تست پین شد: نزدیک‌ترین مضرب `increment` (mode نصفِ دقیق را می‌شکند)؛ با `ending`، نزدیک‌ترین نقطهٔ charm `m·increment + ending`. تست‌های مرزی: `increment "1000"` + ending؛ مقدار زیر ending (کلمپ به ≥ ending، هرگز منفی برای مبلغ نامنفی)؛ دقیقاً روی مرز (13.49 → HALF_UP 13.99 / HALF_EVEN 12.99)؛ HALF_UP/HALF_EVEN روی `.5` (با منفی)؛ مبلغ منفی (-13.20 → -13.01). **یک باگ پیدا و رفع شد:** کد قبلی همیشه به سطل charm پایین‌تر می‌افتاد وقتی `bucket + ending` از مبلغ بیشتر می‌شد → ۱۳.۷۰ می‌شد ۱۲.۹۹ (کاهش یک واحد کامل) و فرض `increment === 1` داشت. ۱۳.۲۰ → ۱۲.۹۹ تغییری نکرد.                                                                                                                                                                                                                                                                                                                                 |
| C2                            | ✅                     | نقش‌های غیر-owner واقعاً least-privilege seed می‌شوند: مجموعهٔ حداقلیِ هر نقش (`admin/data_entry/warehouse/accountant/support/marketing`)؛ هیچ‌کدام `security.role.manage` ندارند، فقط admin `users.manage`. `tests/integration/role-least-privilege.spec.ts` از طریق `can()` چک می‌کند هر نقش چه چیزی باید داشته باشد و چه چیزی **نباید** (warehouse ≠ ویرایش قیمت/مدیریت کاربر، data_entry ≠ publish/دیدن هزینه، support ≠ مدیریت مجوز)، و یک مورد منفی را از طریق یک server action واقعی (`saveTheme` کاربر warehouse را با `FORBIDDEN` رد می‌کند).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| C4                            | ✅                     | توضیح PR #1 و همین فایل بازنویسی شدند تا فقط ادعاهای راستی‌آزمایی‌شده داشته باشند؛ ادعای غلط ۴۰۳ Prisma رد شد؛ تقسیم سه‌طرفهٔ زیر.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D — runtime واقعی Docker      | ✅                     | job جدید `docker-runtime` در `.github/workflows/ci.yml` (باید در branch protection **required** شود). `scripts/ci/runtime-smoke.sh` + `ops-restore-cycle.sh` + `ops-negative-guards.sh`: `.env` با رازهای تصادفی واقعی → `docker compose up -d --wait` → تأیید اجرای مایگریشن‌ها روی Postgres واقعی و `/api/health: db ok` → seed → یک چرخهٔ کامل داخل `ops`: `backup.sh` → `verify.sh` → تغییر ردیف → `restore.sh --yes` → assert بازگشت ردیف + وجود بکاپ امنیتی + خاموش‌شدن maintenance + اجرای `prisma migrate deploy` از داخل ops بدون Docker socket + بازگشت فایل media بعد از swap اتمیک. موارد منفی: `run.sh` داخل image واقعی، zip با `../evil` رد، media tar با symlink رد، `manifest.json` دستکاری‌شده در checksum شکست می‌خورد. `down -v` + آپلود لاگ‌ها به‌عنوان artifact. Dockerfile ops حالا `zip` و `mc` هم دارد. `verify.sh` برای فاز فعلی سازگار شد (Market/User اجباری؛ Product/Variant فقط اگر موجود باشند). `app` در compose تولید حالا healthcheck دارد. |

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
- MFA/TOTP در اسکیما آماده است؛ اجباری‌کردن در فاز ۰۵. ابطال فوری توکن (`sessionVersion`) هم فاز ۰۵ — تا آن زمان فقط _دیدن_ صفحه‌های ادمین ممکن است تا انقضای توکن (۸ ساعت) عقب بیفتد؛ هیچ اکشنی اجرا نمی‌شود چون `can()` هر بار `isActive` را چک می‌کند.
- `S3Storage` روی MinIO/R2 واقعی و mirror off-site بکاپ هنوز اجرا نشده (بخش «تست‌نشده» بالا).
- `deploy.sh --rollback` حذف شد؛ rollback واقعی فاز ۰۵ (B12).

### Phase 01a

#### وضعیت

✅ **Merge شده — ۵ سپتامبر ۲۰۲۶.** PR [#4](https://github.com/mehdi2044/HodaSite/pull/4) (merge commit `24dceb8`)؛ طبق `docs/prompts/phase-01a.md` (نسخهٔ فرعی فاز ۰۱، تقسیم ۰۱a/۰۱b/۰۱c، تصمیم D45/رودمپ v1.2). فقط چیزهایی که در آن فایل بود پیاده شد؛ کتابخانهٔ رسانه، منوها/صفحات/Homepage Builder/ویرایشگر ترجمه به ۰۱b/۰۱c موکول شد.

#### چه چیزی ساخته شد

- **بازارها (`/admin/markets`):** لیست ۳ بازار ثابت (بدون ساخت/حذف) + صفحهٔ ویرایش هرکدام: فعال/غیرفعال، توقف فروش، زبان‌های فعال + زبان پیش‌فرض، کانال‌های پشتیبانی، پیام بالای سایت (Announcement bar) سه‌زبانه، SEO پیش‌فرض بازار. فیلدهای قیمت‌گذاری (markup، rounding، hold، deadline) فقط نمایشی — فاز ۰۳.
- **تنظیمات سایت:** برند (نام/شعار سه‌زبانه + آپلود لوگو روشن/تیره/فاویکون/لوگوی ایمیل)، تماس (ایمیل/تلفن هر بازار/آدرس/ساعت کاری)، شبکه‌های اجتماعی، حقوقی (نام شرکت/ثبت/مالیاتی/خط فوتر)، پرداخت (فقط یادداشت «فاز ۰۳»، بدون فیلد)، حالت تعمیرات (خاموش/روشن/زمان‌بندی‌شده، پیام سه‌زبانه، فهرست IP مجاز، بازهٔ زمانی).
- **پوسته کامل با پیش‌نمایش زنده:** پالت روشن/تیره، فونت (Vazirmatn/Inter self-host)، گردی گوشه‌ها، سبک هدر/دکمه، حالت تیره (خاموش/روشن/پیرو سیستم)، CSS سفارشی (پاک‌سازی‌شده: بدون `@import`، بدون `url()` بیرونی، بدون `expression()`، سقف ۲۰KB). پیش‌نمایش زنده در دو iframe (۳۹۰ و ۱۲۸۰px) که با `postMessage` بدون ذخیره به‌روز می‌شوند؛ بعد از ذخیره تازه‌سازی می‌شوند.
- **خطای typed مجوز:** `ForbiddenError`/`UnauthorizedError` جای `Error("FORBIDDEN")`؛ Server Actionهای تنظیمات پیام محلی‌شده برمی‌گردانند (`{ok:false, code, message}`) به‌جای کرش — با یک پوستهٔ کلاینت مشترک (`SettingsForm`, `useActionState`).
- **فروشگاه:** تشخیص بازار/زبان در middleware (کوکی `market`، پیش‌فرض بر اساس زبان، gate کردن `enabledLocales` با ریدایرکت)، هدر/فوتر/نوار پیام/سوییچر زبان و بازار، بنر پیشنهاد بازار جغرافیایی (فقط پیشنهاد، هرگز ریدایرکت خودکار، با کوکی dismissal)، صفحهٔ تمام‌صفحهٔ تعمیرات (۵۰۳ + `Retry-After` + پیام محلی + دور زدن با allowlist IP)، و `<title>`/`<meta description>`/فاویکون/`og:site_name` از تنظیمات + SEO بازار.

#### تست دستی ساده (روی سرور یا هر ماشین دارای Docker)

1. با ادمین وارد شوید و به «برند» بروید؛ نام سایت را عوض کنید و ذخیره کنید؛ در سه زبان (`/fa`, `/tr`, `/en`) بروید و ببینید تیتر تب مرورگر عوض شده.
2. به «پوسته» بروید و رنگ اصلی را عوض کنید — در دو پیش‌نمایش (موبایل/دسکتاپ) بلافاصله (بدون ذخیره) رنگ عوض می‌شود. ذخیره کنید و `/fa` را باز کنید — رنگ همان‌جاست.
3. به «بازارها» بروید، بازار ایران را باز کنید، تیک «Türkçe» را بزنید و ذخیره کنید؛ به `/fa` بروید و ببینید سوییچر زبان حالا ترکی را هم نشان می‌دهد؛ `/tr` را باز کنید — دیگر ریدایرکت نمی‌شود. تیک را بردارید تا برگردد.
4. به «حالت تعمیرات» بروید، حالت را «روشن» کنید، یک پیام فارسی بنویسید و ذخیره کنید؛ `/fa` را در یک تب دیگر (بدون ورود ادمین) باز کنید — صفحهٔ تعمیرات با همان پیام دیده می‌شود؛ `/admin` و `/api/health` عادی کار می‌کنند. حالت را «خاموش» کنید.
5. یک کاربر با نقش `data_entry` بسازید، با او وارد شوید، به «پوسته» بروید و «ذخیره» را بزنید — پیام «شما اجازهٔ انجام این کار را ندارید» دیده می‌شود، نه کرش.

#### محدودیت‌های شناخته‌شده

- کتابخانهٔ رسانه (grid/variants/پردازش) فاز ۰۱b است؛ فعلاً هر فیلد لوگو فقط یک آپلود ساده از طریق `/api/uploads` موجود است.
- منوها، صفحات/CMS، Homepage Builder، ویرایشگر ترجمه، طراحی نهایی فروشگاه — فاز ۰۱c.
- بنر پیشنهاد جغرافیایی فقط IR/TR/CA را می‌شناسد (از هدر جغرافیایی یا Accept-Language)؛ کشورهای دیگر پیشنهادی نمی‌بینند.
- فهرست IP مجاز حالت تعمیرات فقط IPv4 (تک‌آی‌پی یا CIDR) را پشتیبانی می‌کند؛ IPv6 فقط با تطبیق دقیق رشته کار می‌کند (بدون پیشوند).
- پاک‌سازی CSS سفارشی یک denylist هدفمند است، نه یک پارسر کامل CSS.
- چون middleware در Edge Runtime به Prisma دسترسی ندارد، برای هر درخواست فروشگاه یک تا دو fetch داخلی به `/api/system/maintenance/state` و `/api/system/markets` اضافه شده (نهفته، بدون کش) — هزینهٔ تأخیر قابل قبول برای MVP؛ بهینه‌سازی (کش کوتاه یا انتقال منطق) بک‌لاگ فازهای بعد.
- زبان ادمین هنوز فقط فارسی سخت‌کدشده است (طبق الگوی فاز ۰۰)؛ فقط پیام‌های خطای typed (`errors.forbidden` و مشابه) از `messages/*.json` می‌آیند، چون همان چیزی بود که این فاز صراحتاً خواسته بود. سوییچ کامل زبان ادمین در `06_ADMIN_AND_DESIGN.md` برای فاز ۰۵ برنامه‌ریزی شده.

#### سؤال‌ها برای مدیر پروژه

- شرح فاز نوشته «`/admin/*`, `/api/health`, `/api/cron/*`, `/api/ops/*` و آی‌پی‌های مجاز همیشه عبور می‌کنند» دربارهٔ حالت تعمیرات. این را طوری خواندم که فقط دربارهٔ صفحهٔ تمام‌صفحهٔ جدید فروشگاه است، نه دروازهٔ نوشتن (write-gate) موجود فاز ۰۰ که هنوز درخواست‌های POST به `/api/cron/tick` را حین تعمیرات با ۵۰۳ رد می‌کند — چون D23 (ایمنی ریستور) به آن دروازه برای drain کردن in-flight متکی است و مستقل از تنظیم جدید ماند. اگر منظور شرح فاز واقعاً معاف‌کردن cron از آن دروازه هم بود، لطفاً تأیید کنید تا در فاز بعد اصلاح شود.
- فیلدهای لوگو (روشن/تیره/فاویکون/ایمیل) طبق `03_ARCHITECTURE.md` §3.2 در `ThemeSettings` ذخیره شدند (نه در `SiteSettings.brand`)، ولی صفحهٔ ادمینشان همان‌جایی ماند که `06_ADMIN_AND_DESIGN.md` گفته بود: Settings → Brand. یک Server Action هر دو جدول را با هم به‌روز می‌کند. اگر این تفکیک داده/UI مطلوب نیست خبر دهید.
- شکل JSON فیلد `colors` در `ThemeSettings` از یک شیء تخت به `{light:{...}, dark:{...}}` تغییر کرد تا حالت تیره ممکن شود. **به‌روزرسانی بعد از بازبینی:** یک مایگریشن دادهٔ واقعی اضافه شد (پایین را ببینید)، این سؤال دیگر باز نیست.

#### بازبینی وی‌بانو/پیکسل (PR #4) — ۵ سپتامبر ۲۰۲۶

۶ Thread ربات Codex روی PR معتبر تشخیص داده شد (پیکسل تک‌تک را تأیید کرد). همه روی همین برنچ رفع شد؛ commit `7f289a8`. هر ۶ Thread پاسخ داده و resolve شدند.

| #   | یافته                                                                                                                                                                                     | رفع                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ۱   | **[امنیتی، P1]** `radius` فقط «رشتهٔ ناخالی» اعتبارسنجی می‌شد و مستقیم در `<style dangerouslySetInnerHTML>` می‌رفت؛ مقدار `12px}</style><script>…` روی همهٔ صفحات اسکریپت دائمی می‌گذاشت. | Regex امن (`cssLength`) در `src/lib/theme-validation.ts` برای radius؛ رنگ‌ها/فونت/heroStyle هم allowlist شدند. رندر (`RootLayout`) دوباره اعتبارسنجی می‌کند (دفاع دولایه). |
| ۲   | **[D23، P1]** اندپوینت عملیاتی maintenance (که `restore.sh` صدا می‌زند) بعد از نوشتن `revalidateTag` نمی‌زد؛ کش می‌توانست حین ریستور واقعی هنوز `effective:false` بدهد.                   | `revalidateTag('site-settings')` اضافه شد؛ gate هم `state==='on' \|\| effective` شد. **با چرخهٔ واقعی backup→restore روی این ماشین تأیید شد** (پایین را ببینید).           |
| ۳   | **[P2]** همان اندپوینت کل JSON `maintenance` را با `{state}` جایگزین می‌کرد و پیام/allowlist ادمین را هر بار ریستور پاک می‌کرد.                                                           | فقط فیلد `state` merge می‌شود. با همان چرخهٔ واقعی تأیید شد.                                                                                                               |
| ۴   | **[P1]** شکل قدیمی `brand`/`colors` (فاز ۰۰) با خواننده‌های فاز ۰۱a نمی‌خواند؛ مایگریشن قبلی فقط ستون اضافه کرده بود.                                                                     | مایگریشن دادهٔ SQL جدید (idempotent) + normalizer دفاعی در هر نقطهٔ خواندن. **روی دیتابیس dev واقعی این ماشین که هنوز داده‌ٔ فاز ۰۰ داشت تست شد** — قبل/بعد پایین.         |
| ۵   | **[P2]** لینک‌های اجتماعی یک‌دست برای هر سه بازار بود؛ شرح فاز «به تفکیک بازار» خواسته بود.                                                                                               | `social` حالا `{IR:{...},TR:{...},CA:{...}}`؛ دکمهٔ «کپی از بازار دیگر» در ادمین.                                                                                          |
| ۶   | **[P2]** برچسب‌های فوتر («تماس با ما»، نام شبکه‌ها) فارسی هاردکد بودند و در `/tr`/`/en` مخلوط‌زبان دیده می‌شدند.                                                                          | به `messages/*.json` (`footer`) منتقل شد.                                                                                                                                  |

**راستی‌آزمایی واقعی محلی (نه فقط CI) — Docker Desktop روی این ماشین در دسترس بود:**

- استک dev کامل بالا آمد (postgres/app/ops)؛ `prisma migrate deploy` واقعاً روی دیتابیس ۲۶ساعته‌ای اجرا شد که هنوز داده‌ٔ خام فاز ۰۰ داشت (`brand: {"fa":"استایل هاب",...}`) — بعد از مایگریشن دقیقاً `brand: {"name":{"fa":"استایل هاب",...},...}` شد، هیچ داده‌ای گم نشد.
- یک چرخهٔ واقعی `backup.sh` → تغییر پیام/allowlist تعمیرات از فرم ادمین → `restore.sh --yes` روی `ops` اجرا شد **درحالی‌که همزمان فروشگاه هر یک ثانیه poll می‌شد**: در بازهٔ ریستور واقعاً ۵۰۳ برگرداند، بلافاصله بعد از پایان ۲۰۰ شد، و پیام/allowlist دقیقاً دست‌نخورده ماندند.
- `pnpm lint && pnpm typecheck && pnpm test` با `TEST_DATABASE_URL` واقعی سبز (۹۵ تست، شامل تست‌های integration جدید روی Postgres واقعی).
- `pnpm exec playwright test --workers=1` (سریال، مثل CI) روی همین استک: ۲۴ تا ۲۶ از ۲۷ سبز بسته به اجرا؛ ۱-۲ شکست باقی‌مانده مخصوص `next dev` محلی‌اند (دکمهٔ شناور Dev Tools نکست که فقط در dev هست، و کندی کامپایل ناوبری کلاینت در اولین برخورد) — ربطی به این تغییرات ندارند؛ CI (بیلد تولید) معیار نهایی است طبق `CLAUDE.md`.
- هر سه job CI (`checks`, `docker`, `docker-runtime`) روی commit `7f289a8` سبز.

**آماده‌ی بازبینی نهایی پیکسل.**

#### بازبینی دور دوم پیکسل — ۵ سپتامبر ۲۰۲۶

حکم: **GO**، مشروط به یک اصلاح کوچک دفاع‌درعمق (همان دستهٔ یافتهٔ رادیوس) قبل از merge. رفع شد در commit `844bbc9`:

- `safeColorMap` (`src/lib/theme-validation.ts`) حالا فقط **کلید**های داخل `COLOR_KEYS` را می‌پذیرد، نه فقط مقدار hex را — چون `toVars()` کلید را خام در `--${k}:` می‌گذارد و کلید ناشناس همان ریسک style-breakout رادیوس است.
- `theme.customCss` در `RootLayout` حالا قبل از رندر دوباره از `sanitizeCustomCss` می‌گذرد (`safeCustomCss` در `src/lib/custom-css.ts`)؛ در صورت نامعتبر بودن، خالی رندر می‌شود نه کرش.
- دو تست واحد اضافه شد. `pnpm lint/typecheck/test` سبز (۹۹ تست)، push شد، هر سه job CI روی commit `844bbc9` سبز.

**تمام شد — Merge شد (commit `24dceb8`).**

### Phase 01b

#### وضعیت

✅ **Merge شده — ۸ سپتامبر ۲۰۲۶.** PR [#5](https://github.com/mehdi2044/HodaSite/pull/5) (merge commit `61eb4f3`)؛ طبق `docs/prompts/phase-01b.md` / `docs/phases/phase-01b.md` (کتابخانهٔ رسانه). همهٔ ۷ ایراد بازبینی رفع و گفتگوها Resolve شدند؛ هر سه job نهایی `checks` / `docker` / `docker-runtime` سبز بودند. فقط محدودهٔ آن فایل پیاده شد؛ منوها/صفحات/Homepage Builder/ویرایشگر ترجمه همچنان ۰۱c هستند؛ تصاویر محصول فاز ۰۲ است.

#### چه چیزی ساخته شد

- **مدل داده (مایگریشن‌های افزایشی):** `Media.status` (`PROCESSING`/`READY`/`FAILED`)، `folderId` (→ `MediaFolder` تک‌سطحی)، `tags[]` (ایندکس GIN)، `blurDataUrl`، `processingError`، `dominantColor`؛ شکل مستندشدهٔ `variants` در `04_DATABASE_AND_BACKUP.md`. ردیف‌های قدیمی (پیش از ۰۱b) با مقدار پیش‌فرض ستون `READY` می‌مانند — بدون مایگریشن دادهٔ جداگانه.
- **صف پردازش تصویر (D21 — بدون Redis/BullMQ):** رابط `ImageProcessingQueue` (`src/modules/media/queue.ts`) روی همان جدول `Job` موجود (نوع `media-optimize`). Worker (`src/modules/media/optimize.ts`, `sharp`): حذف EXIF + چرخش خودکار، تولید webp+avif در ۵ سایز (بدون بزرگ‌نمایی از اصل)، placeholder تار ۱۶px، رنگ غالب. صف حالا **retry با backoff نمایی** (۳۰/۶۰/۱۲۰ ثانیه، حداکثر ۳ تلاش) و **بازیابی job گیرکرده** (اگر worker وسط کار kill شود، بعد از ۵ دقیقه دوباره claim می‌شود) هم دارد — قبلاً یک تلاش، بدون بازیابی. مسیر آپلود (`/api/uploads`) الان اعتبارسنجی حجم (۱۰MB تصویر/۵MB pdf) و ابعاد (حداکثر ۸۰۰۰px) دارد، `Media{status:PROCESSING}` می‌سازد و صف می‌کند، فوراً `202` برمی‌گرداند؛ فیلدهای لوگوی فاز ۰۱a بدون تغییر کار می‌کنند (تا آماده‌شدن، URL اصل نمایش داده می‌شود).
- **job پاکسازی (`media-purge`):** فایل‌های اصل + همهٔ variantها را برای رسانهٔ حذف‌نرم‌شده بعد از دورهٔ نگه‌داری (پیش‌فرض ۳۰ روز، در `SiteSettings.media.purgeRetentionDays`) پاک می‌کند؛ خودش را هر ساعت دوباره زمان‌بندی می‌کند؛ حین حالت تعمیرات هرگز اجرا نمی‌شود (D23).
- **ادمین `/admin/media`:** grid با thumbnail (وضعیت پردازش با نشان)، آپلود چندتایی با drag & drop و پیام خطای فارسی هر فایل، فیلتر/جست‌وجو/مرتب‌سازی، پوشه‌ها، کشوی جزئیات هر آیتم (متن جایگزین fa/tr/en، برچسب‌ها، پوشه، حذف نرم/بازیابی، تلاش دوباره روی خطا)، سطل زباله (روزهای باقی‌مانده)، اقدامات گروهی (انتقال/برچسب/حذف). `media.write`/`media.delete` مجوزهای جدید (کنار `media.upload` قبلی) با اصل حداقل دسترسی: حذف فقط ادمین.
- **`MediaPicker` مشترک:** مودال با همان جست‌وجو/grid/آپلود، همان API (`name`/`label`/`defaultMediaId`/`defaultUrl`) کامپوننت قبلی — چهار فیلد لوگوی Settings → Brand (تنها UI فاز ۰۱a که این فاز دست زد) جایگزین شدند.
- **`<ResponsiveImage>` فروشگاه:** `<picture>` با avif→webp→اصل، `srcset` از variantها، `width`/`height` (بدون layout shift)، placeholder تار به‌صورت پس‌زمینهٔ CSS. لوگوی هدر فروشگاه (که قبلاً `<img>` خام بود) الان از همین کامپوننت رد می‌شود. یک تست واحد کل مسیر فروشگاه را می‌گردد که هیچ `<img>` خام دیگری نباشد.
- **B2 (بک‌لاگ از بازبینی PR #4):** پاسخ `bypass` در `/api/system/maintenance/state` فقط برای فراخوانی داخلی middleware (هدر `x-internal-secret`) محاسبه می‌شود — قبلاً هرکسی با `?ip=` می‌توانست allowlist را probe کند. `getMaintenanceConfig`/`getMarkets` سقف ۵ثانیه‌ای کش (کنار invalidation فوری موجود).
- **داده‌ٔ seed:** ۱۲ تصویر نمونه (رنگ تخت، تولیدشده با sharp، بدون لوگوی واقعی) در ۳ پوشه با متن جایگزین سه‌زبانه — از همان مسیر واقعی صف پردازش رد می‌شوند.

#### تست دستی ساده (روی سرور یا هر ماشین دارای Docker)

1. با ادمین وارد شوید، به «رسانه‌ها» بروید؛ چند عکس را هم‌زمان بکشید و رها کنید — بلافاصله با placeholder تار در grid ظاهر می‌شوند؛ بعد از حدود یک دقیقه (تیک cron) وضعیت‌شان «آماده» می‌شود.
2. روی یک تصویر کلیک کنید، متن جایگزین فارسی/ترکی/انگلیسی و یک برچسب بنویسید، پوشه‌ای انتخاب کنید، ذخیره کنید.
3. تصویر را حذف کنید — از grid می‌رود؛ روی «سطل زباله» بروید، آنجاست با روزهای باقی‌مانده؛ «بازیابی» را بزنید — برمی‌گردد.
4. به Settings → Brand بروید، «انتخاب رسانه» را روی لوگو بزنید — همان مودال جست‌وجو/آپلود کتابخانهٔ رسانه باز می‌شود؛ یک عکس انتخاب کنید، ذخیره کنید؛ صفحهٔ اصلی فروشگاه را باز کنید — لوگو با فرمت مدرن (webp/avif) لود می‌شود.
5. یک فایل خیلی بزرگ یا با فرمت پشتیبانی‌نشده آپلود کنید — پیام خطای فارسی روشن دیده می‌شود، نه کرش.

#### محدودیت‌های شناخته‌شده

- پوشه‌ها فقط یک سطح هستند (بدون تودرتو) — طبق شرح فاز.
- «جایگزینی فایل» در خود 01b باز مانده بود و اکنون در 01c با پردازش مستقل، swap اتمیک و retry امن بسته شده است.
- مسیر واقعی `S3Storage` روی MinIO به `docker-runtime` اضافه شده است: seed با `PutObject`، سپس `S3Storage.getBytes/put` در پردازش variant، stream از `/media` و `S3Storage.delete` در purge. خود route احراز‌شدهٔ `/api/uploads` در Playwright با LocalStorage پوشش دارد؛ parity ذخیره‌ساز S3 با چرخهٔ provider بالا اثبات می‌شود. تا اجرای CI این commit، نتیجه در ستون «پیاده‌شده ولی تأییدنشده» است.
- Lighthouse برای «تصاویر با اندازهٔ درست» روی هدر فروشگاه دستی چک نشده؛ فقط ساختار `<picture>`/`srcset`/`width`/`height` درست است.
- تست Playwright ادمین برای grid، حذف/بازیابی، انتخاب لوگو با picker و خروجی `<picture>` اضافه شده است؛ نتیجهٔ مرورگر تولیدی فقط پس از CI ثبت می‌شود.

#### اصلاحات بازبینی نهایی PR #5 — ۷ سپتامبر ۲۰۲۶

- route رسانه اکنون variantهای ثبت‌شده را با MIME صحیح و cache immutable سرو می‌کند؛ اصل فایل cache کوتاه دارد.
- صفحهٔ `/admin/media` پیش از هر query روی سرور مجوز `media.upload` را بررسی می‌کند.
- ساخت ردیف `Media` و job پردازش در یک transaction انجام می‌شود؛ شکست DB/صف با حذف جبرانی object ذخیره‌شده، رسانهٔ گیرکرده باقی نمی‌گذارد.
- purge دیگر خطای حذف storage را نمی‌بلعد و در خطا ردیف DB را برای retry بعدی نگه می‌دارد.
- picker لوگو فقط تصویر نشان می‌دهد و Server Action نیز image/non-deleted بودن شناسه‌ها را مستقل اعتبارسنجی می‌کند.
- grid و picker از variant `webp/320` استفاده می‌کنند و تمام متن‌های UI جدید رسانه در `messages/fa|tr|en.json` قرار گرفت.
- خطای seed در runner معمولی CI با `MEDIA_DIR=/tmp/hoda-media` رفع شد؛ `MAINTENANCE_SECRET` نیز مثل secretهای اجباری در startup fail-fast است.
- `docker-runtime` دو مسیر LocalStorage و S3Storage/MinIO را جدا اجرا می‌کند؛ `app` نیز تا خروج موفق `minio-init` و ساخته‌شدن bucket شروع نمی‌شود. ادعای پاس‌شدن MinIO یا Playwright تا دریافت خروجی CI انجام نمی‌شود.

**تأیید محلی این اصلاحیه:** `tsc --noEmit`، ESLint، build تولیدی و ۸۷ تست واحد سبز. ۲۹ تست integration به‌دلیل نبود PostgreSQL/Docker در این محیط اجرا نشدند. Docker، MinIO و Playwright باید در CI تأیید شوند.

#### راستی‌آزمایی واقعی محلی (Docker Desktop) — ۵/۶ سپتامبر ۲۰۲۶

مهدی صریحاً خواست این فاز حتماً روی Docker واقعی امتحان شود، نه فقط تست‌های خودکار. این کار همان چیزی بود که چند باگ واقعی را پیدا کرد که هیچ تست unit/integration نمی‌توانست پیدا کند:

- **باگ ۱ (رفع شد):** ثبت job handler رسانه در `instrumentation.ts` باعث کرش کل اپ هنگام بوت می‌شد — `instrumentation.ts` از یک مسیر کامپایل webpack جدا عبور می‌کند که `serverExternalPackages` روی آن اثر ندارد، پس import کردن `sharp` (حتی غیرمستقیم) باعث می‌شد webpack بخواهد require-های شرطی پلتفرم sharp را استاتیک resolve کند و شکست بخورد. رفع: ثبت handlerها به‌جای آن از خود route اندپوینت `/api/cron/tick` انجام می‌شود (یک Route Handler معمولی که `serverExternalPackages` را رعایت می‌کند).
- **باگ ۲ (رفع شد):** seed کردن رسانه‌های نمونه از `storage`/`imageProcessingQueue` (زیر `src/modules`) استفاده می‌کرد؛ ولی `prisma db seed` باید از ایمیج `ops` هم قابل اجرا باشد و `ops` عمداً `src/` را ندارد (طراحی حداقلی D22/D23، بدون دسترسی Docker socket) — همان چیزی که مرحلهٔ «seed the demo shop» در `runtime-smoke.sh` (CI) انجام می‌دهد. رفع: seed حالا کاملاً خودکفا است (نوشتن مستقیم فایل + ساخت مستقیم ردیف Job).
- **باگ ۳ (رفع شد):** `.dockerignore` اصلاً وجود نداشت، پس `COPY . .` در مرحلهٔ build ایمیج تولید، `node_modules` خودِ ماشین میزبان (ویندوز) را روی نسخهٔ درست‌ساخته‌شدهٔ لینوکسی جایگزین می‌کرد → خطای «Cannot find module '@prisma/engines'» در بیلد تولید. این باگ در CI بروز نمی‌کرد (چون یک checkout تازهٔ GitHub Actions اصلاً `node_modules` محلی ندارد) ولی هر بیلد Docker محلی روی هر ماشینی که قبلاً `pnpm install` روی آن اجرا شده را خراب می‌کرد. اضافه شد.
- **باگ ۴ (رفع شد):** pnpm 10 به‌طور پیش‌فرض اسکریپت‌های نصب برخی پکیج‌ها (از جمله خودِ `@prisma/engines`) را نادیده می‌گیرد مگر صریحاً تأیید شوند؛ `pnpm.onlyBuiltDependencies` به `package.json` اضافه شد (همان راه‌حل رسمی خودِ pnpm).
- **باگ ۵ (رفع شد):** بوت‌استرپ اول job پاکسازی (`ensurePurgeSweepScheduled`) یک کوئری واقعی دیتابیس در سطح ماژول اجرا می‌کرد؛ چون `next build` واقعاً route ها را در مرحلهٔ «Collecting page data» اجرا می‌کند (بدون `DATABASE_URL` واقعی)، بیلد تولید شکست می‌خورد. رفع: بخش لمس‌کنندهٔ دیتابیس به اولین درخواست واقعی موکول شد.

بعد از این ۵ رفع، این‌ها واقعاً روی Docker Desktop تأیید شد:

- استک کامل dev (`app`+`ops`+`cron`+`postgres`) بالا آمد؛ ورود ادمین واقعی از طریق HTTP؛ ۱۰ عکس JPEG واقعی تازه‌تولیدشده از طریق `/api/uploads` واقعی آپلود شد؛ سرویس `cron` واقعی (همان که هر ۶۰ ثانیه در production هم تیک می‌زند) همه را تا `READY` با فایل‌های واقعی webp+avif روی دیسک (نه فقط رکورد دیتابیس) پردازش کرد — ابعاد درست، رنگ غالب درست، منطق «هرگز بزرگ‌نمایی نکن» درست.
- بعد از رفع باگ ۲، `prisma db seed` از ایمیج `ops` بازسازی‌شده دوباره اجرا شد؛ هر ۱۲ عکس نمونه به `READY` رسیدند؛ صفحهٔ `/admin/media` واقعی (با کوکی ورود واقعی) هر ۱۲ را در grid نشان داد.
- `scripts/backup/backup.sh` و `verify.sh` با حجم رسانه/variant واقعی روی volume بدون مشکل اجرا شدند.
- `docker build --target runner .` (همان مسیر job `docker` در CI) کامل با موفقیت تمام شد؛ ایمیج نهایی روی Postgres واقعی بالا آمد و `GET /api/health` و `POST /api/cron/tick` هر دو درست پاسخ دادند.
- `pnpm exec tsc --noEmit`، `pnpm run lint`، `pnpm exec vitest run` (۲۰ فایل / ۱۱۲ تست) بعد از همهٔ رفع‌ها دوباره روی میزبان سبز تأیید شد.

**فقط در CI تأیید خواهد شد:** تعامل واقعی ماوس با drag&drop/مودال در مرورگر (Playwright، طبق قرارداد پروژه روی `next dev` محلی قابل‌اعتماد نیست)، معیار پذیرش B2 (سقف ۵ثانیه)، و چرخهٔ کامل backup→restore داخل `docker-runtime` (که حالا یک assertion جدید هم دارد: ۱۲ عکس seed باید تا ۳ دقیقه بعد از seed به `READY` با variant برسند).

#### مورد انتقالی بسته‌شده در 01c

- جایگزینی رسانه بدون تغییر `Media.id` تأیید و پیاده شد: رکورد `MediaReplacement` فایل جدید را بیرون از ردیف live پردازش می‌کند و فقط پس از موفقیت کامل، metadata ذخیره‌سازی را اتمیک عوض می‌کند؛ بنابراین تناقض قبلی صف/نمایش برطرف شد.

### Phase 01c

#### وضعیت

✅ **Merge شده — ۹ سپتامبر ۲۰۲۶.** PR [#6](https://github.com/mehdi2044/HodaSite/pull/6)، commit نهایی main: `ca75a20`. هر سه job الزامی CI سبز و Merge با اجازهٔ صریح مهدی انجام شد.

#### ویرایشگر بصری صفحات

- JSON خام دیگر رابط اصلی نیست. هشت بلوک `RichText`، `Image`، `Hero`، `TwoColumns`، `FAQ`، `CTA`، `Countdown` و `Embed` فرم بصری دارند و نتیجه فقط برای ارسال فرم در یک input مخفی serialize می‌شود.
- ویرایش فارسی/ترکی/انگلیسی با جهت درست انجام می‌شود. ابزار متن غنی با API استاندارد `Selection`/`Range` مرورگر، پاراگراف، عنوان، پررنگ، کج، فهرست و لینک امن را پشتیبانی می‌کند؛ paste فقط متن ساده می‌پذیرد.
- بلوک‌ها با drag/drop یا دکمه‌های دسترس‌پذیر بالا/پایین مرتب می‌شوند. بلوک‌های تصویر و Hero همان `MediaPicker` مشترک را استفاده می‌کنند.
- پیش‌نمایش ذخیره‌نشده با انتخاب عرض ۳۹۰ یا ۱۲۸۰ و زبان، هم‌زمان به‌روزرسانی می‌شود و هیچ DB write ندارد. iframe بدون مجوز sandbox، با CSP بسته و بدون اجرای Embed/اسکریپت است.
- اعتبارسنجی Zod، پاک‌سازی HTML، بررسی URL/Embed و مجوز Server Action همچنان سمت سرور مرجع نهایی‌اند.

#### تست دستی ساده

1. در ادمین به Content → Pages بروید و یک صفحه را باز کنید؛ از فهرست نوع، هر بلوک را اضافه کنید.
2. با دکمه‌های فارسی/ترکی/انگلیسی بین ورودی‌ها جابه‌جا شوید و در متن غنی چند قالب و لینک امن امتحان کنید.
3. بلوک‌ها را با بالا/پایین یا drag/drop مرتب کنید و تغییر فوری پیش‌نمایش ۳۹۰ و ۱۲۸۰ را بدون زدن «ذخیره» ببینید.
4. یک تصویر از MediaPicker انتخاب کنید، هر سه زبان را کامل کنید و ذخیره را بزنید؛ سپس صفحهٔ عمومی منتشرشده را باز کنید.

**تأیید محلی این بخش:** TypeScript، ESLint کامل، build تولیدی و ۱۰۴ تست واحد سبز. ۳۲ تست integration به‌دلیل نبود `TEST_DATABASE_URL` در این محیط اجرا نشدند؛ تست Playwright جدید و integrationها باید در CI تأیید شوند.

#### صفحهٔ اصلی و ترجمه‌های رابط

- `/admin/content/homepage` چیدمان سراسری و override هر بازار را برای شش بلوک Hero، CategoryCards، ProductStrip، Banner، TrustBar و RichText ویرایش می‌کند. مرتب‌سازی با drag/drop و دکمهٔ صفحه‌کلید، انتخاب تصویر از MediaPicker و پیش‌نمایش sandbox شدهٔ ذخیره‌نشده در عرض ۳۹۰/۱۲۸۰ دارد.
- منابع کاتالوگ به‌صورت config ذخیره می‌شوند و تا فاز ۰۲ placeholder صریح دارند. فروشگاه از accessor کش‌شده با fallback بازار→سراسری می‌خواند و ResponsiveImage را برای Hero/Banner به کار می‌برد.
- `/admin/content/translations` همهٔ کلیدهای سه فایل پیام را جست‌وجو و inline override/reset می‌کند؛ import/export JSON فقط زبان و کلید شناخته‌شده را می‌پذیرد. هر بخش مسیر کلید در برابر prototype pollution بررسی و اندازهٔ مقدار/import محدود است.
- next-intl فایل پیش‌فرض را بدون mutation clone و با override کش‌شدهٔ DB ادغام می‌کند؛ نبود DB در build/boot به فایل‌ها fallback می‌کند. ذخیره/reset/import کش سراسری و locale را invalid می‌کنند.
- گزارش ترجمه‌های ناقص Page/Menu/Homepage در همان صفحه دیده می‌شود. مجوزهای `content.homepage.*` و `content.translation.*` کمینه و تمام mutationها audit شده‌اند.

**تأیید محلی این بخش:** `tsc --noEmit` و ESLint کامل سبز؛ ۱۱۶ تست واحد سبز. ۳۴ تست integration (از جمله ۲ تست جدید) به‌دلیل نبود `TEST_DATABASE_URL` skip شدند؛ build تولیدی کامل سبز. Playwright جدید در CI اجرا می‌شود.

#### اعلان‌ها، جایگزینی رسانه و پرداخت نهایی فروشگاه

- `/admin/settings/notifications` هشت قالب ایمیل سه‌زبانه را با وضعیت فعال، موضوع، متن، فهرست متغیرهای مجاز و ارسال آزمایشی ویرایش می‌کند. متغیر ناشناخته یا ناقص رد می‌شود. provider پیش‌فرض `noop` گیرنده، متن یا secret را log/audit نمی‌کند؛ اتصال واقعی SMTP/Resend طبق scope در فاز 04 می‌ماند.
- جایگزینی تصویر ابتدا فایل و variantهای تازه را مستقل می‌سازد. شناسه، alt، tag، folder و ارجاع‌ها ثابت‌اند و تا موفقیت کامل تصویر قدیمی live می‌ماند. stale swap رد می‌شود؛ شکست پردازش/پاک‌سازی از ادمین retry دارد و مسیر Local/S3 همان `StorageProvider` است.
- هدر/منوی موبایل/فوتر و بلوک‌های خانه mobile-first و آرام‌تر شدند؛ کنترل‌ها حداقل ۴۴px، focus واضح و جهت fa برابر RTL است. لینک Announcement هم هنگام ذخیره و هم رندر امن‌سازی می‌شود و لوگو/فاویکون فقط از تصویر READY و حذف‌نشده می‌آید.
- منابع واقعی دسته/محصول/کالکشن عمداً تا فاز 02 placeholder شفاف دارند؛ این محدودیت scope است، نه محتوای گمشده.

#### تست دستی سادهٔ بخش نهایی

1. در «تنظیمات → اعلان‌ها» قالب `auth.otp` را باز کنید، متغیر مجاز `{{code}}` را نگه دارید و ارسال آزمایشی با ایمیل نمونه انجام دهید؛ سپس `{{password}}` را امتحان کنید و خطای اعتبارسنجی را ببینید.
2. در «رسانه‌ها» جزئیات یک تصویر READY را باز کنید و «جایگزینی فایل» را بزنید. تا پایان پردازش، تصویر قبلی نمایش داده می‌شود؛ بعد از refresh همان کارت و شناسه باید تصویر جدید را نشان دهد.
3. صفحهٔ `/fa` را در عرض ۳۹۰px باز کنید؛ منوی موبایل، تغییر بازار و لینک‌های فوتر را با لمس و Tab بررسی کنید. سپس `/tr` و `/en` را برای جهت LTR ببینید.

**تأیید محلی بخش نهایی:** TypeScript و ESLint کامل سبز؛ Vitest شامل ۱۲۱ تست واحد سبز است. ۳۷ تست integration به‌دلیل نبود `TEST_DATABASE_URL` اجرا نشدند. build تولیدی Next سبز است. Playwright، integration واقعی PostgreSQL، Docker/MinIO و backup→restore باید در CI سه job `checks`، `docker` و `docker-runtime` تأیید شوند؛ تا آن زمان ادعای پاس‌شدن آن‌ها نمی‌شود.

### Phase 02

#### وضعیت

✅ **Merge شده — ۹ سپتامبر ۲۰۲۶.** PR [#7](https://github.com/mehdi2044/HodaSite/pull/7)، commit نهایی main: `293a1e6`. هر سه job الزامی CI سبز بودند و Merge با اجازهٔ صریح مهدی انجام شد.

#### ساخته‌شده

- مدل‌ها و migration افزایشی کاتالوگ: درخت دسته، برند، کالکشن، رنگ، سایز، محصول، ویژگی، تنوع، رسانهٔ محصول/تنوع و راهنمای سایز؛ `pg_trgm`، بردار FTS و trigger نگه‌داری خودکار جست‌وجو.
- پنل محصولات: فهرست و فیلتر، quick edit قیمت/وضعیت، bulk status، کپی، حذف نرم، ویرایشگر هشت‌بخشی سه‌زبانه، ماتریس رنگ×سایز و اتصال رسانه به محصول و تنوع.
- پنل طبقه‌بندی: ساخت و ویرایش کامل از رابط، بایگانی امن و audit‌شده برای شش نوع موجودیت؛ موجودیتی که محصول فعال به آن وابسته است قابل بایگانی نیست.
- فروشگاه: بلوک‌های واقعی محصول/دسته در خانه، صفحهٔ دسته با فیلتر و مرتب‌سازی کلاینتی و URL قابل‌اشتراک، صفحهٔ جست‌وجو با پیشنهاد debounce، صفحهٔ محصول با گالری responsive، رنگ/سایز، قیمت بازار، راهنمای سایز، JSON-LD و hreflang، محصول مرتبط، اخیراً دیده‌شده و 404 محلی‌شده.
- seed شامل ۳۰ محصول سه‌زبانه با تنوع و تصویر محلی، ریشه‌ها و زیردسته‌ها، گروه‌های سایز و یک محصول فقط بازار TR.

#### تأیید فعلی

- CI نهایی run `34351592461`: هر سه job با نام‌های `checks`، `docker` و `docker-runtime` سبز.
- Vitest روی PostgreSQL واقعی: هر ۱۷۶ تست در ۳۸ فایل پاس؛ Playwright: هر ۴۴ تست مرورگر پاس؛ lint، TypeScript، build تولیدی Next و چرخهٔ backup/restore نیز پاس.
- هر دو مسیر اجرای واقعی Docker با `LocalStorage` و `S3Storage` روی MinIO پاس؛ ساخت imageهای production و ops و compose production نیز تأیید شد.
- هفت یافتهٔ بازبینی PR رفع شد: مجوز create/publish، جلوگیری از پایین‌آوردن محصول فعال بدون publish، ترجمهٔ رابط ادمین کاتالوگ، قیمت override تنوع، پیش‌نمایش احراز هویت‌شدهٔ Draft، بایگانی امن taxonomy و مسیر ویرایش همهٔ ردیف‌ها.

### Checkpoint 1 — فروشگاه قابل مرور

#### وضعیت

⏸ **بخش دستی و عملیاتی معوق — ۹ سپتامبر ۲۰۲۶.** بررسی خودکار فازهای 01c و 02 کامل و سبز است. چون سرور و دامنه هنوز تهیه نشده، پذیرش نهایی شامل ۱۷ آزمون دستی `docs/08_TEST_CHECKPOINTS_FA.md` روی لپ‌تاپ و گوشی و در سه زبان باز می‌ماند. طبق D49، این تعویق مانع شروع فاز 03 نیست و هیچ مورد تست‌نشده‌ای پاس‌شده فرض نمی‌شود.

#### تأیید خودکار موجود

- ورود و مجوزهای ادمین، ویرایش محتوا، کاتالوگ، جست‌وجو، بازارها و سه زبان در CI پوشش داده شده‌اند.
- هر سه مسیر `checks`، `docker` و `docker-runtime` سبزند؛ PostgreSQL، Playwright، LocalStorage و S3/MinIO واقعی اجرا شده‌اند.
- معیارهای صرفاً دیداری و تعاملی—لوگو و فاویکون واقعی، کیفیت موبایل، نتیجهٔ تغییر تم، ساخت محصول کامل توسط کاربر و امتیاز Lighthouse—نیازمند اجرای دستی‌اند.

#### پیش‌نیاز عملیاتی باز

- طبق D46 و استثنای زمان‌بندی D49، پیش از بستن Checkpoint 1 باید staging با دامنهٔ آزمایشی و HTTPS واقعی Caddy در دسترس باشد. S3/MinIO در CI اثبات شده است؛ دامنه، HTTPS واقعی، Lighthouse عمومی و ۱۷ نتیجهٔ دستی هنوز تأیید نشده‌اند.
- فازهای 03 تا 05 می‌توانند بر پایهٔ CI سبز ادامه یابند؛ این موارد باید حداکثر پیش از اجرای دستی Checkpoint 2 تکمیل شوند. قاعدهٔ توقف در صورت کشف بیش از سه باگ مسدودکننده همچنان برقرار است.

### اصلاح امنیتی وابستگی‌ها — ۱۰ سپتامبر ۲۰۲۶

- Next.js و eslint-config-next از 15.5.2 به 15.5.25 و React/React DOM از 19.1.0 به 19.1.9 ارتقا یافتند؛ فایل قفل با pnpm 10.15.1 معتبر شد.
- مبنا: https://nextjs.org/blog/CVE-2025-66478 و https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4 ؛ نسخهٔ انتخابی در همان شاخهٔ اصلی 15 باقی می‌ماند.
- تأیید محلی: Prisma generate، lint، TypeScript، ۱۳۴ تست واحد و build تولیدی موفق. ۴۲ تست دیتابیس به‌علت نبود TEST_DATABASE_URL محلی اجرا نشدند. هر سه job در CI روی commit 908978c موفق شدند؛ Docker، مرورگر، PostgreSQL و backup/restore واقعی LocalStorage و S3/MinIO تأیید شدند (run 34462434107).
- تغییر مدل داده یا معماری ندارد. هشدار build مربوط به APIهای Node در dependency احراز هویت باقی است؛ تست ورود واقعی CI معیار سازگاری است.
- Implemented against docs v1.2 / D-numbers touched: D02, D27, D28, D29, D47.

### Phase 03

#### وضعیت

🟡 **پیاده‌سازی کامل و در انتظار CI/بازبینی — ۱۰ سپتامبر ۲۰۲۶.** شاخهٔ `phase/03-pricing-fx-fees-inventory` از Merge commit فاز قبل ساخته شده است؛ تا سبزشدن هر سه job و رفع همهٔ یافته‌های بازبینی، این فاز تمام‌شده یا آمادهٔ Merge اعلام نمی‌شود.

#### ساخته‌شده

- Money مبتنی بر Decimal، قوانین گردکردن بازار و قالب‌بندی محلی؛ قیمت‌گذاری واقعی سه بازار با override محصول/تنوع، compare-at، کش ۱۵ دقیقه‌ای و برچسب مالیات.
- دریافت نرخ Frankfurter با v2 و fallback به v1، Navasan با فیلد قابل‌تنظیم و نرخ دستی؛ تاریخچه، نمودار، نرخ پیشنهادی/فعال، کنترل جهش، هشدار نرخ کهنه، override زمان‌دار و تنظیم ارائه‌دهنده از ادمین. فقط secret نوسان در محیط سرور می‌ماند.
- موتور داده‌محور هزینه با شش روش ثابت، دامنهٔ بازار/آدرس/دسته، اولویت، حداقل/حداکثر، جذب هزینه، مالیات و فرم پارامتر اختصاصی؛ شبیه‌ساز تا سه قلم، قانون منطبق و ترتیب محاسبه را نشان می‌دهد.
- انبار، موجودی، Lot خرید با بهای اصلی و snapshot نرخ TRY/USD، دفتر StockMovement غیرقابل‌ویرایش، FIFO COGS، رزرو تراکنشی با قفل ردیف به ترتیب ثابت و job انقضا؛ دریافت دستی، ورود CSV، اصلاح با دلیل و آستانهٔ کمبود سراسری یا ویژهٔ SKU/انبار.
- ویترین قیمت و موجودی واقعی را می‌خواند؛ تنوع ناموجود غیرفعال و وضعیت موجود/کم/ناموجود سه‌زبانه است. سناریوی seed کانادا برای CP2-03 حمل ۲۶ CAD و گمرک ۱۶ CAD را بازتولید می‌کند.

#### تأیید فعلی

- TypeScript، ESLint کامل و build تولیدی Next سبز است.
- ۱۶۳ تست واحد در ۳۱ فایل پاس است؛ تست‌های جدید Money، FX، قیمت، هر شش روش هزینه، FIFO و قراردادهای موجودی را پوشش می‌دهند.
- ۴۷ تست integration در ۱۴ فایل، از جمله جهش ۱۲٪ نرخ، دریافت Lot، انقضای رزرو، دو خریدار برای آخرین واحد و ۲۰ worker برای ۵ واحد، به‌دلیل نبود PostgreSQL محلی اجرا نشدند و باید در job `checks` CI پاس شوند.
- Playwright جدید پنل FX/هزینه/انبار و سناریوی CP2-03 را پوشش می‌دهد؛ Docker، MinIO و backup→restore نیز طبق قانون پروژه فقط پس از CI تأیید خواهند شد.

#### تست دستی ساده پس از بالا آمدن محیط

1. در `Pricing → FX` نرخ فعال و پیشنهادی هر بازار را ببینید؛ یک نرخ دستی با تأیید اثر روی قیمت ثبت کنید و تغییر قیمت ویترین را بررسی کنید.
2. در `Pricing → Fees → Simulator` بازار کانادا و محصول ۳ کیلویی seed را انتخاب کنید؛ حمل باید ۲۶ و گمرک ۱۶ CAD باشد. سپس قانون گمرک را خاموش و دوباره محاسبه کنید.
3. در `Inventory` برای یک SKU تعداد، بهای خرید، ارز و تاریخ ثبت کنید؛ Lot، snapshotهای TRY/USD و حرکت `IN` باید ظاهر شوند.
4. آستانهٔ سراسری و سپس مقدار ویژهٔ همان SKU را تغییر دهید؛ وضعیت «موجودی رو به پایان» در ویترین باید از مقدار مؤثر پیروی کند و تنوع صفر قابل انتخاب نباشد.

#### محدودیت‌ها و سؤال باز

- معیار پوشش خطی ≥۹۰٪ اکنون با provider رسمی `@vitest/coverage-v8` اندازه‌گیری و در CI اجباری شده است؛ نتیجهٔ اصلاحات در بخش پایین آمده است.
- معیار «order fixture واقعی و byte-identical بعد از تغییر نرخ» با زمان‌بندی فازها تعارض دارد: مدل و جریان Order طبق نقشه در فاز 04 ساخته می‌شود. در این فاز قرارداد snapshot و محاسبات خالص تست شده‌اند؛ تست regression روی رکورد واقعی Order باید هم‌زمان با ساخت Order در فاز 04 اضافه شود، مگر اینکه مدیر محصول انتقال بخشی از فاز 04 به این PR را بخواهد.
- smoke واقعی Navasan به کلید API نیاز دارد. parser با نمونهٔ ثبت‌شده و واحد تومانِ الزام D06/سند فاز تست شده است؛ تماس احراز هویت‌شده باید هنگام فراهم‌شدن secret در staging انجام شود.

### اصلاح یافته‌های فاز ۰۳ — ۱۰ سپتامبر ۲۰۲۶

- ده یافتهٔ بازبینی PR #9 اصلاح شد: انتقال نرخ‌های معتبر قبلی با migration افزایشی؛ محافظ تعمیرات و تراکنش یکپارچهٔ CSV؛ کنترل بازار/انتشار محصول در quoteCart؛ کنترل مجوز بهای خرید؛ نرخ واقعی تاریخ دریافت کالا؛ فیلتر و مرتب‌سازی بر مبنای قیمت مؤثر؛ نمایش نرخ دستی مؤثر؛ اعمال taxable؛ ویرایش fxMode همراه audit و invalidation.
- اصلاح تکمیلی انبار: کاهش موجودی به Lotهای FIFO همان انبار تخصیص می‌یابد؛ افزایش فقط با هزینه و snapshot معتبر یک Lot تازه و حرکت ADJUST می‌سازد. سطرهای تکراری سبد پیش از کنترل موجودی تجمیع می‌شوند.
- نسخه‌های امنیتی همان PR #10 در این شاخه هم ثبت شده‌اند: Next.js/eslint-config-next 15.5.25، React/React DOM 19.1.9.
- آزمون محلی: lint، TypeScript، build تولیدی و ۲۳۰ تست واحد موفق؛ ۵۱ تست integration به‌علت نبود PostgreSQL محلی اجرا نشده‌اند و CI مرجع آن‌هاست. پوشش خطی: Money برابر ۱۰۰٪، FX برابر ۱۰۰٪، سرویس قیمت ۹۹٫۶۵٪، موتور هزینه ۹۷٫۹۵٪، quote سبد ۹۵٫۴٪ و انبار ۹۹٫۷٪. حداقل ۹۰٪ برای هر فایل حساس در test:coverage و CI اجباری شد.
- تست مرورگر خطای تبدیل تاریخ نرخ در کش را آشکار کرد؛ شکل دادهٔ کش صریح و تاریخ هنگام خواندن بازسازی شد. تست بازگشت با رفت‌وبرگشت واقعی JSON ابتدا شکست خورد و پس از اصلاح پاس شد.
- تست‌های جدید شامل rollback واقعی چندسطره، سازگاری موجودی/Lot و migration ارتقا بدون seed در PostgreSQL و تغییر سیاست FX در مرورگرند. موفقیت نهایی این موارد از اجرای CI روی آخرین commit همان PR خوانده می‌شود؛ بازبینی مستقل و اجازهٔ Merge مالک همچنان لازم‌اند.
- فیلتر قیمت ابتدا قیمت مؤثر نامزدها را محاسبه و سپس صفحه‌بندی می‌کند؛ برای کاتالوگ MVP مناسب است، ولی پیش از ورود کاتالوگ بسیار بزرگ باید روی دادهٔ واقعی اندازه‌گیری کارایی شود.
- موارد معوق همچنان صریح‌اند: staging و CP1، تست احراز هویت‌شدهٔ Navasan، و آزمون snapshot روی Order واقعی در فاز ۰۴.
- Implemented against docs v1.2 / D-numbers touched: D04, D06, D08, D17, D24, D27, D29, D31, D32, D38, D47, D49.

### آغاز فاز ۰۴ — ۱۰ سپتامبر ۲۰۲۶
- PR #10 و #9 پس از تأیید CI و رفع یافته‌های بازبینی ادغام شدند؛ مبنای فاز ۰۴ commit 58c9fa0 است.
- CI نهایی فاز ۰۳: ۲۸۱ تست واحد/دیتابیس و ۴۷ تست مرورگر پاس؛ پوشش خطی فایل‌های حساس ۹۹٫۲۵٪؛ Docker و LocalStorage/S3 backup→restore موفق (run 34465124340).
- اختیار ادغام و زمان‌بندی زیرساخت مطابق دستور مالک در D50/D51 ثبت شد.
- فاز ۰۴ در حال پیاده‌سازی است و تا تکمیل جریان خرید و معیارهای سند فاز، تکمیل‌شده اعلام نمی‌شود.


### پیاده‌سازی و آزمون فاز ۰۴ — ۱۰ سپتامبر ۲۰۲۶
- سبد سمت سرور با کوکی تصادفی HttpOnly، قفل بازار، بازقیمت‌گذاری و ادغام زیر قفل هنگام ورود؛ ورود مشتری با Auth.js مستقل از مدیر، OTP ده‌دقیقه‌ای با پنج تلاش و محدودیت ایمیل/IP، لینک یک‌بارمصرف و صف ایمیل رمز‌شده.
- خرید سه‌مرحله‌ای سه‌زبانه با ذخیره خودکار آدرس، انتخاب حمل، پذیرش قوانین CMS و تراکنش ایجاد سفارش/شماره بازار/رزرو/پرداخت/ایمیل. مبلغ، اقلام، قواعد هزینه و نرخ‌ها snapshot دارند و trigger دیتابیس تغییر یا حذف مالی را منع می‌کند.
- پرداخت بانکی با تنظیم حساب‌ها و دستورالعمل سه‌زبانه در پنل؛ رسید JPG/PNG/PDF تا ۵MB، تشخیص نوع از بایت، لینک امضاشده ده‌دقیقه‌ای، منع مسیر عمومی و منع تغییر/حذف رسید از مدیریت رسانه.
- سفارش‌های مدیر با کنترل دامنه بازار در سرور، جست‌وجو/فیلتر ذخیره‌شده/CSV، تأیید/رد/نقدی/لغو/تمدید رزرو/یادداشت/اصلاح آدرس؛ KPI از داده واقعی. تأیید زیر قفل سفارش و موجودی، مصرف FIFO یک‌باره؛ کمبود موجودی به NEEDS_REVIEW می‌رود.
- مدل‌های مرجوعی و اعتبار برای فاز بعد و فهرست فقط‌خواندنی؛ پروفایل، آدرس‌ها، سابقه سفارش و درخواست حذف مشتری. SMTP/Resend پشت رابط و صف با retry؛ Mailpit در محیط توسعه و CI، بدون ارسال آزمایشی به سرویس واقعی.
- آزمون محلی فعلی: lint و typecheck موفق، ۲۴۴ تست واحد پاس. ۶۱ تست دیتابیس محلی اجرا نشده‌اند؛ سه سناریوی جدید Playwright خرید و OTP/رسید اضافه شده‌اند. نتیجه CI و Docker/restore باید قبل از اعلام اتمام ثبت شود.
- تست دستی: محصول را به سبد اضافه کنید، از ایمیل Mailpit وارد شوید، آدرس/هزینه/قوانین را تأیید کنید؛ رسید نمونه ارسال، از پنل یک بار رد، دوباره ارسال و تأیید کنید. عدد موجودی باید فقط یک واحد کم شود؛ لینک خام رسید باید 404 باشد.
- وضعیت: در انتظار آزمون PostgreSQL/مرورگر و رفع یافته‌های آن؛ ادغام هنوز انجام نشده است. اتصال ایمیل واقعی، حساب بانکی واقعی و پذیرش staging پس از تهیه زیرساخت جزو دروازه انتشار باقی می‌مانند. داده بانکی seed صرفاً نمایشی است.
- Implemented against docs v1.2 / D-numbers touched: D04, D07, D13, D14, D15, D17, D18, D24, D31, D32, D33, D38, D40, D50, D51.

- CI اولیه روی PostgreSQL خطای casing وضعیت صفحه قوانین (`published`) و خروجی `void` قفل advisory را آشکار کرد؛ هر دو اصلاح شدند. بررسی مبلغ پذیرفته‌شده مشتری در زمان ثبت، کنترل دوباره مالکیت سبد زیر قفل و جزئیات آدرس/هزینه/timeline مدیر نیز تکمیل شد. این اصلاحات باید در اجرای بعدی CI تأیید شوند.
- بازبینی مرز Auth.js نشان داد ارسال فیلد اختیاری با مقدار undefined در URLSearchParams به متن تبدیل می‌شود؛ اکنون فقط کد یا فقط توکن ارسال می‌شود و تست regression مرز Server Action اضافه شده است. خروجی عملیات گروهی، تعداد موفق/ناموفق را نشان می‌دهد. Snapshot قانون هزینه از همان دادهٔ quote گرفته می‌شود تا تغییر هم‌زمان تنظیمات، سند مالی ناسازگار نسازد.

- اجرای 34473891175: آزمون‌های واحد/دیتابیس، build، Docker و دو مسیر backup→restore موفق؛ ۴۷ تست قبلی مرورگر پاس و ۳ جریان جدید خرید در ورود متوقف شدند. اصلاح انتقال credential در Auth.js در commit بعدی ثبت شد؛ نتیجه خرید کامل هنوز در حال بررسی است.

- اجرای 34474502168 ورود مشتری و ایجاد سفارش را عبور داد اما refresh خودکار Server Action پس از اتمام سبد، مشتری را به سبد خالی می‌فرستاد. هدایت به صفحه پرداخت اکنون با redirect سمت سرور و خارج از catch انجام می‌شود؛ تست مرورگر دوباره اجرا می‌شود.

- اجرای 34475208533: هر ۳۰۸ آزمون واحد/دیتابیس، build، Docker و LocalStorage/S3 backup→restore موفق شدند. سه جریان خرید تا بارگذاری رسید و کنترل لینک خصوصی رسیدند؛ انتخاب مبهم فرم در تست پنل مدیریت اصلاح شد.
- بازبینی هم‌زمانی، race ساخت Customer مهمان را آشکار کرد؛ upsert اکنون اتمیک دیتابیس است و پروفایل موجود را تغییر نمی‌دهد. تست رقابت دو مشتری برای آخرین واحد، علت شکست را صریحاً کمبود موجودی بررسی می‌کند؛ تست جداگانهٔ دو خرید هم‌زمان با یک ایمیل تازه و موجودی کافی نیز اضافه شد.
- نقص امنیتی Cron در نبود CRON_SECRET بسته شد: درخواست با مقدار literal undefined و تنظیم خالی اکنون پیش از اجرای هر کار، 401 می‌گیرد. دو تست regression اضافه شدند. تصمیم نشست مشتری مستقل در D52 ثبت شد.
- این اصلاحات در انتظار CI آخرین commit هستند؛ گزارش نتیجه نهایی و ادغام در PR #11 ثبت می‌شود. اتصال SMTP واقعی، اطلاعات بانکی واقعی، secrets عملیاتی و پذیرش پیش از انتشار همچنان انجام نشده‌اند.

### آغاز فاز ۰۵ — ۱۰ سپتامبر ۲۰۲۶
- فاز ۰۴ در PR #11 با commit ادغام becb86ef0b90faf9dba9751faa567392d40733e2 بسته شد. اجرای 34476163861: هر سه checks/docker/docker-runtime سبز، ۳۱۱ تست واحد/دیتابیس و ۵۰ تست مرورگر پاس؛ LocalStorage/S3 backup→restore موفق. گزارش‌های «در انتظار» بالاتر تاریخچه اجرا هستند.
- فاز ۰۵ از امنیت مدیر، MFA، ابطال نشست و نقش‌ها آغاز می‌شود و سپس عملیات ارسال، فاکتور، مرجوعی و ابزارهای بکاپ تکمیل خواهند شد. بدون خرید هاست و دامنه طبق دستور دوباره مالک و D51 ادامه می‌دهیم؛ پذیرش واقعی پیش از انتشار همچنان باز است.

- بخش امنیتی فاز ۰۵: دفتر AdminSession با ابطال فوری و نسخه نشست، راه‌اندازی اجباری MFA برای نقش‌های حساس، کد بازیابی یک‌بارمصرف، منع بازپخش TOTP زیر قفل و محدودیت تلاش؛ کاربر بدون MFA فقط به راه‌اندازی دسترسی دارد. نقش‌های حساسِ سفارشی و استثناهای users.manage/security.role.manage نیز مشمول MFA هستند.
- نقش‌ها و استثناهای مجوز قابل ویرایش شدند؛ کنترل واگذاری فراتر از اختیار و حفاظت از آخرین مالک اضافه شد. تغییر کاربر/نقش، ابطال نشست و audit به‌صورت تراکنشی ثبت می‌شوند. namespace مجوزها صریح و scope نامعتبر fail-closed است.
- بررسی محلی این بخش: TypeScript و ۲۵۵ تست واحد موفق؛ ۶۹ تست دیتابیس فقط در CI اجرا خواهند شد. دو سناریوی مرورگر MFA جدید هستند؛ تست‌های قبلی با کد بازیابی واقعی از مسیر Auth.js عبور می‌کنند و هیچ bypass آزمایشی در برنامه وجود ندارد.
- کل فاز ۰۵ هنوز تکمیل نشده است: ارسال/رهگیری/فاکتور/مرجوعی، ابزار بکاپ و ماتریس جامع endpointهای عملیاتی باقی‌اند. ادغام بخش امنیتی نیز منوط به موفقیت CI است.
