# وضعیت پیشرفت پروژه

> مکس (Codex): بعد از هر فاز این فایل را به‌روز کن. برای هر فاز بنویس: وضعیت، چه چیزی ساخته شد، **تست دستی به زبان ساده فارسی**، محدودیت‌های شناخته‌شده، سؤال‌ها برای مدیر پروژه.

| فاز | نام | وضعیت | تاریخ | PR |
|---|---|---|---|---|
| 00 | Foundation | 🔍 آمادهٔ بازبینی | ۲۰۲۶-۰۹-۰۲ | Phase 00: Foundation |
| 01 | Settings / Theme / CMS / Translations / Media | ⬜ | | |
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
| B11–B12، C1–C2، C4 | ⬜ | در حال انجام. |

**وضعیت راستی‌آزمایی (Phase 00 review round 1):**
- **محلی اجرا شد و سبز:** `prisma validate`, `prisma format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (۱۲/۱۲)، `docker compose ... config` برای هر دو فایل. Smoke با `next dev`: ریدایرکت‌های `/admin`، سرو فایل‌های فونت + LICENSE، endpointهای maintenance/state و ۴۰۱‌ها.
- **فقط در CI اجرا شد و سبز** (این ماشین Postgres و Docker daemon ندارد): `pnpm prisma migrate deploy && pnpm prisma db seed`، `pnpm build` کامل، `bash scripts/backup/tests/run.sh`، `pnpm e2e` (۱۴ تست: سه‌زبانه/RTL، ورود owner نمونه → داشبورد، ریدایرکت `/admin`، آپلود PNG واقعی + رد فایل متنیِ `.png`، گیت تعمیرات 503). job `docker`: `docker build --target runner .` ✅، `docker build --target ops .` ✅، وجود `schema.prisma` و Prisma CLI در image ops ✅، `docker compose config` هر دو فایل ✅.
- **هنوز اصلاً راستی‌آزمایی نشده:** `docker compose -f docker-compose.yml up` کامل end-to-end (اجرای هم‌زمان postgres/minio/migrate/app/caddy و باز شدن سایت از پشت Caddy)، `docker compose run --rm ops npx prisma migrate deploy` روی دیتابیس واقعی، اجرای `backup.sh`/`restore.sh` داخل کانتینر `ops`. باید روی سرور یا محیط دارای Docker اجرا شود.
- **بدهی شناخته‌شده:** (برطرف شد در B9) کامنت‌های درون‌خطی `.env.example` حذف شدند.

**یادداشت ADR پیشنهادی (شمارهٔ D توسط پیکسل بعد از بازبینی وی‌بانو):**
نشست ادمین از استراتژی **JWT** استفاده می‌کند، نه `session.strategy: "database"`، چون Auth.js v5 از Credentials provider با نشست دیتابیسی پشتیبانی نمی‌کند (خطای صریح: «Credentials provider is present but the JWT strategy is not enabled»). جدول‌های `Account`/`Session` در اسکیما می‌مانند برای جریان magic-link مشتری در فاز ۰۴. عمر نشست کوتاه است: **۸ ساعت** (`SESSION_MAX_AGE_SECONDS` در `src/modules/auth/config.ts`). `AUTH_SECRET` اجباری است و بدون آن سرور بالا نمی‌آید (`src/instrumentation.ts`)؛ هیچ مقدار پیش‌فرضی در کد نیست.

**احراز هویت ≠ مجوز.** امضای معتبر JWT به‌تنهایی هرگز نباید دسترسی بدهد: غیرفعال‌کردن یک کاربر یا تغییر مجوزهایش باید فوری اثر کند، مستقل از عمر ۸‌ساعتهٔ توکن. امروز `can()` کاربر را در هر اکشنِ مجازشده از دیتابیس می‌خواند و `isActive` را چک می‌کند، پس مسیر اکشن پوشش داده شده است. **پیگیری فاز ۰۵:** `sessionVersion` / ابطال توکن (تا آن زمان، فقط دیدن صفحه‌های ادمین ممکن است تا انقضای توکن عقب بیفتد؛ هیچ اکشنی اجرا نمی‌شود).

### تصمیم‌های گرفته‌شده در طول کار
_(هر تغییر کوچکی که Claude/مهدی در طول فازها تأیید کردند اینجا ثبت شود؛ تغییرات بزرگ به `02_DECISIONS.md` می‌رود)_

#### وضعیت
🔍 آمادهٔ بازبینی — ۲ سپتامبر ۲۰۲۶

#### چه چیزی ساخته شد
- اسکلت Next.js 15 سه‌زبانه، RTL، تم دیتابیس‌محور و صفحهٔ خانهٔ نمایشی.
- پنل مدیریت، ورود مدیر، کاربران، تنظیم برند/رنگ، نمایش اجزای طراحی و سلامت سیستم.
- طرح اولیهٔ PostgreSQL/Prisma، نقش‌ها و دسترسی، صف کار، ذخیره‌سازی محلی/S3 و دادهٔ نمونهٔ سه بازار.
- Docker توسعه/تولید، ops بدون Docker socket، کران، بکاپ/ریستور سخت‌گیری‌شده و CI.
- دروازهٔ تست پول Decimal، گردکردن و ثابت‌ماندن snapshot نرخ ارز.

#### تست دستی ساده
1. فایل `.env.example` را به `.env` کپی کنید و رمز مدیر را عوض کنید.
2. دستور `docker compose -f docker-compose.dev.yml up --build` را اجرا کنید.
3. در موبایل، `http://localhost:3000/fa` را باز کنید؛ متن باید راست‌چین باشد. سپس `/tr` و `/en` را ببینید.
4. وارد `http://localhost:3000/admin/login` شوید. ایمیل و رمز همان فایل `.env` است.
5. در «برند» نام سایت و در «پوسته» رنگ اصلی را عوض کنید؛ صفحهٔ فروشگاه را تازه کنید.
6. آدرس `http://localhost:3000/api/health` باید وضعیت دیتابیس، فایل‌ها، بکاپ و نرخ ارز را نشان دهد.

#### محدودیت‌های شناخته‌شده
- کاتالوگ و ورود مشتری عمداً مربوط به فازهای بعدی‌اند.
- MFA در دیتابیس آماده است؛ اجباری‌کردن آن طبق برنامه در فاز ۰۵ انجام می‌شود.
- فونت‌های دارای مجوز باید در مسیرهای مستندشده جایگزین فایل‌های placeholder شوند.
