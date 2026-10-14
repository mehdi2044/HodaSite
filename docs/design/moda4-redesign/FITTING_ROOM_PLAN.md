# اتاق پرو MODA4 — برنامهٔ اصلاح‌شدهٔ اجرا

مرجع: D75/D76/D78، [فاز DESIGN-01](../../phases/phase-design-01.md) و [قرارداد تصاویر/preview](SHOPPABLE_SCENES_AND_PREVIEW.md). ظاهر اتاق پرو منتخب مالک است؛ علت مشکل سرویس فعلی هنوز با شواهد سرور تأیید نشده است. هیچ تغییر provider یا تست پولی مجاز نشده.

## ۱. واقعیت کد مبنا و عیب‌یابی R7b

مبنای بررسی main در `8e0b953`؛ هنگام اجرا مجدداً تطبیق شود:
- `src/modules/integrations/fitting/index.ts`: یک فراخوانی OpenAI Images edits با عکس مدل فروشگاه و حداکثر چهار لباس؛ timeout adapter فعلی ۱۸۰ ثانیه.
- صف `fitting-render` در `JobQueue`، worker و cron؛ بازیابی RUNNING کهنه پس از حدود ۵ دقیقه نیازمند بررسی قرارداد worker است. افزودن چند step بدون اصلاح این قرارداد مجاز نیست.
- وضعیت‌های FittingSession: **QUEUED / RUNNING / DONE / FAILED / REVIEW**. برگشت سکه اثر ledger است؛ status با نام REFUNDED وجود ندارد.
- خروجی خصوصی، envelope رمزگذاری‌شده وابسته به sessionId و AUTH_SECRET؛ image endpoint فقط برای مالک.
- `saveLook` فعلی فقط همان جلسهٔ DONE مشتری را با savedName/savedAt ذخیره می‌کند؛ جدول کمد مستقلِ ترکیب فوری موجود نیست.
- coin cost از config و Decimal (پیش‌فرض فعلی ۱۲٫۵)، confirm/expectedCostCoins و قفل کیف/دفتر؛ عدد ۱ یا کاهش سکهٔ JS نمونه منبع نیست.

| علامت | بررسی لازم؛ علت را پیشاپیش قطعی نگو |
|---|---|
| QUEUED طولانی | worker/cron heartbeat، job schedule/lock/status/attempt، آخرین اجرای واقعی و زمان‌ها |
| FAILED و برگشت | errorCode، وجود credential بدون افشای مقدار، HTTP outcome، مرحلهٔ خواندن مرجع/تبدیل/upload و ledger یک‌باره |
| REVIEW | قطع/timeout نامطمئن، شناسهٔ درخواست و checkpoint موجود؛ بدون redispatch خودکار |
| DONE با خروجی نامناسب | مقایسهٔ ورودی و خروجی مجاز: رنگ/طرح/تعداد/هندسه؛ مسئلهٔ کیفیت را از شکست زیرساخت جدا کن |
| کندی | فاصلهٔ صف، مدت worker/provider/storage و زمان تحویل را جدا اندازه بگیر |

گزارش پاک‌سازی‌شده شامل محیط/commit، زمان UTC و شواهد مرتبط باشد؛ کلید/PII/عکس خصوصی/URL حامل token در GitHub عمومی ممنوع. دسترسی سرور نیست: UNVERIFIED، نه «provider خراب است». health UI فقط وضعیت credential/heartbeat/آمار و هشدار تأخیر نمایش دهد. «آزمایش اتصال» اگر هزینه دارد تا بودجه/تأیید غیرفعال؛ health check رایگان را هم بدون اطمینان از رایگان‌بودن درخواست به endpoint تولید نفرست.

## ۲. R4: قرارداد مشترک cutout و هندسه، قبل از Kids/R7a

- مدل Prisma واقعی `Variant` است، نه ProductVariant. cutout شفاف READY برای رنگ محصول قابل اشتراک میان سایزها؛ override variant فقط در صورت نیاز. variant خرید با رنگ/سایز واقعی حل شود.
- مدل‌های فروشگاه WOMAN/MAN/GIRL/BOY؛ geometry باید به مدل واقعی و در صورت نیاز cutout خاص وابسته باشد. مقیاس ثابت بزرگسال برای همهٔ مدل‌های کودک کافی نیست.
- از fittingSlot موجود TOP/BOTTOM/ONE_PIECE/LAYER/ACCESSORY/**SHOES** استفاده کن؛ accessory anchor مشخص HAND/NECK/HEAD.
- مختصات/scale/offset/zIndex محدود، schema version و revision، permission/audit، پیش‌نمایش drag/keyboard در پنل؛ مقدارهای GEO نمونه فقط seed قابل ویرایش‌اند.
- برای تصویر فاقد cutout، تصویر کالا/راهنمای نبود پرو نشان بده؛ ساختن ترکیب معتبر برای همهٔ عکس‌ها را وعده نده. حذف پس‌زمینهٔ خودکار provider تازه و هزینهٔ ضمنی نیست.

## ۳. R7a: پروی فوری و کمد واقعی

ترکیب کلاینت از مدل و cutout عمومی، بدون سکه/فراخوانی AI؛ guest مجاز اگر قابلیت فوری فعال است. flag پروی فوری از فعال‌سازی AI پولی جدا باشد. این پیش‌نمایش استایل است، نه تشخیص دقیق اندازهٔ بدن.

قواعد: حداکثر چهار قطعه؛ ONE_PIECE جای TOP و BOTTOM را می‌گیرد؛ LAYER روی آن؛ کفش جایگاه خود؛ فقط یک accessory در هر anchor، نه یک accessory برای کل بدن. ترتیب لایه با هندسهٔ محدود و قابل تنظیم؛ لمس/drag و دکمه‌های چرخش keyboard، reduced-motion و pause در tab مخفی/offscreen.

برای هر لباس قیمت همان بازار و سایز واقعی، راه حذف/تعویض، وضعیت موجودی و «افزودن همه» با cart atomic موجود. market از locale مستقل. تغییر سایز/رنگ باید تصویر/قیمت/variant خرید را همسو کند. برچسب‌ها با قرارداد صحنهٔ مشترک پیاده شوند.

**ذخیره در کمد:** مدل مستقل owner-scoped مطابق D78، نه toast و نه جعل DONE session. ترکیب/model/media/geometry revision و انتخاب‌ها ذخیره، بعد از reload بازسازی، قیمت جاری resolve شود. مشتری دیگر نتواند بخواند/ویرایش/حذف کند؛ export و anonymization، archive و conflict مدیریت شوند. ورودی‌های قدیمی AI در همان UI با نوع خروجی متمایز باقی بمانند. save/login از callback امن موجود؛ تغییر allowlist D66 نیاز ثبت مشخص دارد.

## ۴. تبلیغ FittingAd

رگال/پرواز لباس/اسکن/سکوی اتاق پرو مطابق طرح منتخب حفظ؛ مدیر ست و مدل، cutout و عکس نهاییِ **منطبق با همان قطعات** را انتخاب کند. همهٔ لباس‌های قابل خرید قیمت خوانا و reference واقعی داشته باشند. در نبود عکس نهایی معتبر، نتیجهٔ فوری باقی بماند؛ timer و عکس ازپیش‌ساخته را «AI همین درخواست» معرفی نکن. output خصوصی مشتری را public Media نکن. reduced-motion نمای ثابت کامل و خرید قابل استفاده نشان دهد.

## ۵. R7c: تصمیم مستقل پیش از اجرا

هیچ provider از پیش برنده یا fallback خودکار تعیین نشده. بعد از R7b و با بودجهٔ صریح، پیشنهاد reviewable شامل معیار کیفیت، latency، هزینهٔ هر request/هر ست و data handling ارائه شود؛ ADR جدید پیش از adapter.

اگر چند فراخوانی لازم شد، طراحی و آزمون per-step checkpoint/idempotency، max steps/cost cap، timeout هماهنگ queue/worker/provider، نتیجهٔ نامطمئن REVIEW، عدم retry/fallback خودکارِ هزینه‌زا و settlement/refund/debt یک‌باره لازم است. نتیجهٔ عکس جدید ممکن است pose را عوض کند؛ هندسهٔ اکسسوریِ mannequin قبلی بدون تطبیق برای آن معتبر نیست.

cache پیش‌فرض customer-scoped و خصوصی با کنترل entitlement؛ کلید شامل customer، مدل/نسخه، media hash/revision لباس و مدل، geometry/pipeline/settings، رنگ/انتخاب و provider. ciphertext وابسته به sessionId بین جلسات کپی نشود. سیاست free repeat/cache coins و pre-generation عمومی هنوز تصویب نشده. خروجی تبلیغاتی تأییدشده مسیر انتشار جدا و اجازهٔ هزینه/انتشار می‌خواهد.

## ۶. شواهد لازم

unit/PG: slot/anchor/max4، references/READY/color، guest vs private auth، owner persistence/conflict/export/anonymization، atomic cart و قیمت Decimal، flag separation و حفظ ledger. Playwright: هر چهار نوع مدل، رنگ/سایز، rotate keyboard/reduced-motion، save → reload → wardrobe → cart با پنل واقعی. migration/backup/Local+S3 restore برای دادهٔ افزوده، حفظ AUTH_SECRET و جلسات قبلی. نتیجهٔ paid/provider/server که واقعاً آزموده نشده صریحاً باز بماند.
