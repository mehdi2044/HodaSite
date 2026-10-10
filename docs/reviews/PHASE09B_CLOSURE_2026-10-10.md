# پایان تحویل فنی Phase 09B — ۲۰۲۶-۱۰-۱۰

Implemented against docs v1.2 / D-numbers touched: D70, D71, D72, D73.

## نتیجه

[PR #54](https://github.com/mehdi2044/HodaSite/pull/54) وارد `main` شد؛
[Issue #53](https://github.com/mehdi2044/HodaSite/issues/53) با وضعیت completed
بسته شد. هر ۹ گفتگوی بازبینی Resolve شده‌اند و مورد باز برای تحویل فنی 09B
باقی نمانده است. این گزارش تکمیل کل فاز ۹ یا مجوز انتشار سایت نیست.

| مورد | شاهد قطعی |
| --- | --- |
| نسخهٔ بررسی‌شده | `9066d39efd7e4dce9535e9e893833bf479200923` |
| base پیش از ادغام | `c93cc624212d5028fc5bea82b357de9f56f79b95` |
| کامیت Merge | `6a05440fb17441dc18490874d7b745434da44937` |
| زمان Merge | ۲۰۲۶-۱۰-۱۰، ۰۸:۵۷:۴۱ استانبول / ۰۵:۵۷:۴۱ UTC |
| درخت ادغام‌شده | `6b43834e125793af6c4cc3b884e321244488a479`؛ همان درخت head بررسی‌شده |
| گزارش نهایی | [AI review بدون blocker](https://github.com/mehdi2044/HodaSite/pull/54#issuecomment-6094420113) |
| CI همان head | [run 37562367211](https://github.com/mehdi2044/HodaSite/actions/runs/37562367211)؛ هر چهار job موفق |
| گفتگوهای باز | صفر از ۹؛ پاسخ مستند برای هر یافته ثبت و وضعیت زنده دوباره خوانده شد |

## تعیین تکلیف یافته‌ها

| یافته | اصلاح تأییدشده | شواهد کد و آزمون |
| --- | --- | --- |
| REV-001؛ lifecycle کوپن | پاسخ نامطمئن/stale/archive فرم را قفل می‌کند؛ reload و تأیید تازه لازم است؛ replay کلیددار ادعا نمی‌شود | `request-form.tsx` و `coupons.tsx`؛ E2E lost-before/after-commit، stale-tab، archive و شمارش دقیق audit |
| REV-002؛ مالیات حمل | حمل تقبل‌شده از پایهٔ مالیات D73 حذف شده است | `fees/index.ts`؛ unit `promotion-commerce` و integration `phase09b-checkout` برای tax/order/payment |
| REV-003؛ جداسازی محصول | گزینه‌ها و همهٔ ارجاع‌های product به بازار مجاز و رکورد حذف‌نشده محدودند | `admin-read.ts` و `persistence.ts`؛ integration محصولات مشترک/خارج بازار/حذف‌شده |
| SIM-001؛ ارسال شبیه‌ساز | province/city/postalCode و روش منتخب معتبر از سبد ذخیره‌شده به quote مشترک می‌رسند | `simulator.ts` و `fees/quote.ts`؛ unit، PostgreSQL و E2E سه‌زبانه؛ رد ورودی/روش نامعتبر |
| DATA-001؛ ارجاع taxonomy | category/collection و شرط market پیش از هر revision/audit اعتبارسنجی می‌شوند | `persistence.ts`؛ integration create/update، missing/deleted، retry و حفظ version/audit |
| CART-001؛ ارسال سبد | سبد عمومی همان `quoteSavedCart` را استفاده می‌کند؛ ارسال نامعتبر مسیر اصلاح دارد | صفحهٔ Cart و E2E `promotion-checkout`؛ برابری تخفیف حمل/مبلغ سبد و Checkout |
| PERF-001؛ شمارش مصرف | حداکثر چهار aggregate گروهی برای برنامه/کوپن با حفظ lock، clock، cap، budget و release | `evidence.ts`؛ unit ۱۰۰ برنامه/کوپن و PostgreSQL concurrency/release/retry |
| PERF-002؛ segmentها | فقط شرایط مرتبط در یک SQL پارامتری ارزیابی می‌شوند | `crm/promotion-evidence.ts` و `segment-query.ts`؛ unit و مقایسهٔ ۱۰۰ segment با SQL منفرد |
| INPUT-001؛ ورودی کوپن | قرارداد مشترک ۱۰۰ کد ۶۴حرفی با جداکنندهٔ ذخیره‌شده، تا ۶۵۹۸ کاراکتر | `coupon-contracts.ts`؛ unit boundary و E2E سه‌زبانهٔ فرم/ذخیره/reload |

پاسخ‌های هر یافته و لینک آزمون‌ها در گفتگوهای اصلی PR موجودند. Resolve بر اساس
تطبیق اصلاح انجام شد؛ outdated بودن گفتگو معیار پذیرش نبود.

## آزمون‌ها و حدود شواهد

- لاگ CI همان head در جلسهٔ بستن تحویل دوباره خوانده شد: ۱۳۵ فایل / ۸٬۷۴۹
  تست واحد و PostgreSQL و همهٔ ۱۵۱ تست مرورگر موفق‌اند؛ lint/typecheck، coverage،
  production build، audit، فاکتور سه‌زبانه و migration/seed نیز موفق‌اند.
- `checks`، `docker`، `docker-runtime` و `windows-tooling` موفق‌اند. لاگ runtime
  چرخهٔ واقعی backup/verify/restore برای LocalStorage و S3/MinIO، حفظ دفتر مالی
  immutable، guardهای منفی و بازیابی داده/نسخه پس از deployment ناموفق را نشان می‌دهد.
- در همین جلسه `scripts/backup/tests/run.sh` دوباره موفق شد: maintenance، restore،
  deploy rollback، tar/zip، S3 generation، retention و زمان‌بندی/اعتبارسنجی.
  `git diff --check` نیز موفق بود.
- بازبینی، AI code/evidence review است؛ بازبینی مستقل انسانی ادعا نشده است.
  کل suite برنامه/مرورگر محلی در جلسهٔ closure دوباره اجرا نشد. CI اثبات گوشی واقعی،
  HTTPS عمومی، تحویل واقعی ایمیل یا عملکرد دیتابیس مالک نیست.

## مجوز مالک و حاکمیت

مهدی در همین جلسه صریحاً اجازه داد همهٔ مراحل تعیین تکلیف PR #54 و بستن تحویل،
شامل Resolve و Merge، انجام شود و چیزی باز نماند. این مجوز استثنای همین مأموریت
برای #54 و ثبت مستندات پایان آن است؛ سیاست عمومی D70 تغییر نکرده و اجازهٔ همیشگی
برای self-merge ایجاد نشده است. CI برای head دقیق، review بدون blocker، حل گفتگوها
و محافظت شاخه رعایت شدند؛ هیچ push مستقیم به main یا bypass انجام نشد.

## داده و بازیابی

Migration افزایشی `20261003160000_phase09b_promotions` و readerهای سازگار D73
در main هستند. Merge کد، migration دیتابیس مالک را اجرا نکرد؛ هیچ دادهٔ تاریخی،
media، سایت زنده یا Preview تغییر نکرد. بازیابی باید revision/allocation/evidence
immutable را حفظ کند؛ rollback با حذف جدول یا کد ناسازگار انجام نشود. اجرای migration
در محیط هدف، بکاپ پیش از انتشار و آزمون پذیرش تابع گردش انتشار مستقل‌اند.

## مرز پایان این تحویل

09B شامل foundation قوانین، پنج اثر تخفیف، کوپن و ظرفیت/بودجه، اتصال مالی خرید
و پنل سه‌زبانهٔ editor/history/coupons/simulator است. محدودیت‌های پذیرفته‌شدهٔ D71:
gift/bundle فقط سبد موجود و همان pool؛ فهرست dropdown تا ۱۰۰۰ ردیف؛ simulator تخمین
سبد منتخب است. این محدودیت‌ها ویژگی پیاده‌نشدهٔ خارج از قرارداد را تبلیغ نمی‌کنند.

09C/09D/09E، #47/#48/#49، فازهای ۱۰/۱۱ و پذیرش انتشار/ظاهر/گوشی/اتصال‌های واقعی
در دامنهٔ این PR نیستند. هیچ deployment، Preview sync یا فعال‌سازی تخفیف زنده از
بسته‌شدن #53 استنتاج نمی‌شود. گزارش‌های قبلی pending، تاریخچه‌اند؛ وضعیت جاری
این تحویل در این گزارش و ابتدای PROGRESS ثبت شده است.
