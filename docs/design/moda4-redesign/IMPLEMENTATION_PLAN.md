# MODA4 — برنامهٔ اجرای نهایی DESIGN-01

به‌روز شده در ۲۰۲۶-۱۰-۱۴ پس از انتخاب ظاهر توسط مالک، تفویض فونت/اصلاحات و درخواست تصاویر قابل خرید و preview به‌روز. وضعیت: **دستور آماده، نه پیاده‌سازی انجام‌شده**.

شرح الزام‌آور و mapping تمام نیازهای قدیمی: [phase-design-01.md](../../phases/phase-design-01.md).
قرارداد جدید: [SHOPPABLE_SCENES_AND_PREVIEW.md](SHOPPABLE_SCENES_AND_PREVIEW.md).
دستور شروع: [CODEX_PROMPT.md](CODEX_PROMPT.md).
مرجع مدیریت واحد: [Issue62](https://github.com/mehdi2044/HodaSite/issues/62).

## تصمیم‌های طرح اولیه

| مورد اولیه | تصمیم جاری |
|---|---|
| A1 برند | MODA4 به‌عنوان default قابل مدیریت؛ seed غیرمخرب، نام/لوگو قابل تغییر |
| A2 فونت | D77 اصلاح D26: Manrope تیتر لاتین، Inter متن/قیمت، Vazirmatn فارسی؛ self-host؛ لوگوی outline حفظ |
| A3 theme | D77: token/role امن و crayon در DB/admin؛ hex شش‌رقمی و opacity محدود، نه CSS آزاد |
| A4 بلوک‌ها | D77: افزودن سازگار با Homepage و ShopLook موجود؛ scene مشترک قیمت/رسانه، بدون backend موازی |
| A5/A6 دسته/منو | D77: presentation افزایشی فقط در صورت نیاز schema موجود، پنل واقعی و قواعد ارث‌بری مشخص |
| A7 پروفایل | D78: انتخاب مستقیم ROSE/SLATE/SAND، نه پرسش جنسیت برای رنگ |
| A8 پروی فوری | D78: cutout/هندسه، guest preview و کمد مستقل مشتری؛ schema واقعی Variant |
| A9 provider | **به تعویق افتاده**؛ R7b اول تشخیص بدون هزینه؛ R7c پس از ADR و بودجهٔ صریح |
| Loader | محتوای صفحه مسدود نشود؛ حرکت کوتاه لوگو می‌ماند |
| عنوان لاتین | متن سه‌زبانهٔ قابل مدیریت، نه رشتهٔ ثابت؛ font role جدا از محتوای عنوان |

## ترتیب PRها

| مرحله | خروج |
|---|---|
| R0 | URL ثابت اپ واقعی و admin متصل به DB آزمایشی؛ چرخهٔ مشاهدهٔ تغییرات و محدودیت محیط روشن |
| R1 | برند/فونت/token/دکمه/motion در سیستم موجود و پنل پوسته |
| R2 | header/mega menu/search/cart drawer/footer واقعی و مدیریت رسانه/منو |
| R3 | صفحهٔ اصلی، تصاویر قابل خرید/قیمت روی هر لباس، پنل تمام تصاویر، draft/schedule/history/rollback/preview و کمپین واقعی #62 |
| R4 | پایهٔ مشترک cutout/هندسه و پنل قبل از مصرف، Kids pastel و inheritance دسته |
| R5 | PLP/PDP/ست/سبد/checkout؛ رفع یا حفظ اصلاحات معتبر #60/#63 |
| R6 | OTP موجود، profile theme/preferences و privacy؛ بدون دورزدن Auth |
| R7a | پروی فوری + persistence مستقل کمد + FittingAd؛ خرید واقعی |
| R7b | تشخیص/health queue/provider/storage بدون هزینه؛ در صورت دسترسی می‌تواند زودتر انجام شود |
| R7c | مسدود تا evidence + ADR + budget: provider/cache/pipeline پولی |

هر مرحله PR جدا و Draft. R3 در صورت بزرگی می‌تواند R3a/R3b با dependency صریح شود؛ هیچ AC حذف نشود. merge فقط با اجازهٔ صریح مهدی و D70. مرحلهٔ بعدیِ مستقل می‌تواند بدون انتظار برای merge پیش برود؛ وابستگی‌ها را stack و مستند کن، نه merge پنهان.

## Questions for PM — فقط موارد واقعاً باز

انتخاب فونت/تم/loader/guest فوری با تفویض مالک تعیین شد و دوباره پرسیده نشود.
- اگر دسترسی preview واقعی موجود نباشد، در R0 دقیقاً دسترسی لازم و راه‌حل قابل بررسی را اعلام کن؛ R1 مستقل ادامه یابد.
- علامت دقیق خرابی سرویس فعلی و محیط وقوع اگر از دادهٔ قابل دسترسی روشن نیست؛ R7b شواهد موجود را ابتدا جمع کند.
- بودجه و معیار کیفیت/انتخاب provider فقط پیش از R7c؛ فعلاً هیچ فراخوانی پولی یا تغییر provider مجاز نیست.

## نگاشت به کد

پوشه‌های موجود `src/modules/content`, `outfits`, `catalog`, `cart`, `fitting`, `customers`, `crm/preferences` و media framing مبنا هستند. Homepage JSON و ThemeSettings توسعه یابند؛ P/DEPTS/GEO و timerهای prototype دادهٔ واقعی یا منطق production نیستند. نام/مسیر واقعی هر entry point پیش از تغییر با checkout جاری تأیید شود؛ جدول طرح اولیه تضمین وجود آن فایل نیست.
