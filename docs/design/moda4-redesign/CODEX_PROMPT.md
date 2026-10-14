# دستور اجرایی Codex — MODA4 / DESIGN-01

این دستور پس از تحویل دستی لینک توسط مهدی فعال می‌شود. ثبت آن در GitHub اجرای خودکار نیست. مبنای اختیار: ظاهر MODA4 و اتاق پرو منتخب مالک؛ تغییر فونت/جزئیات فنی واگذار شده؛ تصاویر قابل مدیریت و لباس‌های دارای قیمت زنده و پیش‌نمایش به‌روز صریحاً خواسته شده‌اند. **مرج هر PR فقط با اجازهٔ صریح مهدی و D70.**

## مأموریت

در مخزن `mehdi2044/HodaSite`، فاز DESIGN-01 را طبق D77/D78 و `docs/phases/phase-design-01.md` اجرا کن. از **R0: preview واقعی فروشگاه و پنل** شروع کن و سپس **R1: فونت و پایهٔ بصری MODA4** را تحویل بده. مراحل R2…R7b را به ترتیب وابستگی، هرکدام در PR جدا، ادامه بده. R7c تا تشخیص مستند، ADR و بودجهٔ صریح مسدود است. از صفر طرح تازه نساز؛ ویژگی‌های مورد پسند MODA4 را حفظ و به سیستم واقعی متصل کن.

## ۰. شروع دقیق و منابع

1. `AGENTS.md` و ترتیب خواندن §0 را اجرا کن. نسخهٔ جاری main، PR60/64/65، PR این اسناد و Issue62/63 را از GitHub بخوان؛ SHA، وضعیت merge و اختلاف‌ها را ثبت کن. شمارهٔ PR یا سبزبودن قدیمی CI را معادل ادغام و صحت امروز نگیر.
2. منابع: D77/D78 در `docs/02_DECISIONS.md` → `docs/phases/phase-design-01.md` → `docs/design/moda4-redesign/SHOPPABLE_SCENES_AND_PREVIEW.md` → الزامات عملکردی کامل #62 و backlog #63 → SPEC و prototype PR65 برای ظاهر → FITTING_ROOM_PLAN.
3. اگر این اسناد هنوز روی main نیستند، PR/branch اسناد را بخوان و branch اجرای خود را با dependency صریح از نسخهٔ مناسب بساز. پیش از کد، تصمیم‌ها/فاز در branch اجرا حاضر باشند. از PR64 دارای طرح قدیمی به‌عنوان source of truth استفاده نکن. history مشترک را rewrite یا force-push نکن.
4. اصلاحات واقعی PR60/#63 را inventory کن؛ وجودشان در main را بررسی کن. blockerهای باز، از جمله ناوبری تغییرات ذخیره‌نشدهٔ پنل، با مدرک پیگیری شوند. بدون بررسی PR60 را merge یا همهٔ commitهایش را cherry-pick نکن؛ قابلیت لازم را در PR وابسته و با ارجاع شفاف حل کن.
5. در PROGRESS ثبت کن `STARTED`، مرحله، base/head و وابستگی؛ اسناد قبلی که هدف بصری دیگر دارند فقط در همان موضوع superseded هستند، نه الزامات خرید/مدیریت.

## ۱. نخستین خروج ملموس — R0

نسخهٔ واقعی همین Next.js/PostgreSQL را با DB آزمایشی و admin واقعی در محیط قابل دسترسی مالک اجرا کن. یک URL ثابت فروشگاه و URL پنل همان build بده؛ روش مشاهدهٔ کد تازه، زمان آخرین build موفق و content revision روشن باشد. تغییر فرم → preview، save → reload → storefront و تغییر قیمت کالا → قیمت صحنه را در مراحل مربوط واقعاً نشان بده.

پیش‌نمایش HTML/دادهٔ موک جای این خروج نیست. لینک localhost محیط ابری را به‌عنوان لینک قابل مشاهدهٔ مهدی نده. از زیرساخت موجود استفاده کن؛ در نبود دسترسی، دقیقاً `BLOCKED_ENV` و نیاز واقعی را بنویس، کار مستقل R1 را ادامه بده و preview را آماده اعلام نکن. هیچ credential عمومی، bypass ورود، پرداخت/ایمیل/AI تولیدی یا حذف دادهٔ مالک برای آسان‌کردن demo مجاز نیست. دسترسی محیط را مطابق ابزار و قواعد خود آن فراهم کن.

## ۲. R1 و انتخاب‌های قطعی

- تیتر en/tr: **Manrope**؛ UI/body/prices: **Inter**؛ فارسی: **Vazirmatn**. self-host با LICENSE بستهٔ pin‌شده، Latin-ext ترکی، font-display swap، نقش‌های امن در DB/admin. فونت‌های دست‌نویس/mono/serif طرح برای متن و قیمت تازه جایگزین شوند؛ لوگوی outline موجود حفظ.
- tokenهای MODA4/دکمه بافت‌دار/توری/حرکت حفظ و از ThemeSettings کنترل شوند. hex شش‌رقمی + opacity محدود؛ font/CSS/URL آزاد نپذیر. SVG آپلودی را inline نکن؛ از PNG یا asset ثابت امن استفاده کن.
- بدون splash مسدودکننده؛ حرکت کوتاه لوگو اختیاری و غیرمسدودکننده. تم پروفایل مستقیم ROSE/SLATE/SAND؛ واسطهٔ جنسیت حذف. پروی فوری مهمان رایگان، ذخیرهٔ کمد/AI خصوصی پس از ورود.
- mobile-first 390px، fa/tr/en و بازارهای مستقل، RTL logical CSS، keyboard و touch ≥44px؛ motion متوقف در offscreen/hidden/focus، reduced-motion و fallback واقعی.

## ۳. قلب اجرای R3 — قیمت روی لباس و اتصال پنل

قرارداد کامل SHOPPABLE_SCENES_AND_PREVIEW را بدون حذف اجرا کن:
- هر لباس قابل فروش در hero/banner/ShopLook/Lookbook/FittingAd یک reference واقعی محصول/رنگ و price resolver مشترک دارد؛ قیمتِ همیشه‌خوانا، نه tooltip یا عدد تایپ‌شده.
- مدیر عکس موبایل/دسکتاپ، focal، لباس/رنگ و جای برچسب را انتخاب و پیش‌نمایش، ذخیره، زمان‌بندی، انتشار و rollback کند. همهٔ تصاویر محتوایی از media قابل مدیریت باشند.
- تعویض لباس COMPOSITE تصویر و برچسب را هم‌زمان عوض کند؛ PHOTO نیازمند عکس منطبق/تأیید تطبیق و منع انتشار برچسب ناسازگار است. تغییر قیمت به‌تنهایی تصویر تازه نمی‌خواهد.
- قیمت/FX/تخفیف/stock با بازار و pipeline موجود Decimal هماهنگ؛ اختلاف قیمت سایزها «از/بازه» تا انتخاب واقعی؛ نه USD ثابت، سایز ساختگی یا صفر برای خطا.
- افزودن ست پس از انتخاب همهٔ سایزها، atomic در cart موجود با quote تازه. تعارض catalog/media/publish، permission و audit در سرور و transaction.
- draft خصوصی و خارج PWA/CDN؛ revision conflict و async response ordering؛ صفحهٔ باز preview بعد از save بدون reload دستی به‌روز شود. تغییر کد فقط با HMR فعال یا build/deploy موفق جدید.

## ۴. اتاق پرو و کارهای عقب‌افتاده

- R4 قرارداد cutout/هندسه و پنل آن را پیش از Kids/R7a آماده کند؛ Prisma model واقعی `Variant`، تمام WOMAN/MAN/GIRL/BOY و SHOES، ACCESSORY با anchor، محدودیت چهار قطعه فقط پرو.
- R7a ذخیرهٔ مستقل ترکیب مشتری بسازد؛ `saveLook` فعلی فقط جلسهٔ AI با status=DONE است. toast، fake DONE یا debit برای ذخیرهٔ رایگان نپذیر. reload/ownership/export/anonymization را آزمون کن.
- R7b علت خرابی واقعی را از queue/cron/session/errorCode و storage بدون paid request بررسی کند؛ وضعیت واقعی FAILED و اثر ledger refund را با هم اشتباه نگیرد. تا نبود شواهد، کیفیت provider را علت قطعی نگو.
- R7c فعلاً اجرا نشود: هیچ provider replacement، cache رایگان عمومی، pipeline چندمرحله‌ای پولی یا fallback خودکار پس از timeout. بودجه/ADR و حفاظت session-bound encryption مقدم است.
- نیازهای قبلی #62 شامل کمپین واقعی، تخفیف، پاپ‌آپ/ویدیو اختیاری، version history/schedule، کامل‌بودن خرید و تمام AC-01…18 حفظ؛ backlog #63 با evidence رفع یا باز گزارش شود.

## ۵. پایان هر مرحله و ادامه

Branch `phase/design-01-rX-...` و Draft PR `Phase DESIGN-01 R<X>: ...`؛ خلاصه فارسی، English technical notes و `Implemented against docs v1.2 / D-numbers touched: …`. فقط scope همان مرحله؛ dependency/stack order واضح. برای تصمیم‌های فنی تفویض‌شده تأیید تکراری نخواه؛ سؤال فقط برای مانع واقعی محیط/بودجه/دامنهٔ حل‌نشده.

تست معنی‌دار flow واقعی admin/save/reload/storefront و catalog/quote/stock؛ unit/PG پول و مجوز و concurrency، Playwright زبان‌ها/موبایل، lint/typecheck/test و build/restore/e2e لازم طبق AGENTS. reset DB فقط در محیط آزمایشی ایزوله. PROGRESS و راهنمای فارسی setup/panel به‌روز شوند.

تحویل هر PR: URL همان preview، head فعال، screenshot موبایل/دسکتاپ و walkthrough کوتاه تغییر پنل، نتیجهٔ AC/MODA مربوط، اثر داده/rollback و شواهد سه بخش **local / CI / not verified**. شواهد اجرا‌نشده را موفق ننویس. Ready فقط بعد از تکمیل واقعی/چک‌های لازم؛ نقص تازه را Draft نگه دار.

**هرگز merge نکن یا مستقیم به main push نکن.** D70: current-head required checks، آخرین review واقعی همان SHA بدون blocker، گفتگوهای مسدودکننده حل‌شده و اجازهٔ صریح مهدی. خودبازبینی/CI جای تأیید مستقل یا پذیرش ظاهری مالک نیست.
