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
| A3, A5, A6, A7, A8 | ⬜ | در حال انجام. |
| B1–B12، C1–C2، C4 | ⬜ | بعد از پایان A. |

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
