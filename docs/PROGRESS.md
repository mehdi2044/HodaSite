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
| A8 | ✅ | شمارندهٔ واقعی in-flight (`src/lib/request-metrics.ts`) — **per-instance، فرض تک‌کانتینر** (در فایل مستند شده). چون middleware نکست هوک «پایان پاسخ» ندارد، شمارش دور کار واقعی mutation انجام می‌شود (Server Actionها از طریق `withMutation`، و route handlerهای `uploads` و `cron/tick`)، نه در middleware. `GET /api/system/maintenance` مقدار واقعی `inFlight` را برمی‌گرداند. در حالت تعمیرات، درخواست‌های نوشتن با 503 رد می‌شوند: هم در لایهٔ اپ (منبع حقیقت، با کش ۵ ثانیه‌ای که موقع toggle پاک می‌شود) و هم یک گیت جلویی در middleware (از `GET /api/system/maintenance/state` عمومی می‌خواند چون edge به Prisma دسترسی ندارد). `/admin` و خود endpoint تعمیرات باز می‌مانند. تست e2e سریالی: 503 روی نوشتن هنگام تعمیرات، بازگشت به 200 بعد از خاموش‌کردن، و فیلد `inFlight`. |
| A5 | ✅ | `docker-compose.yml` بازنویسی شد به کامپوز واقعی تولید: `target: runner`، بدون mount سورس، بدون `pnpm dev`، بدون mailpit، بدون پورت روی هاست برای `app` (فقط از پشت Caddy)، همهٔ اعتبارنامه‌ها از `.env`. سرویس‌ها: `postgres`, `minio`, `migrate` (یک‌بار، از image `ops`)، `app`, `cron`, `ops`, `caddy`. `docker-compose.dev.yml` دست‌نخورده ماند — **به‌جز** یک اصلاح حداقلی YAML در دستور `cron` که با پارسر Go در Docker Compose v2 اصلاً parse نمی‌شد (`command` به شکل exec-list). |
| A6 | ✅ | `public/fonts/vazirmatn/` و `public/fonts/inter/` با فایل‌های woff2 واقعیِ variable از `@fontsource-variable/*` (وزن ۱۰۰–۹۰۰) + فایل LICENSE (هر دو SIL OFL 1.1). `scripts/vendor-fonts.mjs` برای به‌روزرسانی. `@font-face` در `tokens.css` با `unicode-range` درست بازنویسی شد؛ دیگر placeholder نیست. |
| A7 | ✅ | Dockerfile: در stage `deps` قبل از install، `COPY prisma ./prisma` جدا اضافه شد (postinstall به schema نیاز دارد)؛ در stage `ops` سه خط جدا `COPY package.json ./` / `COPY prisma ./prisma` / `COPY scripts ./scripts` جایگزین `COPY package.json prisma scripts /app/` شد تا `schema.prisma` در `/app/prisma/` بنشیند و step 6 restore.sh کار کند. `entrypoint.sh` فقط سرور را استارت می‌کند؛ مایگریشن به سرویس `migrate` (image ops، دارای Prisma CLI) منتقل شد. `scripts/deploy.sh` حالا `/app/scripts/backup/backup.sh` را صدا می‌زند. |
| **بخش A** | ✅ **کامل** | همهٔ A0–A8 انجام شد؛ CI (هر دو job `checks` و `docker`) سبز. آمادهٔ بازبینی مستقل قبل از شروع بخش B. |
| B1–B12، C1–C2، C4 | ⬜ | بعد از بازبینی بخش A. |

**وضعیت راستی‌آزمایی (Phase 00 review round 1):**
- **محلی اجرا شد و سبز:** `prisma validate`, `prisma format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (۱۲/۱۲)، `docker compose ... config` برای هر دو فایل. Smoke با `next dev`: ریدایرکت‌های `/admin`، سرو فایل‌های فونت + LICENSE، endpointهای maintenance/state و ۴۰۱‌ها.
- **فقط در CI اجرا شد و سبز** (این ماشین Postgres و Docker daemon ندارد): `pnpm prisma migrate deploy && pnpm prisma db seed`، `pnpm build` کامل، `bash scripts/backup/tests/run.sh`، `pnpm e2e` (۱۴ تست: سه‌زبانه/RTL، ورود owner نمونه → داشبورد، ریدایرکت `/admin`، آپلود PNG واقعی + رد فایل متنیِ `.png`، گیت تعمیرات 503). job `docker`: `docker build --target runner .` ✅، `docker build --target ops .` ✅، وجود `schema.prisma` و Prisma CLI در image ops ✅، `docker compose config` هر دو فایل ✅.
- **هنوز اصلاً راستی‌آزمایی نشده:** `docker compose -f docker-compose.yml up` کامل end-to-end (اجرای هم‌زمان postgres/minio/migrate/app/caddy و باز شدن سایت از پشت Caddy)، `docker compose run --rm ops npx prisma migrate deploy` روی دیتابیس واقعی، اجرای `backup.sh`/`restore.sh` داخل کانتینر `ops`. باید روی سرور یا محیط دارای Docker اجرا شود.
- **بدهی شناخته‌شده:** `.env.example` کامنت‌های `KEY=value   # …` دارد که Docker Compose جزو مقدار می‌خواند (مثلاً `BACKUP_OFFSITE_ENDPOINT` مقدارش `# e.g…` می‌شود → backup.sh فکر می‌کند off-site تنظیم شده). خارج از A5–A7؛ باید در B9 یا یک اصلاح جدا کامنت‌های درون‌خطی از `.env.example` حذف شوند.

**یادداشت ADR پیشنهادی (شمارهٔ D توسط پیکسل بعد از بازبینی وی‌بانو):**
نشست ادمین از استراتژی **JWT** استفاده می‌کند، نه `session.strategy: "database"`، چون Auth.js v5 از Credentials provider با نشست دیتابیسی پشتیبانی نمی‌کند (خطای صریح: «Credentials provider is present but the JWT strategy is not enabled»). جدول‌های `Account`/`Session` در اسکیما می‌مانند برای جریان magic-link مشتری در فاز ۰۴. عمر نشست کوتاه است: **۸ ساعت** (`SESSION_MAX_AGE_SECONDS` در `src/modules/auth/config.ts`). `AUTH_SECRET` اجباری است و بدون آن سرور بالا نمی‌آید (`src/instrumentation.ts`)؛ هیچ مقدار پیش‌فرضی در کد نیست.

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
