# DESIGN-01 — اجرای MODA4 و مدیریت کامل ویترین

Implemented against docs v1.2 / D-numbers touched: D09, D26, D31, D67, D70, D74, D75, D76, D77, D78.

وضعیت در ۲۰۲۶-۱۰-۱۴: **READY FOR CODEX HANDOFF؛ پیاده‌سازی این فاز هنوز شروع نشده است.** مرجع پیگیری [Issue62](https://github.com/mehdi2044/HodaSite/issues/62)؛ طرح منتخب [PR65](https://github.com/mehdi2044/HodaSite/pull/65). مالک ظاهر کلی و اتاق پرو را انتخاب کرده، تغییر فونت و اصلاح جزئیات را تفویض و قیمت روی تمام لباس‌های تبلیغاتی، مدیریت تصاویر و پیش‌نمایش به‌روز را صریح خواسته است. این تأیید، اجازهٔ merge یا تأیید نسخهٔ پیاده‌شده نیست.

## منابع و ترتیب اعتبار

دستور جاری مالک، سپس ADRهای D77/D78 و سایر تصمیم‌های فعال → این فایل → [قرارداد صحنه‌ها و پیش‌نمایش](../design/moda4-redesign/SHOPPABLE_SCENES_AND_PREVIEW.md) → دامنهٔ کامل REQ-01…10 و AC-01…18 در Issue62 → SPEC/نمونهٔ PR65 برای ظاهر. دستورهای قدیمی طراحیِ Hero در Issue62 و PR64 از نظر ظاهر با انتخاب MODA4 جایگزین شده‌اند؛ قابلیت‌های خرید/مدیریت حذف نشده‌اند. این کار ادامهٔ DESIGN-01 است، نه Phase12 یا بازنویسی معماری.

`AGENTS.md` و اسناد آغاز جلسه خوانده شوند. در شروع وضعیت زندهٔ main، PR60/64/65 و PR اسناد حاضر و Issue63 را تطبیق بده. وجود قابلیت در PR باز به معنی وجود آن در main نیست. هنگام این بررسی: main=`8e0b953a6c9872119dd27840b6e99b6b50dd576c`، PR65=`46e98773929139651074a0ce461937c22e8b528d` و PR60=`3242540dd13885b61aac6bf42840f526fda3513b` بودند؛ اینها شواهد مبنا هستند، نه ادعای آخرین SHA برای آینده.

## دامنهٔ قطعی و موارد باز

- حفظ هویت MODA4/چیدمان/اتاق پرو/حرکت‌های مطلوب؛ Manrope برای تیتر لاتین، Inter برای متن و قیمت، Vazirmatn فارسی، self-host و نقش‌های قابل تنظیم. لوگوی موجود به‌عنوان asset حفظ شود.
- همهٔ رسانه‌های محتوایی و انتخاب لباس‌ها، نقاط قیمت، متن/CTA/مقصد، ترتیب/تعداد/خاموشی، زمان‌بندی و تنظیم ظاهر معمول در پنل و DB. قیمت‌ها از کاتالوگ/بازار، نه نوشتهٔ ثابت روی عکس.
- تم پروفایل مستقیم، بدون پرسش جنسیت برای این منظور؛ بدون loader مسدودکننده؛ پروی فوری مهمان رایگان، ذخیرهٔ کمد/AI فقط پس از ورود.
- draft/preview/publish/history/rollback و کمپین واقعی #62 جزو کارند. کناررفتن طرح قبلی، کنارگذاشتن خطاهای عملکردی PR60/#63 نیست.
- انتخاب provider جدید، بودجهٔ تست پولی، سیاست قیمت cache و انتشار خروجی AI خصوصی حل نشده‌اند. **فقط R7c متوقف** می‌ماند؛ هیچ هزینه یا enable تولیدی مجاز نشده است. علت خرابی فعلی AI نیز هنوز با شواهد سرور ثابت نشده است.

## ترتیب تحویل و وابستگی

هر ردیف یک PR مستقل و Draft با branch `phase/design-01-rX-...` است. R7a/b/c نیز جدا هستند؛ عبارت «هفت مرحله» به معنی ادغام این سه کار در یک PR نیست. R0 اول انجام شود. پس از هر تحویل، preview و شواهد ثبت و کار مستقل بعدی ادامه یابد؛ برای انتخاب‌های فنی واگذارشده تأیید تکراری نخواه. ادغام هر PR همچنان فقط با D70 و اجازهٔ صریح مهدی است. PRهای وابسته می‌توانند به‌صورت stacked و با base/merge order صریح ساخته شوند؛ هرگز وابستگی ادغام‌نشده را بی‌صدا مبنای release نکن.

| مرحله | دامنه و خروج لازم | وابستگی/پذیرش |
|---|---|---|
| R0 — preview واقعی | محیط واقعی پروژه و DB جدا، URL ثابت storefront و admin، auth واقعی، نمایش build/revision در preview، چرخهٔ HMR یا deploy موفق، دستور راه‌اندازی/خاموشی فارسی | MODA-08/09 پایه؛ در نبود زیرساخت `BLOCKED_ENV` دقیق، نه لینک HTML به‌جای اپ |
| R1 — پایه و برند | فونت‌ها، tokenهای امن، نقش‌های پوسته در DB/پنل، دکمه/توری/حرکت، لوگوی مجاز، پیش‌نمایش قابل مشاهده روی R0؛ دادهٔ مالک overwrite نشود | MODA-01؛ تضاد و glyph و کاهش حرکت؛ زمان‌بندی لایهٔ مشترک صحنه/cutout پیش از مصرف مستند شود |
| R2 — پوسته و ناوبری | header/announcement، mega menu و tileهای مدیریتی، جست‌وجوی واقعی، drawer واقعی سبد، footer/newsletter، قیمت و policy بازار، دسته‌های نامحدود تجاری | AC-08/10/13 و MODA-13/14؛ دادهٔ menu/featured tile افزایشی؛ حفظ consent و keyboard |
| R3 — صفحهٔ اصلی و CMS | تمام بلوک‌های MODA4، قرارداد مشترک تصویر قابل خرید و resolver قیمت، مدیریت همهٔ تصاویر و pinها، draft/live preview/history/schedule/rollback، کمپین/قانون تخفیف/پاپ‌آپ و video fallbackِ #62 | MODA-02…10؛ AC-01…10/14/16؛ این مرحله صرفاً markup صفحهٔ اصلی نیست. انتشار و تغییر قیمت در صفحهٔ باز نشان داده شود |
| R4 — کودک و رسانهٔ لایه‌ای | قرارداد مشترک cutout/هندسه و پنل آن **قبل از مصرف** در Kids و R7a؛ category presentation قابل ارث‌بری، pastel، turntable و fallback کالای فاقد cutout | D78؛ MODA-12/13؛ هیچ نمونهٔ کودک را فقط از scale مانکن بزرگسال فرض نکن |
| R5 — دسته/محصول/خرید | PLP فیلتر/جست‌وجو، PDP گالری/رنگ/سایز/lightbox/خرید چسبان، ست و سبد/checkout، حفظ اصلاحات معتبر PR60 و #63 | AC-11/12 و MODA-04/06/07/14؛ تست quote/stock/atomic cart، نه فقط تصویر |
| R6 — ورود و پروفایل | رابط OTP بر Auth موجود، انتخاب مستقیم ROSE/SLATE/SAND و ذخیره، CRM preferences موجود، privacy export/anonymization و بازگشت امن | تغییر Auth فقط با ضرورت و evidence؛ callback مجاز D66 حفظ، مقصد fitting جدید فقط پس از بررسی allowlist و ثبت اصلاح مشخص D66 |
| R7a — پروی فوری | ترکیب واقعی cutout بر مدل فروشگاه، قوانین slot/anchor و تا ۴ قطعه، ذخیرهٔ مستقل ترکیب در کمد، خرید با variant/سایز، FittingAd با قیمت و تصویر منطبق | D78؛ MODA-11/12؛ ذخیرهٔ کمد با fake DONE session یا toast قابل قبول نیست |
| R7b — عیب‌یابی و سلامت | بررسی غیرپولی queue/cron/provider/storage، وضعیت‌های واقعی session، هشدار دیرکرد، گزارش علت با شواهد پاک‌سازی‌شده | می‌تواند بلافاصله پس از R0 جلو بیاید؛ هیچ provider یا debit جدید برای عیب‌یابی بی‌اجازه |
| R7c — فقط پس از تصمیم مستقل | ارزیابی provider/quality، pipeline چندمرحله‌ای در صورت نیاز، cache خصوصی و سیاست سکه، هزینه/timeout/recovery | فعلاً `BLOCKED_DECISION`؛ ADR و سقف بودجهٔ صریح پیش از هر تست پولی یا تغییر adapter |

اگر R3 بیش از یک PR قابل بازبینی شد، آن را به R3a قرارداد/پنل/preview و R3b نمایش/کمپین تقسیم کن؛ mapping و تقدم را در PROGRESS به‌روز کن و همهٔ ACها را نگه دار. بزرگی فاز مجوز حذف admin یا موک‌کردن قابلیت نیست.

## نقشهٔ سازگاری با نیازهای قبلی

| نیاز | تکلیف فعلی |
|---|---|
| REQ-01/02/03/09 | مرجع بصری اجرایی اکنون MODA4 منتخب است؛ تنوع چیدمان، کیفیت بنر و پذیرش مالک حفظ؛ تصویر/هویت برند دیگر کپی نشود |
| REQ-04/05/06 | mobile-first و سه زبان/بازار، تنوع بخش‌ها و motion قابل توقف در R1…R7 |
| REQ-07/08 | پنل متناظر و چرخهٔ محتوا در R2/R3/R4؛ preview واقعی R0؛ صرفاً ویرایش JSON خام کافی نیست |
| REQ-10 | baseline مالی/موجودی/امنیت/SEO و backlog عملکردی PR60/#63 در تمام مراحل حفظ |

| AC قبلی در Issue62 | مرحلهٔ مسئول | شواهد خروج |
|---|---|---|
| AC-01 دسته و زیردسته | R2/R3/R4 | ایجاد دستهٔ پنجم و فرزند، انتخاب عکس/ترجمه و پیداکردن آن در فروشگاه |
| AC-02 بلوک‌ها | R3 | reorder/clone/toggle/restore واقعی و persist پس از reload |
| AC-03 بنر | R3 | تصویر/عنوان/CTA و نقاط قیمت موبایل/دسکتاپ، مقصد معتبر |
| AC-04 ردیف محصولات | R3 | دستی/خودکار، تعداد و فیلتر بازار/live catalog |
| AC-05 کمپین | R3 | بنر پاییز با تصویر موبایل، مقصد، قانون تخفیف و زمان بدون deploy |
| AC-06 زمان و مبلغ | R3/R5 | قبل/حین/بعد کمپین، ساعت سرور، cart/checkout مطابق قانون |
| AC-07 پاپ‌آپ | R3 | بستن/بازگشت/frequency cap و دسترسی خرید |
| AC-08 سیاست ارسال | R2/R3/R5 | یک policy واقعی بازار در header/FAQ/PDP/cart |
| AC-09 پیش‌نویس/تاریخچه | R0/R3 | بدون draft leak، schedule معتبر، rollback فقط محتوای مجاز |
| AC-10 مجوز/audit | همه | منع سرور در خارج scope و audit معتبر هر mutation |
| AC-11 رنگ/سایز/ست | R3/R5/R7a | تصویر و مبلغ/stock مطابق variant، خرید atomic و رد نامعتبر |
| AC-12 فیلتر/خالی | R5 | فیلتر فعال، حذف/Back/Forward، نتیجهٔ خالی، رنگ/سایز نام‌دار |
| AC-13 زبان/اندازه | همه | fa/tr/en، RTL/LTR، حداقل ۴۴px، keyboard/contrast، بدون overflow |
| AC-14 رسانه/حرکت | R1/R3/R4/R7a | fallback معتبر، ویدیو کند/خراب، pause/reduced-motion، CLS |
| AC-15 خاموشی قابلیت | R2/R3/R7 | flagها entry point و عمل را هماهنگ خاموش کنند؛ سایر خریدها ادامه یابد |
| AC-16 seed و تاریخچه | همه | additive/idempotent، بدون overwrite مالک یا تغییر snapshot مالی |
| AC-17 سرعت/PWA | R0 و هر مرحله | شرایط اندازه‌گیری ثبت‌شده، LCP هدف ≤۲٫۵s، نصب/offline/update، private cache exclusions |
| AC-18 پذیرش مالک | هر خروج قابل مشاهده | لینک همان نسخه/commit، screenshot/ویدیو، نظر مالک جدا از نتیجهٔ CI |

## یافته‌های بازبینی PR65 و اصلاح اجباری

بازبینی مبنا: <https://github.com/mehdi2044/HodaSite/pull/65#issuecomment-6167944247>. این بازبینی سازگاری است و marker تأیید merge D70 نیست.

| یافته | رفع در این دستور |
|---|---|
| M01 کمدِ پروی فوری وجود ندارد | D78، R7a: persistence مستقل owner-scoped؛ جلسات DONE فقط برای خروجی واقعی AI |
| M02 cache عمومی و ciphertext وابسته به session | R7c مسدود تا ADR؛ مالکیت و revision/entitlement و envelope مستقل لازم |
| M03 چند فراخوانی پولی با worker یک‌مرحله‌ای | بدون fallback خودکار؛ طراحی step/idempotency/cost/timeout/REVIEW پیش از تغییر |
| M04 نیازهای #62 گم شده | جدول کامل AC بالا؛ R3 مسئول CMS/کمپین و R5 خرید واقعی |
| M05 وابستگی cutout و نام schema | R4 پیش از Kids مصرف‌کننده؛ `Variant` واقعی؛ هندسهٔ per media/model |
| M06 وضعیت REFUNDED اشتباه | QUEUED/RUNNING/DONE/FAILED/REVIEW؛ refund از ledger جدا |
| M07 hex/SVG نامعتبر | ۶ رقم hex + opacity محدود، allowlist font، PNG یا SVG ثابت امن؛ upload bypass ممنوع |
| M08 دمو به‌جای عملکرد واقعی | OTP/AI/cart/price از ماژول واقعی، بدون timer جعلی/سکهٔ فرضی/سایز پیش‌فرض |
| M09 چهار دسته/مدل و SHOES | چهار وجه فقط presentation؛ انواع واقعی مدل و SHOES/anchor حفظ |
| M10 crop/loader/motion | no blocking loader، focus/visibility/reduced-motion، عکس و focal واقعاً بررسی شوند |

## پذیرش، داده و تحویل هر PR

1. هر تغییر schema در ADRهای D77/D78 و migration جدید افزایشی؛ مدل واقعی را قبل از کدنویسی بخوان. applied migration را دست‌کاری نکن. اگر نیاز معماری فراتر است، ADR جدید پیش از اجرا.
2. سرور permission + market scope + Zod + audit؛ قیمت/quote/stock از مسیر واحد موجود؛ lock ordering با writers فعلی هماهنگ و concurrency واقعی PostgreSQL برای حساسیت‌های تازه.
3. تست‌های معنی‌دار unit/PG برای پول، مجوز، media/reference، revision/conflict و cart؛ Playwright هر flow مشتری/مدیر، با فرم واقعی save → reload → storefront. تستی که فقط mock را همان‌طور که نوشته شده تکرار کند جای اتصال واقعی نیست.
4. `pnpm lint && pnpm typecheck && pnpm test` و چک‌های مرتبط build/e2e/DB/restore طبق AGENTS؛ CI لازم `checks`, `docker`, `docker-runtime` روی head فعلی. reset/restore فقط DB آزمایشی ایزوله، نه اطلاعات مالک. تست دستگاه واقعی/دسترسی کشورها اگر انجام نشده باز بماند.
5. PROGRESS با ماتریس مرحله، branch/head، وابستگی و حالت `NOT_STARTED / IN_PROGRESS / BLOCKED_ENV / BLOCKED_DECISION / READY_FOR_REVIEW`؛ عنوان DONE فقط برای دامنهٔ واقعاً تکمیل‌شده، نه مرور طراحی. راهنمای سادهٔ پنل و اجرای preview در setup اضافه شود.
6. PR: خلاصهٔ فارسی، چرایی/رفتار، D-numbers، اثر داده/rollback، لینک preview، راه آزمون دستی، شواهد `local / CI / not verified` و محدودیت‌ها. credential و دادهٔ مشتری در public repo ممنوع.
7. هر merge: شواهد current-head و آخرین `[HODASITE-AI-REVIEW]` واقعی بدون blocker، blocking conversations حل‌شده و اجازهٔ صریح مهدی. خودبازبینی را مستقل یا marker ساخته‌شده جا نزن؛ merge نکن.

## دستور شروع

[CODEX_PROMPT.md](../design/moda4-redesign/CODEX_PROMPT.md) متن کامل مأموریت است. اول R0 و سپس R1 را تحویل بده. طراحی از صفر و نمونهٔ HTML تازه لازم نیست؛ نخستین خروج باید نشانی نسخهٔ واقعی قابل بررسی یا گزارش دقیق مانع محیط باشد.
