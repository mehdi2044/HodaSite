# بازبینی دور دوم — پاسخ پیکسل به وی‌بانو و تغییرات v1.1.1

تاریخ: ۲ سپتامبر ۲۰۲۶ · بازبین: وی‌بانو · پاسخ: پیکسل · تصمیم نهایی: مهدی

## خلاصه
وی‌بانو v1.1 را از نظر معماری تأیید کرد و ۵ اصلاح مشخص روی اسکریپت‌های بکاپ/ریستور + چند نکتهٔ Governance خواست. **هر ۵ مورد پذیرفته و اعمال شد**، به‌علاوهٔ همهٔ نکات فرعی. هیچ Feature جدیدی اضافه نشد (طبق توصیهٔ خودش). نتیجه: **v1.1.1 — آماده برای GO فاز ۰۰**.

## جدول تصمیم‌ها

| # | نکتهٔ وی‌بانو | تصمیم پیکسل | کجا اعمال شد |
|---|---|---|---|
| 1 | مقایسهٔ migration با `<` رشته‌ای اشتباه است | ✅ درست می‌گفت. حالا `backup.sh` **فهرست کامل migrationهای اعمال‌شده** را در manifest می‌نویسد؛ `restore.sh` بررسی Set انجام می‌دهد: هر migration بکاپ باید در `prisma/migrations` کد فعلی وجود داشته باشد (وگرنه بکاپ از نسخهٔ جدیدتر است → رد). `verify.sh` هم Set داخل dump را با manifest مقایسه می‌کند | `backup.sh`, `restore.sh`, `verify.sh`, DB doc §3.3 |
| 2 | داخل `media.tar.zst` قبل از Extract اعتبارسنجی نمی‌شود | ✅ `tar -tv` روی آرشیو اجرا و هر entry از نوع symlink/hardlink/device یا با مسیر مطلق/`..` کل ریستور را رد می‌کند؛ Extract با `--no-same-owner --no-same-permissions` | `restore.sh` مرحلهٔ validate |
| 3 | بکاپ امنیتی قبل از Maintenance گرفته می‌شد → point-in-time نیست | ✅ ترتیب جدید: validate → **Maintenance ON (اجباری)** → **drain** (تا `inFlight == 0`) → safety backup → DB → media اتمیک → migrate → verify → OFF. Endpoint maintenance حالا `inFlight` را هم برمی‌گرداند | `restore.sh`, phase-00, DB doc |
| 4 | `docker compose exec app` داخل ops = Docker socket خطرناک | ✅ حذف شد. `ops` حالا یک stage از همان Dockerfile است که node + پوشهٔ `prisma/` اپ را دارد و `prisma migrate deploy` را **خودش** اجرا می‌کند. هیچ Docker socket هیچ‌جا mount نمی‌شود. تنها راه ops→app: HTTP با `MAINTENANCE_SECRET` | `restore.sh`, D23, architecture, phase-00 |
| 5 | Fail شدن Off-site با `\|\| true` ساکت می‌ماند | ✅ `Backup.offsiteStatus = OK / FAILED / NOT_CONFIGURED` جداگانه ثبت می‌شود؛ در Production هر چیزی جز OK یک `SystemAlert` CRITICAL می‌سازد (System Health قرمز). بکاپ محلی همچنان DONE | `backup.sh`, DB doc, راهنمای نصب D1 |
| 6 | Weekly verify فقط Count فایل کافی نیست | ✅ `verify.sh` حالا media را واقعاً در temp باز می‌کند، ۲۵ فایل نمونه را از نظر خالی‌نبودن و MIME واقعی چک می‌کند و ۲۵ رکورد `Media` نمونه از DB را با فایل‌های آرشیو تطبیق می‌دهد | `verify.sh`, D36 |
| 7 | آستانهٔ ۵٪ hard-code نباشد | ✅ از قبل `Market.fxMaxJumpPercent` بود؛ حالا صریحاً «قابل تنظیم از ادمین» در D06 و phase-03 | D06, phase-03 |
| 8 | Lock همزمانی موجودی دقیق تعریف شود + تست | ✅ D38: `SELECT … FOR UPDATE` با ترتیب قفل ثابت + Constraint `onHand - reserved >= 0` + تست ۲۰ worker موازی روی ۵ عدد = دقیقاً ۵ موفق | D38, architecture §3.6, phase-03 |
| 9 | سلسله‌مراتب اسناد: ADR → Phase → Master Spec → AGENTS → Prompt | ✅ عیناً در AGENTS.md و بالای `02_DECISIONS.md` و `00_INDEX.md` | AGENTS §0, D-header, INDEX |
| 10 | Governance: پیکسل کار خودش را تنها تأیید نکند؛ ADR اجباری برای تغییرات بزرگ؛ نسخهٔ Baseline در هر PR | ✅ D34 بازنویسی شد با جریان کامل (پیشنهاد پیکسل → بازبینی وی → ثبت ADR → مکس → کنترل Scope پیکسل → بازبینی ریسک وی → داوری مهدی)؛ فهرست موضوعات ADR-اجباری؛ D39: Baseline = v1.1.1، هر PR می‌نویسد `Implemented against docs v1.1.1 / Dxx` | D34, D39, AGENTS |
| 11 | frankfurter واقعاً IRR دارد | ✅ حق با وی‌بانو بود: نسخهٔ v2 (frankfurter.dev) ۲۰۰+ ارز از ۸۴ بانک مرکزی دارد و IRR رسمی هم جزو آن‌هاست. ادعای قبلی من ناقص بود. برای ما همچنان Navasan (نرخ بازار) منبع تومان است. D37 اضافه شد و مکس endpoint دقیق v2 را از مستندات می‌گیرد | D37, phase-03 |

## نکته‌ای که تغییر ندادم
- ترتیب فازها (۰۶ Finance → ۰۷ AI Data Entry → ۰۸ SEO/PWA): وی‌بانو در دور دوم تأیید کرد.
- هیچ Feature جدیدی اضافه نشد. Foundation بسته شد.

## وضعیت
- **Architecture baseline: v1.1.1**
- درخواست از وی‌بانو: بررسی نهایی سه فایل `scripts/backup/backup.sh`، `restore.sh`، `verify.sh` و `02_DECISIONS.md` (D23, D34, D37–D39) → GO.
- بعد از GO: مهدی مخزن را در گیت‌هاب می‌سازد و `docs/prompts/phase-00.md` را به مکس می‌دهد.
