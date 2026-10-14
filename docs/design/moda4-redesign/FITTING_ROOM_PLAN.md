# اتاق پرو MODA4 — عیب‌یابی و نقشهٔ درست‌کار کردن

## ۱. وضعیت فعلی (از روی کد، شاخهٔ main در 8e0b953)

- ساخت تصویر در `src/modules/integrations/fitting/index.ts` با **یک مدل تصویری همه‌منظوره** (OpenAI Images edits) انجام می‌شود: عکس مدل فروشگاه + عکس همهٔ لباس‌ها (تا ۴ قطعه) در **یک درخواست** با یک prompt متنی فرستاده می‌شود.
- اجرا در صف پس‌زمینه (`src/modules/fitting/worker.ts` + جدول Job + cron) است و تا ۱۸۰ ثانیه منتظر پاسخ می‌ماند.
- کیف پول سکه، برگشت سکه هنگام خطای قطعی و حالت REVIEW برای درخواست‌های نامطمئن به‌درستی پیاده شده‌اند (D75/D76).

## ۲. چرا «درست کار نمی‌کند» (علت‌های محتمل — باید با شواهد سرور تأیید شود)

| علامت | علت محتمل | چطور بررسی شود |
|---|---|---|
| درخواست همیشه «در صف» می‌ماند | worker/cron پس‌زمینه روی سرور اجرا نمی‌شود یا cron tick صدا زده نمی‌شود | جدول Job: رکوردهای `fitting-render` با وضعیت QUEUED قدیمی؛ لاگ `/api/cron/tick` |
| همیشه خطا و برگشت سکه | کلید سرویس در env نیست (`FITTING_OPENAI_API_KEY`/`OPENAI_API_KEY`)، یا مدل انتخاب‌شده در ادمین برای حساب فعال نیست | وضعیت REFUNDED با errorCode؛ صفحهٔ تنظیمات اتاق پرو |
| تصویر ساخته می‌شود ولی لباس‌ها اشتباه‌اند | مدل همه‌منظوره چند لباس را در یک مرحله خوب نمی‌پوشاند؛ رنگ/طرح و گاهی صورت مدل تغییر می‌کند | مقایسهٔ خروجی‌ها با ورودی‌ها |
| خیلی کند است | یک فراخوانی سنگین تا ۳ دقیقه + فاصلهٔ اجرای cron | زمان QUEUED→DONE |

> از مهدی پرسیده شده کدام علامت را دیده است؛ پاسخ او اولویت R7b/R7c را تعیین می‌کند.

## ۳. نقشهٔ سه‌لایه

### لایهٔ ۱ — پروی فوری (رایگان، بدون هوش مصنوعی، برای هر ترکیب) — PR R7a
همان چیزی که در نمونه (`#pg-fitting`) کار می‌کند:

1. **عکس بُریده (cut-out) برای هر رنگ کالا:** ادمین در ویرایش محصول، برای هر variant یک PNG/WebP با پس‌زمینهٔ شفاف آپلود می‌کند (فیلد جدید، مثلاً `ProductVariant.fittingCutoutMediaId`). نمونهٔ آماده: `assets/cutouts/`. حذف خودکار پس‌زمینه بعداً می‌تواند به‌صورت job + provider اضافه شود (نه سرویس جدا).
2. **جایگاه لباس:** از فیلد موجود `fittingSlot` استفاده می‌شود: `TOP` / `BOTTOM` / `ONE_PIECE` / `LAYER` / `ACCESSORY` (+ برای اکسسوری لنگر `HAND` / `NECK` / `HEAD`).
3. **هندسهٔ هر جایگاه برای هر مانکن** (WOMAN / MAN / GIRL / BOY) به‌صورت تنظیمات قابل‌ویرایش در ادمین با پیش‌نمایش زنده: `top`، `width`، `offsetX`، `zIndex` در واحد مانکن (viewBox ‏220×560). پیش‌فرض‌ها از جدول `GEO` در `prototype/source/template.html` (مثلاً بافت: TOP، top 98، width 190؛ شلوار: BOTTOM، top 290، width 112؛ کیف: ACCESSORY/HAND، top 208، width 86، offsetX 74). مانکن کودک = همان مانکن با scale ‏0.74 از پایین.
4. **قوانین لایه:** یک قطعه در هر جایگاه؛ ONE_PIECE جای TOP و BOTTOM را می‌گیرد؛ ترتیب z: BOTTOM < TOP/ONE_PIECE < LAYER < NECK < HAND/HEAD؛ حداکثر ۴ قطعه.
5. **نمایش:** ترکیب‌کردن در مرورگر با CSS 3D (بدون سرور، بدون سکه): مانکن روی سکوی چرخان، هر لایه با `translateZ` جدا تا با کشیدن عمق دیده شود؛ ورود هر لباس با انیمیشن.
6. **خروجی:** «افزودن همه به سبد» با سایز هر قطعه، «ذخیره در کمد» (جدول کمد موجود)، و دکمهٔ «نمای واقعی» که به لایهٔ ۲ می‌رود.

### لایهٔ ۲ — نمای واقعی با هوش مصنوعی (با سکه) — PR R7c، بعد از ADR
- **مدل مخصوص پرو مجازی** به‌جای مدل همه‌منظوره، پشت همان `FittingProvider` (adapter جدید در `src/modules/integrations/fitting/`). نمونهٔ گزینه‌ها برای ارزیابی وی‌بانو: سرویس‌های try-on مثل FASHN، Kolors Virtual Try-On یا IDM-VTON (از طریق ارائه‌دهندهٔ API). انتخاب نهایی و بودجه با مهدی.
- **پوشاندن مرحله‌ای:** هر لباس جدا با category درست (upper / lower / full-body)، به ترتیب BOTTOM → TOP/ONE_PIECE → LAYER؛ اکسسوری‌ها از همان لایهٔ فوری روی نتیجه قرار می‌گیرند.
- **کش نتیجه:** کلید = (مدل، variantها، provider، نسخهٔ مدل). ترکیب تکراری فوری و بدون سکه. ست‌های ShopLook از قبل ساخته می‌شوند.
- قواعد D75 حفظ می‌شود: رزرو سکه قبل از ارسال، برگشت در خطای قطعی، REVIEW برای نامطمئن، بدون ارسال دوبارهٔ خودکار، خروجی خصوصی و رمزگذاری‌شده، بدون آپلود عکس شخصی.
- در زمان انتظار، کاربر نتیجهٔ لایهٔ ۱ را می‌بیند (نه صفحهٔ خالی) و نوار پیشرفت با زمان تقریبی دارد.

### لایهٔ ۳ — سلامت زیرساخت — PR R7b (بدون تغییر provider)
- هشدار سیستمی (`SystemAlert`) وقتی session بیش از N دقیقه QUEUED بماند یا cron tick دیر شود.
- صفحهٔ وضعیت در ادمین: کلید تنظیم است/نیست (بدون نمایش مقدار)، آخرین اجرای worker، آمار DONE/REFUNDED/REVIEW.
- دکمهٔ «آزمایش اتصال» فقط برای مدیر با یک درخواست کوچک و هزینهٔ اعلام‌شده.

## ۴. تبلیغ سه‌بعدی (بلوک FittingAd)
در صفحهٔ اول: رگال با لباس‌های تاب‌خوران، پرواز هر لباس با چرخش ۳۶۰ درجه تا جایگاهش روی مانکن، اسکن، سپس نمایش عکس واقعی همان ست. ادمین دو ست انتخاب می‌کند (فهرست variantها + عکس نهایی). فقط وقتی بخش دیده می‌شود اجرا می‌شود و با reduced-motion حالت نهایی را ثابت نشان می‌دهد.

---

### English technical notes
- Instant try-on is pure client compositing: no new server endpoint beyond reading variant cut-outs and the geometry config (cacheable). Validate geometry with zod (bounded numbers), audit-log config changes.
- Cut-out media are public catalog media (unlike private provider outputs).
- A9 ADR must cover provider data handling (garment + store-model images only, no customer photos — D75), cost caps, timeouts, idempotency and the cache key/invalidation when a variant image changes.
- Tests: unit tests for slot exclusivity/z-order/max-4 rules; Playwright for selecting items per model kind, rotating the stage (keyboard buttons), add-all-to-bag sizes, reduced motion.
