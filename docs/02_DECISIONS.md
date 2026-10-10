# تصمیم‌های قطعی پروژه (Architecture Decision Records) — v1.2.1

### Custom fitting room, coins and wardrobe — D75 (2026-10-10)
Owner explicitly expands D74: custom clothing/color combinations on store-owned WOMAN/MAN/GIRL/BOY models, optional customer access, daily/welcome/purchase/manual grants, fractional usage coins and purchasable catalog packs (100/500/1000 by default). No personal-photo upload. Language and market remain independent D09/D10 choices; market controls all monetary quotes.

An additive migration introduces an expiring coin-grant ledger, immutable coin events, private fitting sessions and saved wardrobes, plus nullable catalog pack amounts snapshotted in new order items. Coins are service units (not currency, cash or store credit); Decimal(18,4), wallet row locks, idempotent source keys and exact request payload fingerprints prevent concurrent overspend/replay. Daily allowance expires at next midnight in the configured IANA timezone. Pack credit and purchase rewards are awarded only by the existing paid-order transition, never cart/order placement. Refunded pack/reward sources are revoked by compensating coin events; already-consumed revocations become debt offsetting later grants.

Image edits run through a separate provider interface and the existing DB job queue. OpenAI Images edits is an optional adapter with an environment-only key, fixed host, admin-configured model/quality, request caps and no automatic retry after an uncertain remote call. Provider output is private storage served only after customer authorization, never public Media. Output objects are authenticated encrypted envelopes bound to the session ID using the existing AUTH_SECRET contract; even a misconfigured public media CDN receives ciphertext. Restore must preserve AUTH_SECRET to read historical outputs. Reserve usage before dispatch, refund on definite failure; interrupted/uncertain calls are marked for review and never blindly resent. Default feature off; no secret, paid call or production enablement in seed. The static review preview demonstrates selection/controls without claiming to synthesize arbitrary photos or settle payments. The store-wide daily request cap includes failed/refunded sessions as a conservative provider-cost budget; the separate customer usage cap excludes FAILED sessions. A successful provider call can incur cost even if delivery later fails. Admin labels and setup explain this distinction. Unusable HTTP 2xx output (malformed, missing, oversized or interrupted body) is a definite delivery failure: refund once without redispatch. Error-body cleanup cannot override a known rejected HTTP outcome. Reference-loading/transcoding failures before dispatch are definitive and refunded without a remote call; AVIF and other unsupported source formats are converted to WebP before multipart submission. Object identity is committed before upload; definite output-delivery failures compensate coins and enqueue idempotent durable cleanup. Shipping discounts and coin-pack allocations are excluded from purchase rewards; original per-item net budgets are frozen in the grant for partial returns.

Category creation has no business limit on count/depth; serialized parent validation rejects cycles and deleted/missing parents. Demo adds Girls/Boys/Baby branches without overwriting merchant edits. Verification requires Decimal/expiry/replay tests, real PostgreSQL spend/payment/refund concurrency and ownership/permission tests, three-language selection/settings flows and current-head Local/S3 migration/restore CI. Migrate forward under the existing ops backup/maintenance procedure; retain ledgers, historical order snapshots and media on rollback. Disable fitting and coin-pack selling before reverting application code; never restore over newer orders.

Coin-pack public visibility requires both the fitting feature and coin sales enabled plus an active variant; this live gate applies to catalog/search suggestions, homepage lists, bestseller ranking, public PDP, sitemap/redirect and product OG queries. Authorized admin preview remains available for editing. Prepared-look saves and purchase-time resolution require live ACTIVE garments in a non-deleted category, never coin packs.

Homepage saves acquire catalog reference row locks and validate live products/categories/variants/colors/sizes inside the same transaction as the JSON write and audit. READY image references use a stronger SHARE lock and live-state check; existing generic media writers retain their draft/trash key-share semantics. Validity is guaranteed at save commit, not against intentional later catalog edits.

### Prepared outfit studio — D74 (2026-10-10)
Owner-approved storefront scope: prepared store models and exact product/color looks, no personal-photo upload. The existing Homepage JSON block contract gains ShopLook; its media and catalog references remain editable through authorized CMS saves and existing audit. No schema/provider/auth/payment/reservation changes. Cart additions are validated and written as one locked batch using the existing quote pipeline and Decimal totals. Demo products/media are additive, tagged, idempotent and do not overwrite merchant edits or historical commerce data. External image generation, credits and loyalty rewards remain a later separately specified delivery. Verification: schema/reference tests, atomic rejection and concurrent cart integration tests, three-language mobile shopping e2e and owner visual acceptance under D70.

<a id="current-policy"></a>
## وضعیت معتبر امروز — ابتدا این جدول را بخوانید

آخرین یکپارچه‌سازی: ۲۰۲۶-۱۰-۰۳، طبق دستور صریح مالک (D70). جدول زیر مرجع قواعد جاری است؛ تصمیم‌های جایگزین‌شده و گزارش‌های تاریخی دستور تازه ایجاد نمی‌کنند.

| موضوع | قاعدهٔ جاری | مرجع |
|---|---|---|
| مدیریت، تأیید فنی و مرج | مهدی مرجع نهایی مرج است. Codex پیاده‌سازی و کنترل کیفیت را انجام می‌دهد و هرگز PR خودش را مرج نمی‌کند. هر PR ابتدا Draft؛ Ready فقط پس از تکمیل پیاده‌سازی، push همهٔ commitهای موردنظر و موفقیت بررسی‌های محلی لازم. | D70 |
| کنترل کیفیت و gate مرج | CI لازم روی SHA فعلی سبز؛ آخرین `[HODASITE-AI-REVIEW]` برای همان SHA بدون blocker؛ گفتگوهای مسدودکننده حل‌شده؛ اجازهٔ صریح مهدی. هر چهار شرط الزامی‌اند. branch + PR، امنیت، حفاظت main و منع force-push باقی است. CI و خودبازبینی، بازبینی مستقل انسانی نیستند. | D44، D45، D70 |
| تغییرات حساس | شواهد آزمون مرتبط، اثر داده و برنامهٔ مهاجرت/بازیابی برای پول، موجودی، Auth و بکاپ لازم است؛ این شواهد جای gate مرج D70 را نمی‌گیرند. | D08، D23، D24، D38، D70 |
| معماری | baseline v1.2 با ADRهای جاری؛ تغییر فنی مهم پیش از پیاده‌سازی ثبت می‌شود. | D02، D34، D39 |
| زیرساخت و پذیرش | توسعه بدون هاست مجاز است. زمان‌بندی D46/D49 با D51 جایگزین شده؛ پذیرش واقعی CP1/CP2، HTTPS، ایمیل، off-site، بازیابی و دسترسی سه کشور پیش از انتشار باز می‌ماند تا اجرا شود. | D46، D49، D51 |
| دامنهٔ محصول | سه بازار IR/TR/CA و سه زبان fa/tr/en حفظ می‌شوند. پیشنهاد فروش آزمایشی در یک بازار، تصمیم اجرایی برای حذف زبان یا بازار نیست. | D09، D10، D63 |
| بازگشت پس از ورود مشتری | فقط wishlist، محصول عمومی با مسیر canonical و anchor اعلان، و مقصدهای پرداخت قبلی؛ آدرس خارجی/مسیرهای مدیریتی/پیمایش مسیر رد می‌شوند. | D66 |
| سئو و داده‌های فاز ۸ | آدرس‌های زبان/بازار D64؛ مهاجرت افزایشی، نظر پیش‌فرض تأییدنشده، اعلان با ایمیل تأییدشده، رضایت مستقل هر بازار و شواهد تاریخ‌دار و غیرقابل‌ویرایش. | D64، D65 |
| مجوزهای داخل محصول | تأیید پرداخت، انتشار پیشنهاد AI، بازپرداخت، دسترسی مدیر و حفاظت از داده همچنان طبق قواعد خود محصول اجرا می‌شوند. | D12، D14، D24، D25، D60 |


> D70 مرجع جاری Work/Codex است و بندهای متعارض حاکمیتی/مرج در D34/D39/D44/D45/D47/D50/D63 و مأموریت D69 را جایگزین می‌کند. متن تصمیم‌های پیشین در ادامه و history برای تاریخچه حفظ شده؛ اجازهٔ self-merge یا حذف gate تازه از آن استخراج نمی‌شود.

**سلسله‌مراتب اعتبار اسناد (بالاتر برنده است):** این فایل (ADR) → شرح فاز → سند مادر → قوانین AGENTS → Prompt.

هر تصمیم شناسهٔ ثابت دارد. اختیار تصمیم فنی در دامنهٔ مجاز با ثبت ADR و شواهد باقی است؛ تغییر هدف تجاری از آن استنتاج نمی‌شود. گردش PR و اختیار مرج فقط تابع D70 است؛ تأیید فنی یا CI جای اجازهٔ صریح مهدی را نمی‌گیرد.

| # | موضوع | تصمیم | چرا |
|---|---|---|---|
| D01 | نام برند / دامنه | **موقتاً `STYLE HUB`**؛ نام، لوگو و دامنه از `Site Settings` در ادمین قابل تغییر | تصمیم نام نباید پروژه را متوقف کند |
| D02 | استک | **Next.js 15 (App Router) + TypeScript + Prisma + PostgreSQL 16 + Tailwind + shadcn/ui**، یک اپ (Storefront + Admin + API) | کمترین تعداد قطعات برای تیم یک‌نفره + AI |
| D03 | جداسازی ماژول‌ها | Modular Monolith: `src/modules/<domain>`؛ هیچ import مستقیم بین ماژول‌ها به‌جز از طریق `index.ts` عمومی هر ماژول | آماده برای جداسازی آینده بدون هزینهٔ الان |
| D04 | سه ارز مجزا | **(۱) ارز پایهٔ قیمت‌گذاری** `pricingBaseCurrency` = USD (تنظیم سراسری، قابل تغییر فقط قبل از پرشدن کاتالوگ)؛ **(۲) ارز حسابداری قانونی/عملیاتی** `functionalCurrency` = TRY (شرکت عملیاتی ترکیه)؛ **(۳) ارز گزارش مدیریتی** `reportingCurrency` = USD. هر مبلغ همیشه با **ارز اصلی خودش** ذخیره می‌شود (مثلاً قیمت خرید = 1500 TRY) و معادل‌های TRY و USD به‌صورت Snapshot با نرخ همان روز کنار آن ثبت می‌شود؛ هرگز رفت‌وبرگشت تبدیل نمی‌کنیم | پیشنهاد وی‌بانو: حسابداری قانونی ≠ گزارش مدیریتی ≠ قیمت‌گذاری |
| D05 | ارز نمایش | IR → **تومان (IRT)** (داخلی: ریال ذخیره نمی‌شود؛ تومان مستقیم)، TR → TRY، CA → CAD | نمایش = واحد پول واقعی مشتری |
| D06 | نرخ ارز | `FxProvider` Interface با چند Provider همزمان: **`frankfurter`** (رایگان، بدون کلید) برای USD→TRY/CAD؛ **`navasan`** (api.navasan.tech، کلید رایگان؛ مهدی در پروژهٔ ارزینو استفاده می‌کند) برای USD→تومان بازار آزاد (فیلد قابل انتخاب: `usd_sell` پیش‌فرض یا `usd_buy`)؛ **`manual`** همیشه موجود. مدل سه‌سطحی: **نرخ پیشنهادی Provider** → **نرخ فعال فروش** (خودکار = پیشنهادی، یا Override دستی با تاریخ اعتبار و یادداشت) → Audit. حالت‌ها: `AUTO_ACCEPT` (پیش‌فرض برای TRY/CAD) / `REQUIRE_APPROVAL` (پیش‌فرض برای تومان: مدیر با یک کلیک Accept می‌کند). Sanity check: اگر نرخ جدید بیش از `Market.fxMaxJumpPercent` (قابل تنظیم از ادمین، پیش‌فرض ۵٪) با قبلی فرق داشت، خودکار اعمال نشود و هشدار بدهد. نرخ مصرف‌شده در هر سفارش Snapshot می‌شود (D07). کش + fallback به آخرین نرخ معتبر + هشدار Stale | نرخ‌های رسمی/بین‌المللی ریال معیار قیمت بازار آزاد نیستند؛ Navasan تجربهٔ عملی موفق دارد |
| D07 | Snapshot | هر Order نرخ‌های ارز، قیمت‌ها و هزینه‌ها را در لحظهٔ ثبت ذخیره می‌کند و دیگر تغییر نمی‌کند | صحت مالی |
| D08 | پول | `numeric(18,4)` در DB، `Decimal` (`decimal.js`) در کد. ادمین قاعدهٔ گردکردن هر ارز را تعیین می‌کند (تومان: گرد به ۱۰۰۰، TRY/CAD: ۲ رقم اعشار، اختیاری Ending مثل `.99`) | float برای پول ممنوع |
| D09 | i18n | `next-intl`، مسیر `/{locale}/…` (`fa`, `tr`, `en`). ترجمه‌های سیستم در فایل JSON **به‌علاوهٔ** جدول `Translation` در DB که override می‌کند و از ادمین قابل ویرایش است | ویرایش متن بدون کد |
| D10 | Market | جدول `Market` (IR/TR/CA) با: ارز، زبان‌های فعال، زبان پیش‌فرض، فعال/غیرفعال، حساب‌های بانکی، مسیر ارسال، کانال پشتیبانی، Markup، گردکردن. انتخاب Market از روی مسیر/انتخاب کاربر/کوکی؛ **نه** از روی IP به‌تنهایی (فقط پیشنهاد) | کاربر ایرانی در ترکیه باید بتواند بازار ایران را انتخاب کند |
| D11 | تاریخ | DB همیشه UTC/میلادی. تبدیل به شمسی فقط در لایهٔ نمایش (`date-fns-jalali`). اعداد فارسی فقط در نمایش | استاندارد |
| D12 | احراز هویت | مشتری: **بدون رمز** (کد ۶ رقمی ایمیل / لینک ورود) + امکان Guest Checkout؛ ادمین: ایمیل + رمز + TOTP (اجباری برای Owner/Admin). کتابخانه: Auth.js | اصطکاک کمتر برای خرید |
| D13 | ثبت‌نام / Checkout | اجباری: نام، نام خانوادگی، ایمیل، تلفن، آدرس کامل. اختیاری: تاریخ تولد، جنسیت (بعداً برای وفاداری). **بدون اعتبارسنجی سخت‌گیرانه** تلفن در MVP (فقط فرمت ساده) | خواستهٔ صریح مهدی |
| D14 | پرداخت | `PaymentProvider` Interface. MVP فقط `OfflineBankTransfer`: نمایش حساب بانکی همان بازار + آپلود فیش + تأیید ادمین. **دو زمان جدا و قابل تنظیم برای هر بازار:** `holdHours` (رزرو سخت موجودی؛ پیش‌فرض TR ۳h، IR ۶h، CA ۶h) و `paymentDeadlineHours` (لغو خودکار سفارش؛ پیش‌فرض ۴۸h). رزرو State-based: `PENDING_PAYMENT` = رزرو کوتاه → `AWAITING_VERIFICATION` (فیش آپلود شد) = رزرو تا تصمیم ادمین → `PAID` = کسر قطعی. اگر رزرو منقضی شود ولی سفارش هنوز در مهلت باشد: سفارش می‌ماند، ولی موجودی برای دیگران آزاد است؛ در لحظهٔ تأیید فیش، اگر موجودی نبود سفارش به `NEEDS_REVIEW` می‌رود (ادمین تصمیم می‌گیرد). ادمین می‌تواند رزرو را دستی تمدید کند | پیشنهاد وی‌بانو: رزرو ۴۸ ساعتهٔ آخرین سایز، فروش را می‌کُشد |
| D15 | وضعیت سفارش | `PENDING_PAYMENT → AWAITING_VERIFICATION → PAID → PROCESSING → SHIPPED → DELIVERED`؛ جانبی: `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `RETURN_REQUESTED`, `RETURNED` | استاندارد + بازگشت کالا |
| D16 | حمل | هر Market یک `ShippingWorkflow` با ۱..n مرحله (`LegTemplate`)؛ هر Shipment مراحل واقعی با Carrier/Tracking/هزینه/وضعیت. MVP: ورود دستی ادمین. `CarrierProvider` Interface برای آینده | خواستهٔ پارت ۵ |
| D17 | Fees Engine | **کاملاً data-driven:** افزودن/تغییر/خاموش‌کردن قوانین هزینه هیچ‌وقت Deploy یا Migration نمی‌خواهد؛ فقط رکورد در جدول. (روش‌های محاسبه مجموعه‌ای ثابت در کد است؛ روش جدید = ADR.) جدول `FeeRule`: نوع (SHIPPING/TAX/CUSTOMS/SERVICE)، Scope (Market→Province→City)، روش (FIXED / PERCENT / PER_KG / WEIGHT_BRACKET / VALUE_BRACKET / PER_ITEM)، min/max، Absorb، فعال/غیرفعال، تاریخ اعتبار، اولویت. Simulator در ادمین | خواستهٔ پارت ۳ |
| D18 | وزن | هر Variant وزن (گرم) و ابعاد (اختیاری). وزن حمل = max(واقعی، حجمی/ضریب قابل تنظیم) | حمل بین‌المللی |
| D19 | تصاویر/فایل‌ها | `StorageProvider`: dev = دیسک محلی؛ prod = MinIO (self-host در همان Docker) یا Cloudflare R2. تبدیل خودکار به WebP/AVIF و سایزهای responsive با `sharp` | سرعت + ایران |
| D20 | جست‌وجو | Postgres Full-Text + `pg_trgm` + نرمال‌سازی حروف فارسی/عربی (ی/ي، ک/ك). Meilisearch فقط در فاز رشد اگر لازم شد | سادگی |
| D21 | صف/کران | همهٔ کارهای سنگین (پردازش تصویر، ایمیل، بکاپ، …) پشت یک Interface صف قرار می‌گیرند تا بعداً بشود Driver را عوض کرد؛ ولی در MVP **Redis/BullMQ اضافه نمی‌شود**. جدول `Job` در Postgres + یک route کران داخلی (`/api/cron/tick`) که هر دقیقه توسط `cron` کانتینر صدا زده می‌شود. Redis/BullMQ فقط با تصمیم جدید | سادگی |
| D22 | هاست | Docker Compose روی یک VPS اروپایی. **کاندیدای اول: Hetzner (آلمان/فنلاند) — مشروط به تست دسترسی از ایران.** قبل از Production یک Test Matrix اجرا می‌شود: از ایران/ترکیه/کانادا × (صفحهٔ اصلی، تصاویر، ورود/OTP، Checkout، آپلود فیش) بدون VPN. اگر رد شد: جایگزین‌ها (Contabo، OVH، Netcup، …). مشخصات و قیمت پلن در زمان خرید بررسی می‌شود (۴ vCPU / ۸GB کافی است). Reverse proxy: Caddy. دو محیط `staging` و `production` | کد به هاست وابسته نیست؛ تصمیم نهایی با داده، نه حدس |
| D23 | بکاپ | روزانه `pg_dump` (custom) + آرشیو media؛ نگهداری ۷/۴/۶؛ **کپی Off-site به یک ارائه‌دهندهٔ مستقل از هاست (شرط Launch، نه توصیه)**؛ صفحهٔ ادمین Backup با ایجاد/دانلود/آپلود/درخواست ریستور. **Restore هرگز داخل پروسهٔ وب‌اپ اجرا نمی‌شود:** ادمین فقط `RestoreRequest` ثبت می‌کند؛ کانتینر جداگانهٔ `ops` آن را اجرا می‌کند. `ops` از همان Dockerfile (stage `ops`) ساخته می‌شود و پوشهٔ `prisma/` اپ را دارد تا migration را **خودش** اجرا کند — **بدون Docker socket**. ترتیب: اعتبارسنجی کامل (zip + tar: traversal/symlink/hardlink/حجم/projectId/مجموعهٔ migrationها به‌صورت Set نه مقایسهٔ رشته‌ای) → **Maintenance اجباری + drain** → بکاپ امنیتی (حالا واقعاً point-in-time) → DB → ریستور اتمیک media (temp → verify → swap) → migrate → verify → خروج از Maintenance (trap: در خطا Maintenance روشن می‌ماند + SystemAlert). Off-site: وضعیت `OK / FAILED / NOT_CONFIGURED` جداگانه ثبت می‌شود و FAILED در Production = SystemAlert قرمز. جزئیات در `04_DATABASE_AND_BACKUP.md` §3 | اصلاح وی‌بانو: restore اولیه برای Production خطرناک بود |
| D24 | حذف داده | سه سیاست: **(الف) مالی/سفارش (Order, Payment, Refund, JournalEntry, StockMovement):** Immutable + وضعیت (`CANCELLED`, `VOIDED`, `FAILED`, `REFUNDED`)، بدون `deletedAt`، بدون UPDATE مقادیر مالی؛ اصلاح = رکورد جبرانی. **(ب) محتوایی (Product, Category, Page, Media, Menu…):** Soft delete با `deletedAt` + سطل بازیافت در ادمین. **(ج) مشتری:** درخواست حذف = ناشناس‌سازی (Anonymize) PII و نگه‌داشتن سفارش‌ها برای حسابداری. حذف فیزیکی فقط media یتیم و jobهای قدیمی | اصلاح وی‌بانو: Soft delete برای Order اشتباه است |
| D25 | AI | **سیاست قطعی AI:** *No direct database writes; all mutations go through authorized tools; checkout, payment, refund and discount actions require explicit user confirmation and an explicit permission check.* AI هرگز به دیتابیس دسترسی مستقیم ندارد، فقط ابزارهای مجاز را صدا می‌زند، و هر ابزار مثل یک کاربر عادی از `assertCan()` عبور می‌کند. `AiProvider` Interface + AI Gateway داخلی با ثبت مصرف. MVP فقط **AI Data Entry Assistant** در ادمین (توضیح محصول، SEO، ترجمهٔ سه‌زبانه) با تأیید انسانی. مدل‌های بعدی طبق فاز | هزینه و ریسک |
| D26 | Design | Design tokens از DB (`ThemeSettings`) → CSS Variables. فونت فارسی **Vazirmatn**، لاتین **Inter** (self-host، بدون Google Fonts برای ایران). پالت پیش‌فرض: کرم/سفید گرم + مشکی + نارنجی برند (`#E8792A`) طبق اسلایدها | ظاهر برای مهدی مهم است |
| D27 | Git | GitHub، branch per phase، PR، CI (lint/typecheck/test) با GitHub Actions. `main` همیشه قابل deploy | استاندارد |
| D28 | Package manager | `pnpm` | سرعت |
| D29 | تست | Vitest (واحد: پول/FX/Fees/Permission)، Playwright (e2e مسیرهای اصلی در سه زبان). تست خودکار هر فاز؛ تست پذیرش دستی هر Checkpoint | توافق با مهدی |
| D30 | زبان اسناد و PR | خلاصهٔ فارسی برای مهدی + جزئیات فنی انگلیسی | مهدی غیربرنامه‌نویس است |

| D31 | سه سطح تنظیمات | **Business Settings** (قیمت، تم، منو، حساب بانکی، هزینه‌ها، متن‌ها…) → دیتابیس/ادمین. **Application Configuration** (اتصال DB، کلیدهای رمزنگاری، Secretها، S3، SMTP) → Environment، هرگز در DB. **Code Contracts** (Permission namespace، schema، state machine) → Repository با PR. کلیدهای API سرویس‌های اختیاری (Navasan، AI) در Environment می‌مانند؛ ادمین فقط «فعال/غیرفعال + وضعیت اتصال» را می‌بیند | اصلاح وی‌بانو: «همه‌چیز از ادمین» نباید شامل Secret شود |
| D32 | مدل هزینهٔ کالا از فاز ۰۳ | `Lot` (خرید دسته‌ای با ارز اصلی، تاریخ، نرخ Snapshot)، `StockMovement` با ارجاع به Lot، روش COGS = FIFO (تنظیم: میانگین)، Landed Cost (حمل ورودی/گمرک) قابل تخصیص به Lot. UI کامل مالی در فاز ۰۶ ولی **ساختار داده در فاز ۰۳ قفل می‌شود** | تغییر Cost Basis بعد از فروش واقعی = فاجعه |
| D33 | مرجوعی/تعویض در هستهٔ سفارش | مدل داده `ReturnRequest`, `ReturnItem`, `Exchange` (سفارش پیوندی با `parentOrderId` و `exchangeOfOrderItemId`)، حرکت موجودی `RETURN` با وضعیت `RESTOCK/QUARANTINE/DAMAGED`، `Refund` به روش اصلی یا `StoreCredit`. **مدل داده در فاز ۰۴، جریان ادمین + مشتری در فاز ۰۵**، پورتال کامل و قوانین Eligibility در فاز ۰۹ | برای پوشاک حیاتی است (سایز M → L) |
| D34 | نقش‌ها و Governance — بند حاکمیت جایگزین با D70 | مهدی مالک محصول است؛ وی‌بانو/عامل اجرایی مدیریت فنی، پیاده‌سازی، بازبینی کیفیت و مرج را طبق D50/D63 انجام می‌دهد. تأیید یا همکاری پیکسل و اجازهٔ موردی مالک برای تأیید فنی/مرج شرط کار نیست. ADR پیش از تغییر استراتژی schema، Auth، مدل پول، رزرو موجودی، معماری پرداخت، Provider جست‌وجو/AI، هاست یا بکاپ ثبت می‌شود. بازبینی مستقل در صورت انجام، با هویت و شواهد واقعی گزارش می‌شود؛ خودبازبینی مستقل نامیده نمی‌شود. | دستور صریح مالک؛ D63 |
| D35 | ترتیب فازهای ۰۶–۰۸ | 06 Finance Core → 07 AI Data Entry → 08 SEO/PWA/Performance | مالی زودتر (وی‌بانو)؛ دستیار ورود اطلاعات قبل از ورود محصولات واقعی (پیکسل)؛ کارایی نزدیک به لانچ |
| D36 | Restore Verification | هفتگی: ریستور در DB موقت + بررسی migration id، تعداد رکوردها، FK consistency (`pg_restore` بدون خطا + کوئری‌های integrity)، تطبیق Media manifest با فایل‌ها، بازکردن یک سفارش نمونه با تمام روابط، checksum | Count ساده کافی نیست |

| D37 | Provider نرخ بین‌المللی | `frankfurter.dev` (نسخهٔ v2 با ۲۰۰+ ارز از بانک‌های مرکزی؛ IRR رسمی را هم دارد ولی برای ما بی‌استفاده است). مکس endpoint دقیق v2 را از مستندات رسمی می‌گیرد و با پاسخ ضبط‌شده تست می‌کند؛ `api.frankfurter.app` قدیمی fallback | اصلاح ادعای پیکسل توسط وی‌بانو |
| D38 | قفل همزمانی موجودی | رزرو و کسر موجودی در یک تراکنش با `SELECT … FOR UPDATE` روی `StockItem` (ترتیب قفل ثابت: بر اساس `variantId`) + Constraint دیتابیس `onHand - reserved >= 0`. تست Concurrency اجباری: دو تراکنش همزمان روی آخرین عدد، فقط یکی موفق | خواستهٔ وی‌بانو |
| D39 | نسخهٔ Baseline — جاری | نسخهٔ اسناد در `00_INDEX.md` ثبت می‌شود (فعلاً **v1.2**). هر PR می‌نویسد: `Implemented against docs v1.2 / Dxx`. عامل اجرایی تغییر فنی baseline را طبق D50/D63 با ADR و دلیل ثبت می‌کند؛ تأیید پیکسل لازم نیست. | ردیابی تغییرات |
| D40 | کلید ذخیره‌سازی فایل | `storageKey` همیشه توسط سیستم تولید می‌شود (`media/<yyyy>/<mm>/<cuid>.<ext>`)؛ نام فایل خام کاربر فقط در `Media.originalName` ذخیره می‌شود و هرگز به‌عنوان مسیر object استفاده نمی‌شود | Hardening وی‌بانو |
| D41 | تست اسکریپت‌های بکاپ | `scripts/backup/tests/run.sh` (بدون نیاز به DB؛ psql stub) در CI هر PR اجرا می‌شود و باید سبز باشد: zip عادی/حجیم/traversal/خراب، tar عادی/حجیم/symlink/traversal/نام با فاصله، Media خوب/ناقص/خالی/MIME غلط، شکست Query دیتابیس = REJECT (Fail-closed)، sanitize. هر Guard جدید = یک Case جدید | یافتهٔ وی‌بانو: «روی کاغذ GO بود، اجرا باگ داشت» |

| D42 | نشست ادمین: استراتژی JWT | نشست ادمین از **JWT** استفاده می‌کند، نه `session.strategy: "database"` — چون Auth.js v5 با Credentials provider نشست دیتابیسی را پشتیبانی نمی‌کند (خطای صریح: «Credentials provider is present but the JWT strategy is not enabled»). جدول‌های `Account`/`Session` برای جریان magic-link مشتری (فاز ۰۴) در اسکیما می‌مانند. عمر نشست کوتاه: **۸ ساعت** (`SESSION_MAX_AGE_SECONDS` در `src/modules/auth/config.ts`). `AUTH_SECRET` **اجباری** است؛ بدون آن سرور بالا نمی‌آید (`src/instrumentation.ts`)، هیچ مقدار پیش‌فرضی در کد نیست. **احراز هویت ≠ مجوز:** امضای معتبر JWT به‌تنهایی هرگز دسترسی نمی‌دهد؛ `can()` در هر اکشنِ مجازشده کاربر را از DB می‌خواند و `isActive` را چک می‌کند، پس غیرفعال‌کردن کاربر یا تغییر مجوزها روی مسیر اکشن فوری اثر می‌کند. **موکول به فاز ۰۵:** `sessionVersion` / ابطال فوری توکن — تا آن زمان فقط *دیدن* صفحه‌های ادمین می‌تواند تا انقضای توکن (۸h) عقب بیفتد؛ هیچ اکشنی اجرا نمی‌شود. | تأیید Pixel + Vee، ۲۰۲۶-۰۹-۰۳ (فاز ۰۰) |
| D43 | rollback واقعی دیپلوی → فاز ۰۵ | فلگ `--rollback` از `scripts/deploy.sh` حذف شد (فقط pull + restart بود، rollback واقعی نبود). **rollback واقعی** = تگ‌کردن image به‌ازای هر دیپلوی + نگه‌داشتن تگ قبلی + بازگردانی خودکار از بکاپ امنیتیِ پیش‌ازدیپلوی هنگام شکست، به **فاز ۰۵** موکول شد. تا آن زمان: بازگردانی دستی با `scripts/backup/restore.sh` داخل کانتینر `ops`. | تأیید Pixel + Vee، ۲۰۲۶-۰۹-۰۳ (B12 فاز ۰۰) |
| D44 | انضباط برنچ — بند مرج جایگزین با D70 | هر تغییر از برنچ + PR عبور می‌کند؛ commit/push مستقیم روی `main` و force-push/بازنویسی تاریخچهٔ مشترک ممنوع است. قبل از مرج، آخرین head بازبینی شده و سه CI لازم سبز باشند؛ اشکال‌های مسدودکننده رفع و گفتگوهای لازم حل شوند. بند قدیمی self-merge این تصمیم تاریخی است و اختیار مرج جاری فقط از D70 استخراج می‌شود. ادعاهای قدیمی دربارهٔ مخزن خصوصی و منع self-merge نیز صرفاً سابقه‌اند و دستور اجرایی ایجاد نمی‌کنند. | D45، D70 |
| D45 | مخزن public و حفاظت شاخه — اختیار مرج تابع D70 | مخزن public است؛ اطلاعات شخصی/رازها و اسناد تجاری کامل وارد مخزن نمی‌شوند. سیاست حفاظت main: Require PR؛ Require checks `checks` / `docker` / `docker-runtime`؛ منع force-push و حذف شاخه؛ حل گفتگوهای لازم. وضعیت واقعی حفاظت هنگام عملیات بررسی می‌شود و دور زده نمی‌شود. اختیار مرج تابع D70 است و بندهای متعارض مرج D50/D63 جایگزین شده‌اند. | تصمیم مالک؛ یکپارچه‌سازی D63 |
| D46 | معیارهای واقعی؛ زمان‌بندی جایگزین‌شده با D51 | پیش از **Checkpoint 1**: سرور staging + دامنه‌ی آزمایشی + HTTPS واقعی Caddy + S3 واقعی (R2/MinIO) — چون ویترین و تصاویر در CP1 تست می‌شوند. پیش از **Checkpoint 2**: بکاپ off-site (OB6) + یک restore drill واقعی روی staging + MFA (فاز ۰۵). پیش از **Production**: تست دسترسی از ایران/ترکیه/کانادا (OB7) + مسیر کامل خرید. وی‌بانو، ۵ سپتامبر ۲۰۲۶. | مهدی؛ پیشنهاد پیکسل؛ تأیید وی‌بانو |
| D47 | چرخهٔ کاری — جایگزین‌شده | قواعد نقش‌ها، بازبینی مستقل اجباری و اجازهٔ جداگانهٔ مرج این تصمیم با D50/D63 جایگزین شده‌اند. متن قدیمی فقط در `history/GOVERNANCE_BEFORE_D63.md` نگهداری می‌شود؛ قاعدهٔ اجرایی از این ردیف استخراج نشود. | تاریخچهٔ تصمیم ۲۰۲۶-۰۹-۰۸ |
| D48 | ویرایشگر RichText فاز 01c | به‌دلیل مسدودبودن دانلود بسته‌های npm در محیط اجرا، مهدی گزینهٔ «ویرایشگر داخلی امن» را به‌جای TipTap تأیید کرد. ویرایشگر باید بصری و بدون نیاز به JSON باشد، از RTL/LTR و ابزارهای پایهٔ متن غنی پشتیبانی کند، خروجی را به ساختار بلوک‌ها تبدیل کند و اعتبارسنجی/پاک‌سازی سرور همچنان مرجع نهایی بماند. این تصمیم وابستگی runtime تازه‌ای اضافه نمی‌کند و هدف محصول را تغییر نمی‌دهد. | تصمیم صریح مهدی؛ پیشنهاد وی‌بانو، ۲۰۲۶-۰۹-۰۸ |
| D49 | تعویق CP1؛ زمان‌بندی جایگزین‌شده با D51 | به‌دلیل آماده‌نبودن سرور و دامنه، بخش عملیاتی Checkpoint 1 (staging، دامنهٔ آزمایشی، HTTPS واقعی Caddy، Lighthouse عمومی و ۱۷ آزمون دستی روی گوشی/لپ‌تاپ) فعلاً باز می‌ماند، اما پس از سبزشدن کامل CI فاز ۰۲ مانع شروع فازهای ۰۳ تا ۰۵ نیست. این استثنا فقط زمان‌بندی D46 را تغییر می‌دهد و هیچ معیار پذیرشی حذف یا پاس‌شده فرض نمی‌شود. همهٔ موارد CP1 و پیش‌نیازهای عملیاتی D46 باید حداکثر پیش از اجرای دستی Checkpoint 2 تکمیل شوند؛ اگر CP1 بیش از سه باگ مسدودکننده آشکار کند، قاعدهٔ توقف رودمپ فوراً اعمال می‌شود. | تصمیم صریح مهدی؛ ثبت و تأیید وی‌بانو، ۲۰۲۶-۰۹-۰۹ |

| D50 | اختیار اجرایی مالک — بند مرج جایگزین با D70 | مالک اختیار تصمیم‌های فنی و تأیید/مرج PRهای لازم را به عامل اجرایی واگذار کرده است؛ تأیید پیکسل و اجازهٔ موردی مالک لازم نیست و عامل می‌تواند PR پیاده‌سازی‌شدهٔ خود را پس از کنترل کیفیت مرج کند. branch + PR، بررسی امنیتی، سه CI سبز، منع force-push و گزارش صریح نتایج باقی است. CI و خودبازبینی جای بازبینی مستقل انسانی معرفی نمی‌شوند. قواعد تأیید کاربران داخل محصول تغییر نمی‌کند. | دستور مالک ۲۰۲۶-۰۹-۱۰؛ تصریح و یکپارچه‌سازی D63 |
| D51 | خرید زیرساخت نزدیک انتشار | توسعه و تست خودکار فازها می‌تواند پیش از خرید هاست و دامنه ادامه یابد. خرید و استقرار به مرحلهٔ نزدیک انتشار منتقل می‌شود؛ پذیرش دستی CP1/CP2، HTTPS، ایمیل واقعی، off-site و تست دسترسی سه کشور همچنان پیش‌نیاز انتشارند و بدون اجرا تأییدشده محسوب نمی‌شوند. این ردیف فقط زمان‌بندی D46/D49 را به‌روز می‌کند. | تصمیم مالک و پاسخ مورد قبول او در همین جلسه؛ ۲۰۲۶-۰۹-۱۰ |

### تکمیل قرارداد نشست مشتری — D52 (۲۰۲۶-۰۹-۱۰)
با اختیار فنی تفویض‌شده در D50، قرارداد D12/D42 برای مشتری صریح شد: OTP و لینک یک‌بارمصرف در AuthOtp نگه‌داری می‌شوند و همان Auth.js با Credentials و JWT هشت‌ساعته، کوکی و مسیر مستقل مشتری را اداره می‌کند. Customer هیچ حساب User یا نقش ادمین نمی‌سازد؛ isActive و sessionVersion در هر خواندن محافظت‌شده از دیتابیس بررسی می‌شوند. جدول‌های Account/Session موجود حذف نمی‌شوند. این تصمیم در بازبینی فاز ۰۴ ثبت شد تا انتخاب پیاده‌سازی و تفاوت آن با پیش‌بینی قدیمی استفاده مشتری از Session مبهم نماند؛ کتابخانه و الگوی تک‌برنامه تغییر نکرده است.

### تکمیل امنیت مدیر در فاز ۰۵ — D53 (۲۰۲۶-۰۹-۱۰)
طبق D12/D42 و اختیار D50، Auth.js/JWT باقی می‌ماند و AdminSession صرفاً دفتر ابطال/انقضای نشست است؛ در هر احراز هویت سمت سرور، وضعیت کاربر، sessionVersion و رکورد نشست بررسی می‌شود. نقش owner/admin (و نقش دارای اختیار امنیتی) تا تأیید TOTP فقط نشست محدود ده‌دقیقه‌ای برای راه‌اندازی MFA می‌گیرد. TOTP با کتابخانه OTPAuth، کلید شخصی رمز‌شده با AES-GCM و کد بازیابی یک‌بارمصرف هش‌شده پیاده می‌شود؛ این کلید، credential کاربر است و با API secretهای D31 تفاوت دارد. QR در خود برنامه ساخته می‌شود و هیچ راز MFA به سرویس خارجی نمی‌رود. مصرف TOTP و recovery code زیر قفل دیتابیس، محدودیت تلاش و منع بازپخش الزامی است. کنترل نسخه نشست و MFA در مسیرهای مستقیم سرور هم اجرا می‌شود. اجرای تست از داده ساختگی و مسیر واقعی MFA استفاده می‌کند و هیچ bypass محیطی در برنامه اضافه نمی‌شود.

### مرحلهٔ ۰۵b — ظاهر موبایل و وب‌اپ نصب‌پذیر (D54، ۲۰۲۶-۰۹-۱۱)
طبق دستور مالک، ترتیب اجرا: تکمیل معیارهای فاز ۰۵ → مرحلهٔ ۰۵b طراحی و وب‌اپ موبایل → آغاز فاز ۰۶ مالی. مرحلهٔ ۰۵b تکمیل تعهدات طراحی D26 و فاز 01c است؛ تعریف آن در `phases/phase-05b.md` آمده است. زیرساخت نصب PWA (manifest، آیکون، پوستهٔ مستقل، راهنمای نصب و offline ایمن) از فاز ۰۸ جلو می‌آید؛ SEO، نقد/علاقه‌مندی و سنجش نهایی عملکرد/انتشار در ۰۸ باقی است. محصول اصلی وب‌اپ سه‌زبانه است و اولویت پذیرش با موبایل Android/iPhone است؛ wrapper بومی در ۱۱ اختیاری و جایگزین PWA نیست. حفظ امنیت داده‌های سفارش و حساب در کش و logout الزامی است. نصب واقعی روی iPhone/Android با HTTPS و دستگاه واقعی پیش از انتشار تأیید می‌شود؛ شبیه‌سازی مرورگر یا localhost لپ‌تاپ معادل این پذیرش نیست. خرید زیرساخت طبق D51 همچنان موکول به نزدیک انتشار است.

### قرارداد مرجوعی و اعتبار (D55، ۲۰۲۶-۰۹-۱۱)
طبق D04/D24/D33 و اختیار D50، مرجوعی سقف مقدار خرید و مبلغ خالص اقلام پس از تخفیف دارد؛ هزینهٔ ارسال/خدمات اولیه در جریان خودکار فعلی برگشت داده نمی‌شود و پیش از درخواست این سیاست به مشتری نمایش داده می‌شود. بازه و استثنای دسته‌بندی از تنظیمات هر بازار است؛ پیش‌فرض نمایشی ۱۴ روز، نه ادعای قانون کشور. رسیدن کالا به انبار شرط ثبت حرکت RETURN است؛ تنها RESTOCK موجودی قابل‌فروش را افزایش می‌دهد و بهای دستهٔ اصلی حفظ می‌شود. اعتبار فروشگاه ابزار پرداخت است، نه تخفیف: رزرو اتمی CreditUse، مصرف در تأیید پرداخت و آزادسازی در لغو سفارش؛ مبلغ و نرخ سفارش تغییر نمی‌کند. تعویض از همان محصول با رنگ/سایز دیگر یک سفارش مرتبط با قیمت و نرخ snapshot تازه می‌سازد و ارزش مرجوعی را به اعتبار قابل مصرف در آن تبدیل می‌کند؛ مابه‌التفاوت باقیمانده پرداخت یا اعتبار مشتری است. هر تغییر مالی و موجودی idempotent و audit می‌شود. فاکتور اصلی دست‌نخورده می‌ماند و دفتر مالی فاز ۰۶ از رکوردهای جبرانی استفاده می‌کند.

### کنترل عملیات و بازیابی S3 (D56، ۲۰۲۶-۰۹-۱۱)
با اختیار D50 و در محدودهٔ D23/D36، وب فقط درخواست‌های نوع‌دار عملیات را ثبت می‌کند؛ worker مجزای ops آن‌ها را با قفل سراسری اجرا می‌کند و هیچ فرمان یا مسیر آزاد کاربر را به shell نمی‌دهد. بازیابی علاوه بر نقش owner و مجوز backup.restore به رمز و TOTP تازه نیاز دارد. آپلود بخش‌بندی‌شده در volume قرنطینه و دانلود از volume فقط‌خواندنی وب انجام می‌شود. اعتبارسنجی آرشیو پیش از نگهداری دادهٔ زنده الزامی است. برای S3، بکاپ از نسل فعال اشیا تهیه و بازیابی ابتدا در پیشوند تازهٔ رزروشده بارگذاری و بررسی می‌شود؛ فایل اشاره‌گر نسل در volume مشترک با rename اتمی عوض می‌شود. نشانی S3_PREFIX_FILE از محیط است و محتویات فایل فقط حالت عملیاتی ذخیره‌سازی، بدون کلید یا credential، است. نسل قبلی تا تأیید و بازیابی احتمالی حفظ می‌شود. کلید منطقی Media و URL عمومی تغییر نمی‌کند؛ پیشوند داخلی هرگز ورودی کاربر نیست. قطع عملیات پیش از تعویض اشاره‌گر، اشیای قبلی را دست‌نخورده باقی می‌گذارد. این تصمیم تغییر ارائه‌دهنده یا خرید زیرساخت نیست؛ اثبات runtime و تست قطع عملیات پیش از اعلام تکمیل لازم است.

### ترتیب تحویل و آغاز محاسبات مالی (D57، ۲۰۲۶-۰۹-۱۲)
در پاسخ به تأکید مالک بر شروع فاز ۶ و با اختیار D50، محاسبات مستقل و آزمون‌های پایهٔ مالی می‌توانند هنگام بستن معیارهای فاز ۵ آماده شوند؛ این استثنا فقط آماده‌سازی مستقل است و مجوز اتصال زودهنگام به پرداخت‌ها یا عبور از معیارهای فاز ۵ نیست. ترتیب تحویل قابل‌استفاده همچنان تکمیل ۵ → ظاهر موبایل و PWA در ۵b → داشبورد و گردش‌کار مالی ۶ است. PR #20 شروع همین محاسبات است، نه تکمیل فاز ۶. این تصمیم D54 را در مورد زمان آغاز آماده‌سازی فنی دقیق‌تر می‌کند؛ تعهدات طراحی، نصب واقعی و D51 تغییر نمی‌کنند.

### دامنهٔ اجرایی ماتریس دسترسی (D58، ۲۰۲۶-۰۹-۱۲)
با اختیار D50، V-4 برای ۵۴ مجوز دارای سطح اجرایی تا فاز ۵ روی عملیات واقعی با دیتابیس اجرا می‌شود. چهار نام `finance.expense.create`، `finance.report.view`، `crm.customer.export` و `marketing.campaign.publish` قراردادهای رزروشدهٔ فازهای ۶ و ۹ هستند؛ امروز هیچ صفحه، endpoint یا عملیات ساختگی برای آن‌ها ایجاد نمی‌شود. آزمون قرارداد و تصمیم همهٔ ۵۸ نام را پوشش می‌دهد؛ registry مستقل، نبود پیاده‌سازی چهار نام رزروشده را کنترل می‌کند و به‌محض اضافه شدن سطح اجرایی، انتقال به ماتریس عملیاتی همان فاز اجباری است. این تفکیک به معنی عبور از پذیرش قابلیت موجود نیست.
عملیات سراسری مثل برند/تم/نقش با مجوز محدود به بازار، دسته یا بخش قابل انجام نیست؛ درخواست global از محدودهٔ آن مجوز بیرون است. عملیات سفارش، پرداخت، فاکتور، ارسال، مرجوعی و تنظیمات بانکی محدوده را از بازار واقعی منبع می‌گیرند و TR/IR جدا آزموده می‌شوند. محدودیت دوم مثل `return.manage` برای refund و `inventory.view` برای نمایش هزینه در صفحهٔ انبار نیز جزئی از انتظار آزمون است. سیاست عدم افشای وجود منبع در سند `phases/phase-05-permission-acceptance.md` ثبت می‌شود.

### دفتر کل پایدار — D59 (۲۰۲۶-۰۹-۱۳)
با اختیار D50 و در ادامهٔ D04/D08/D24، اولین زیرساخت فاز ۶ از مدل `LedgerAccount` استفاده می‌کند؛ مدل `Account` متعلق به احراز هویت است و تغییر نمی‌کند. حساب‌ها به بازار و ارز مقیدند. هر سند دستی شناسهٔ درخواست یکتا در بازار، تاریخ مؤثر UTC، علت، عامل واقعی نشست و خطوط با مبلغ اصلی، معادل TRY/USD و نرخ‌های همان سند دارد. نرخ‌ها مثبت و حداکثر ۱۲ رقم اعشارند؛ معادل‌ها با ROUND_HALF_UP به چهار رقم اعشار محاسبه می‌شوند. عدم توازن ناشی از گردکردن رد می‌شود و هرگز پنهانی تعدیل نمی‌شود.
سند در یک تراکنش ساخته و مهر نهایی می‌خورد؛ DRAFT فقط مرحلهٔ درون‌تراکنشی است و در زمان commit مجاز نیست. دیتابیس توازن هر ارز و معادل‌ها، انطباق بازار/ارز حساب و تبدیل نرخ را کنترل می‌کند. سند نهایی و خطوط آن append-only هستند. اصلاح فقط با یک سند معکوس مرتبط و علت جدید است؛ سند اصلی دست‌نخورده می‌ماند و معکوس‌کردن دوباره یا معکوسِ معکوس رد می‌شود. کلید تکراری فقط برای همان درخواست و همان عامل نتیجهٔ قبلی را برمی‌گرداند؛ برخورد محتوای متفاوت خطاست.
مجوز `finance.journal.post` به namespace اضافه و برای owner (wildcard) و accountant فعال می‌شود؛ نقش‌های دیگر خودکار این مجوز را نمی‌گیرند. سرویس‌های ثبت/معکوس از نشست واقعی و مجوز بازار استفاده می‌کنند؛ خواندن از `finance.report.view`. این تحویل فقط زیرساخت و سرویس‌های داخلی آزموده‌شده است؛ رابط ثبت دستی، اتصال پرداخت/مرجوعی و اسناد افتتاحیهٔ تاریخی در تحویل بعدی ساخته می‌شوند. هیچ سابقهٔ فروش یا پرداخت خودکار backfill نمی‌شود و گزارش موجود سود/ماندهٔ بانک نامیده نمی‌شود.

## D67 — Spatial storefront and reusable media framing (۲۰۲۶-۰۹-۱۹)

Adapt the owner's Lovable visual reference to the existing Next.js storefront; do not import its simulated checkout, account, pricing or TanStack runtime. Women, men, kids and accessories have equal department entry points, sourced from editable root categories. Hero composition is selectable in Homepage admin; branding, copy, category ordering and imagery remain DB-controlled. No paid Lovable generation is required.

Add `Media.presentation` JSON with an empty-object default, validated optional `fit` (cover/contain) and normalized focalX/focalY (0–1). This additive migration preserves all existing assets and storage keys. Shared storefront media presets use this metadata; the full-image dialog always shows the uncropped image. Admin media.write authorization, mutation gate and audit apply. No financial, inventory, authentication or storage-provider change. Normal pg_dump includes the column; apply migration before app rollout, retain the column on code rollback. Verify framing validation, authorized metadata editing, three-language department navigation and mobile/gallery rendering. Real device/iPhone and production-speed acceptance remain separate.

## تصمیم‌های باز (مانع شروع نیستند)
### تکمیل مالی و حفظ داده — D60 (۲۰۲۶-۰۹-۱۴)
مالک تأیید کرد داده‌های فعلی آزمایشی‌اند؛ این اجازه سیاست نگهداری داده‌های آینده را تغییر نمی‌دهد. مهاجرت‌ها افزایشی‌اند و هیچ reset، حذف سفارش یا بازنویسی نرخ تاریخی اجرا نمی‌شود. تنظیم حسابداری هر بازار به‌طور پیش‌فرض غیرفعال است؛ مالک/حسابدار آن را برای رویدادهای جدید فعال می‌کند. فعال‌سازی سوابق گذشته را backfill نمی‌کند. ثبت خودکار در همان تراکنش رویداد انجام می‌شود؛ رویدادهای مشتری/سیستم عامل ادمین جعلی ندارند. هر جزء درآمد/مالیات/تسویه با حساب واسط یک جفت متوازن دارد تا گردکردن مستقل باعث تعدیل پنهانی نشود. مبنای مدیریتی درآمد، پرداخت تأییدشده است؛ اعتبار فروشگاه بدهی است و درآمد تازه محسوب نمی‌شود. بهای موجودی با نرخ خرید ثبت می‌شود. خرید و هزینه و سرمایه، شناسهٔ درخواست یکتا و snapshot دارند؛ اصلاح سوابق نهایی فقط سند جبرانی است. بکاپ کامل دیتابیس و رسانه و بازیابی ops از پنل مالک معیار اجباری باقی می‌ماند. توسعه بدون انتشار/هاست/دامنه ادامه می‌یابد.


### D61 — Cost method and safe financial cutover (owner-delegated implementation)
Physical variant/warehouse stock is shared across markets. FIFO remains the default. An unscoped accountant/owner may explicitly select moving weighted average for a stock item before its first valuation/recognized COGS. Once valuation starts the method cannot change or rewrite historical cost. Average pools retain quantity and original/TRY/USD balances; each receipt, sale, adjustment and restock records immutable valuation evidence. Returns restore original sale valuation. Remaining stock in an average pool must use one original purchase currency; mixed-currency procurement uses FIFO, without an invented conversion. An amount whose rounded equivalents cannot be represented by the ledger's positive 12-decimal rates is rejected atomically rather than silently adjusted. The interface explains these limits. D04, D24 and D32 remain binding.

Opening cost is an explicit, audited action on existing units lacking a Lot, with supplied date/FX and the product default cost. It does not change physical quantities, infer historical quotes, or replace existing Lots. Cumulative FIFO allocation conserves the full landed original amount including the displayed unit-cost rounding remainder. All financial tables and expense storage objects remain within the existing backup/restore workflow; no hosting or provider change is introduced.

### D62 — Phase 07 implementation under D25/D31 and owner delegation D50
Use the approved three provider adapters behind a fixed-host server gateway. Environment-only keys; model names, conservative USD price estimates, task routes, monthly soft/hard limits and feature switches are validated admin configuration. Reserve expected upper-bound cost under a global monthly lock before calls; unknown outcomes retain their reservation, terminal retries never call providers again. This is an application spending estimate, not the provider's billing enforcement. Product proposals require per-field review and explicit authorized Apply with a version check; status/prices/stock/variants are not AI-editable. Bulk generation uses the existing DB queue and rechecks the original user's current permissions. Financial analysis receives aggregates only and has no mutation tools. Optional photo interpretation can suggest visual facts only; fabric composition and measurements require supplied evidence. Provider latency and account availability are not proved by mocks. No new provider, hosting service or secret-storage mechanism is introduced.


### D63 — یکپارچه‌سازی اختیار تأیید و مرج (۲۰۲۶-۰۹-۱۴؛ بندهای مرج جایگزین با D70)
مالک صریحاً خواست الزام تأیید/همکاری پیکسل و اجازهٔ جداگانهٔ خودش برای تأیید فنی و مرج از اسناد حذف شود. این تصمیم D34/D39/D44/D45/D47/D50 و دستورهای متناظر README، AGENTS، CLAUDE، راهنما و پرامپت‌ها را یکپارچه می‌کند؛ نسخهٔ قبلی ردیف‌ها فقط در تاریخچه نگهداری می‌شود. تأیید فنی و مرج در اختیار عامل اجرایی است، از جمله برای PR خودش. شرط تأیید شخص دوم یا تفکیک مجوز مرج بر اساس نام شخص وجود ندارد.

کنترل‌های فنی باقی‌اند: بررسی تغییرات و امنیت، رفع ایراد مسدودکننده، سه CI سبز روی آخرین head، رعایت حفاظت main، ثبت اثر بر داده و شواهد آزمون مرتبط برای پول/موجودی/Auth/بکاپ. برای تغییرات schema یا بازیابی، برنامهٔ مهاجرت و بازیابی ثبت می‌شود. کنترل‌های کیفیت محصول و پذیرش واقعی حذف نمی‌شوند؛ گزارش باید بین خودبازبینی، بررسی خودکار و بازبینی مستقل تمایز واقعی بگذارد. این دستور مجوز انتشار سایت، خرید زیرساخت یا تغییر DNS نیست؛ هیچ‌کدام در این اصلاح اسناد اجرا نمی‌شود.

نقد اولویت‌های تجاری در `reviews/LAUNCH_SCOPE_REVIEW_FA.md` ثبت شده است. محصول سه‌بازاری/سه‌زبانه باقی می‌ماند؛ تمرکز فروش آزمایشی روی ترکیه پیشنهاد است، نه تصمیم اتخاذشده. پرداخت و تحویل ایمیل واقعی باید پیش از فروش بررسی شوند. تأیید پرداخت و انتشار AI در خود وب‌اپ با این تصمیم حذف نمی‌شود.

## تصمیم‌ها و شواهد باز — به‌ترتیب اولویت آمادگی انتشار

- **OB8 — پرداخت بازارها:** انتخاب مسیر قابل‌استفادهٔ پرداخت برای TR/CA (و تأیید مسیر IR)، شرایط پذیرندگی و تسویه، هزینه، بازپرداخت، تطبیق بانکی و ظرفیت بررسی دستی. D14 فعلاً پرداخت آفلاین است؛ درگاه جدید انتخاب یا پیاده نشده. قبل از فروش باید مسیر واقعی خرید تا تأیید وجه و بازپرداخت آزمایش شود. پیشنهاد عرضهٔ محدود و نیاز به درگاه برای عرضهٔ عمومی در گزارش ارزیابی ثبت شده، نه به‌عنوان تصمیم قطعی.
- **OB2 — ایمیل واقعی:** انتخاب و پیکربندی سرویس تولید؛ کد فعلی آداپتورهای SMTP و Resend و صف/تلاش مجدد دارد و Mailpit در CI مسیر ایمیل را می‌آزماید. دریافت واقعی کد/لینک و زمان تحویل برای کاربران ایران/ترکیه/کانادا اثبات نشده. اگر شکست خورد، پیش از فعال‌سازی بازار مربوطه راه جایگزین لازم است؛ صرفاً رسیدن به فاز ۹ راه‌حل محسوب نمی‌شود.
- **OB6 — off-site:** انتخاب مقصد مستقل از هاست، mirror واقعی و مشق بازیابی DB + رسانه روی staging — شرط انتشار.
- **OB7 — زیرساخت و دسترسی:** انتخاب نهایی میزبان، HTTPS، اجرای CP1/CP2 و ماتریس دسترسی ایران/ترکیه/کانادا و ثبت تاریخ/نتیجه — طبق D51 پیش از انتشار.
- **OB5 — تنظیمات واقعی مالیات/گمرک:** دریافت اعداد و قواعد از حسابدار محلی؛ دادهٔ seed معتبر تجاری محسوب نمی‌شود. پیش از فروش در هر بازار، نمایش و محاسبهٔ هزینه‌ها بررسی شود؛ فعال‌سازی دفتر کل طبق D60 با تنظیمات معتبر و بدون بازنویسی تاریخچه است.
- **OB1 — برند و دامنه:** مالک دامنهٔ اصلی مدنظر را مشخص کرده؛ تنظیم DNS/استقرار انجام نشده. نام نمایشی/لوگو و محتوا باقی است. مشخصات خصوصی عملیاتی وارد مخزن عمومی نمی‌شود.
- **OB4 — AI واقعی:** آداپتورهای سه ارائه‌دهنده در فاز ۰۷ پیاده شده‌اند (D62)؛ کلید واقعی، انتخاب مدل در حساب قابل‌استفاده و آزمون زمان پاسخ باقی است. آزمون ساختگی اثبات اتصال واقعی نیست.
- **OB3 — پیامک:** انتخاب سرویس ایران/ترکیه در دامنهٔ فاز ۹ است؛ شکست آزمون ورود ایمیلی باید پیش از فروش حل شود و منتظر این شمارهٔ فاز نماند.

## D64 — نشانی‌های پایدار سئو پیش از انتشار (فاز 08b)

برای صفحات عمومی خانه، محصول، دسته و CMS، نشانی canonical به‌شکل `/{locale}/m/{marketCode}/...` است؛ زبان و بازار از مسیر تعیین می‌شوند و کوکی نمی‌تواند آن‌ها را عوض کند. مسیرهای قدیمی برای سازگاری باقی می‌مانند و canonical به مسیر پایدار اشاره می‌کند. زیر‌دامنه، تغییر DNS و انتقال هاست در این تصمیم نیست. حالت مسیر، قرارداد فعلی پیاده‌سازی فاز ۰۸ است؛ حالت زیر‌دامنه تا تصمیم جداگانه پشتیبانی نمی‌شود.

مبدأ canonical در `SiteSettings.seo` از پنل مدیریت با مجوز موجود `settings.brand.edit` تنظیم و audit می‌شود. ایندکس سراسری پیش‌فرض خاموش است؛ روشن‌کردن آن به مبدأ HTTPS معتبر نیاز دارد و به معنی پذیرش انتشار نیست. Sitemap فقط بازار فعال، زبان فعال و محتوای منتشرشدهٔ قابل مشاهده را فهرست می‌کند؛ صفحات حساب/سفارش/مدیریت و preview همیشه noindex هستند. نشانی کامل alternates از مبدأ تنظیم‌شده ساخته می‌شود، هرگز از Host ورودی.

این مرحله schema/migration، سیاست پول، session، موجودی یا قالب بکاپ را تغییر نمی‌دهد. `pg_dump` تنظیمات JSON را مانند قبل نگه می‌دارد؛ برای بازگشت کد، کلیدهای جدید JSON قابل چشم‌پوشی‌اند و هیچ reset لازم نیست. آزمون‌ها: بازار صریح در برابر کوکی مخالف، زبان غیرفعال، نگاشت مسیر محدود به محتوای عمومی، canonical/hreflang، غیبت محتوای خصوصی در sitemap، خاموش‌بودن پیش‌فرض و تغییر تنظیمات با مجوز/audit. JSON-LD تکمیلی، تصاویر اجتماعی پویا، تاریخچهٔ slug و consent در ادامهٔ فاز باقی‌اند.

منبع معیار URL و alternates: https://developers.google.com/search/docs/specialty/international/localized-versions


## D65 — Phase 08 customer engagement and release evidence (active)

Recorded before implementation under D50/D63, against docs v1.2. Additive PostgreSQL tables retain all existing customers, products, media, orders and financial records. No reset, inferred accounting backfill or provider change. Wishlist ownership comes from the verified customer session; guest storage contains product IDs only. Reviews require an authenticated customer, default to pending, and verified purchase is derived from paid orders on the server. Review photos use generated storage keys, stripped image metadata, existing Media/backup storage and a dedicated authorization route; pending photos are never public. Moderation uses existing `content.page.publish`, consistently with publication of customer content; release evidence uses `settings.maintenance.edit` and read access remains `system.health.view`. Both mutations are audited.

Stock alerts are opt-in subscriptions for the authenticated, email-verified customer; the existing email OTP flow verifies a guest's entered email before subscription. Notification delivery uses the existing queue and provider, checks live stock and cancellation, and has a stable idempotency key. This intentionally avoids unauthenticated email bombing. Push subscriptions are storage-only until Phase 09. Analytics default off in every market, require an explicit market-specific consent choice, and stay off on private commerce/account routes. Withdrawal reloads the document and removes known first-party tracking cookies.

Slug history targets stable entity IDs, not another historical URL; redirect resolution rechecks publication and market visibility. JSON-LD uses Decimal prices; IRT is converted exactly to ISO IRR (×10), never emitted as an unsupported currency. Reviews contribute to structured data only when approved and visible in the current locale.

Manual launch evidence is append-only, dated, versioned, scoped to an HTTPS staging/production origin and expires. Local/CI evidence never satisfies real-environment gates. Recording evidence is an attestation, not execution of the test or permission to publish. D51 and D54 remain active: no hosting/DNS changes, no personalized/offline HTML caching. Verify with migration/restore CI, ownership/visibility negative tests, consent, moderation, redirect and accessibility browser tests.

Phase 08 audit correction: manual display-price validity is evaluated at request time, and listing prices use one batched manual-price query and one effective FX lookup. This fixes stale presentation around expiry boundaries; it does not rewrite order/financial snapshots.

## D66 — Verified login return paths for customer engagement

Decision recorded before the return-path implementation: verified email login may return to the wishlist or a canonical public product/stock-alert anchor in addition to the existing checkout/payment destinations. This is a strict same-origin path allowlist, not an arbitrary redirect; authentication, OTP expiry, session validation and payment permissions are unchanged. Reject external URLs, admin/API routes, encoded separators and normalized traversal. Guest stock-alert links preserve the chosen variant through verification; subscribing still needs the customer's subsequent explicit action.

### D67 clarification — reference fidelity, 2026-09-19

The owner rejected equal-sized hero cards as a visual departure from the supplied Lovable composition. Four-department coverage means equal discoverability and real destinations, not equal image rectangles. The spatial layout uses one main campaign image, floating department planes and a three-line CMS title (plain text line breaks, middle line emphasized using a self-hosted display font). Geometry and typography roles belong to the selected layout; brand, colors, copy and imagery remain editable under D31. Existing Inter/Vazirmatn body roles remain. No additional schema migration or business-policy change.

## D68 — Reproducible MinIO client acquisition (2026-10-02)

Under D50/D63, build the existing mc release `RELEASE.2025-08-13T08-35-41Z`
from official source commit `7394ce0dd2a80935aded936b09fa12cbb3cb8096`,
authenticated by the Go module checksum database. Its previously pinned Quay
image now returns unauthorized and the Docker Hub image is unavailable. The
same source-built binary serves ops and minio-init; retain its upstream license.
This changes acquisition only: no storage/backup provider, format, data, schema,
or restore-boundary change. Verify fresh builds and Local/S3 backup/restore CI;
rollback may use a previously verified image, never an unverified mirror.

## D69 — Phase 09A CRM, consent and segment foundation (2026-10-03)

Recorded before implementation for Issue #41's explicit 09A assignment and #47–#49 backlogs. Phase 09 remains partial. No promotion, loyalty, sending, journey, redesign or later-phase implementation. The owner's direct assignment uses `phase/09a-crm-consent-segments`; technical self-review and merge follow D50/D63 after all required checks pass. Storefront and Admin design remain open for owner acceptance; prior visual experiments are not final approval.

CRM reads require explicit customer-view permission and a market on every query. Market membership is an existing preferred market or a customer-owned order/cart/wishlist/review/consent in that market; knowing a customer ID is insufficient. Notes and tags are market-specific, audited and never copy the legacy global notes field. Session tokens, receipts, bank/contact snapshots and private media are not CRM output. Customer sessions are JWT-based: report only existing activity, never invent a session history.

Marketing consent has one normalized source of truth, keyed by customer/market/channel, with append-only events and privacy-safe absence. Phase 08 analytics consent remains browser-local, purpose-specific and independent; stock alerts remain individually requested transactional notifications. The unused legacy Customer.marketingConsent JSON is retained without conversion: it has no verified channel/market/timestamp contract and must never authorize a campaign. No duplicate writer or inferred opt-in is introduced. Verified customer sessions supply actors; unsubscribe links are encrypted, purpose-bound and expiring, with confirmation POST only. No caller-supplied IP is accepted.

Privacy requests are an auditable review state machine, never automatic anonymization/deletion. Export is explicitly approved, authenticated, scoped, private/no-store and excludes secrets, internal notes and financial internals. Existing deletionRequestedAt is retained and surfaced as legacy pending evidence; no destructive migration or fulfillment claim is inferred.

Segments use a strict versioned AND rule contract compiled to parameterized SQL, bounded rules and paginated minimized previews. Stored revisions preserve definitions for future #47 scenario consumers; no arbitrary SQL, recipients or campaign execution. Monetary metrics use frozen USD order snapshots and Decimal, paid SALE orders only, excluding cancelled orders; historical CLV is gross paid lifetime value, not profit or a forecast. Refunds/returns are shown separately. RFM/churn thresholds are validated market configuration, not hard-coded business policy. Absent configuration yields unclassified metrics. Category membership uses current catalog classification, explicitly not historic snapshot classification. Counts and previews share a SQL predicate and transaction snapshot.

Additive tables/indexes only, no reset or inferred customer backfill. pg_dump includes new tables; existing archive/ops recovery boundaries stay intact. Rollback retains new consent and request history and uses compatible code. Verify market/permission/actor negatives, concurrency, consent/unsubscribe, request transitions, SQL ground truth, deterministic metrics, mobile FA/TR/EN and disposable backup/restore CI. Preview synchronization uses only the previously merged PR46 schema; 09A migrations run only in isolated test databases.

## D70 — Work/Codex review and merge governance (2026-10-03)

Owner instruction: Mehdi is the final merge authority. This decision supersedes conflicting merge/governance clauses in D34, D39, D44, D45, D47, D50, D63 and the completed D69 assignment. Earlier decisions and historical reports remain history, not current merge authorization. Technical implementation decisions within authorized scope remain delegated; product scope and release acceptance are unchanged.

- Every change uses a branch and PR, including documentation. Never commit/push directly to main, force-push shared history or bypass branch protection.
- Always create PRs as **Draft**. Mark **Ready for Review** only after implementation is complete, all intended commits are pushed, and required local checks (lint, typecheck and relevant tests) pass. Ready is not merge approval. New incomplete work returns the PR to Draft until these conditions hold again.
- **Codex must never merge its own PR**, including a PR it implemented. Mehdi is the final merge authority; technical delegation, self-review and automated checks do not authorize self-merge.
- A PR may be merged only when all four conditions hold: (1) required CI is green for the current head SHA, including the repository's required checks/docker/docker-runtime; (2) the latest **[HODASITE-AI-REVIEW]** for that same head SHA reports no blockers; (3) blocking review conversations are resolved; (4) Mehdi explicitly authorizes the merge. Missing, stale, unversioned or blocking AI review does not satisfy this gate. A new head requires fresh head-matched CI and review evidence.
- Label self-review, automated review and any actual independent human review accurately. Do not fabricate the AI review marker or treat an implementation summary as its required review. Existing sensitive-change evidence and real-environment release gates remain mandatory.

Rationale: separate implementation from final owner-controlled merge in the Work/Codex workflow. Data impact: no schema, runtime permission, financial or stored-data changes; repository governance is separate from the product privacy-review state machine. Verification: synchronize active instructions, README, index, setup/checkpoint guidance and reusable phase prompts; preserve historical reports/archives. Repository protection settings are not changed or bypassed by this documentation update.

## D71 — Phase 09B promotion rule contract (2026-10-03; implementation in progress)

Recorded before implementation under the owner's explicit instruction to start
Issue #53 after PR #52. Scope is 09B only; D70 still governs review and merge.

A separate `promotions` domain owns a strict version-1 WHEN/THEN contract,
not executable code/SQL and not negative FeeRules. Program revisions are
market/currency bound. Initial work is an offline, deterministic evaluator:
no database writes, price mutation, coupon consumption or live checkout hookup.
Ordinary business choices remain definition data, not hard-coded seasons or
customer groups. CRM membership must come from the existing market-scoped 09A
service, never a second segment engine or untrusted browser claims.

Evaluation receives an explicit UTC instant and server-derived cart/customer,
segment/consent, coupon eligibility and usage snapshots. Missing customer or
usage evidence fails closed where required. This pure function is NOT an
authorization boundary. A server adapter must check permissions and derive
identity/market before any public/admin integration. Date windows are start
inclusive/end exclusive; enabled ACTIVE/SCHEDULED revisions alone participate.
Higher numeric priority wins; equal priority uses stable ASCII ID order.
Stacking is explicit per evaluation group; either member's exclusive-group
policy or explicit exclusion blocks the later candidate. Zero-benefit candidates
do not claim a group. Outputs explain every rejected/applied revision with
machine reason codes; these must be translated in future UI, not shown raw.

Money stays Decimal with bounded decimal-string inputs, four-place precision
matching numeric(18,4), explicit same-currency validation, and no implicit FX.
Merchandise discounts operate on remaining eligible line amounts, never exceed
those amounts, and are proportionally allocated with deterministic four-place
remainders. Original item prices and eligibility subtotal are unchanged.
Free shipping discounts only the explicitly charged shipping amount, never
absorbed shipping or other fees. Buy-X-get-Y uses one selected merchandise pool,
requires X+Y units per set, and discounts the cheapest Y units already present;
it does not insert gifts or consume inventory. Spend-X-get-Y is a configured
fixed benefit per complete spend step, optionally capped. Arbitrary bundles and
gift insertion are deferred until safely specified within #53, not silently
represented as complete. Exclusions always win over inclusion selectors.

Before activating 09B, add additive schema/revisions, immutable order discount
snapshots and coupon/promotion usage evidence. Quote remains a read-only
eligibility estimate. Order creation must re-evaluate and atomically lock/check
budget and total/per-customer limits in a fixed order, with idempotent redemption
and an explicit cancellation/release policy. Stale quote evidence never grants
redemption. Define and test fee/tax basis and refund/finance allocation before
connecting discounts to checkout; do not silently alter D17/D55/D60 accounting.

Data impact of this first increment: none; no schema, migration, seed, provider,
preview or stored-order changes. Rollback removes the unused module. Later
migrations require documented data/backup/recovery and real PostgreSQL
concurrency tests plus Local/S3 restore CI. Required proof now: validation,
market/currency/customer isolation at the evaluator boundary, deterministic
stacking/allocation, exact decimal boundaries, cap evidence, no input mutation,
and unchanged existing quote tests. Full 09B acceptance additionally requires
server authorization, atomic redemption, FA/TR/EN admin/simulator and 390px
browser evidence. Initial unit proof does not establish those pending gates.

## D72 — 09B persistent promotion evidence (2026-10-03)

Recorded before the persistence increment. Program identity, market and currency
are permanent. Every edit (including lifecycle) appends an immutable revision;
optimistic version checks prevent lost updates. Limits and budgets apply across
all revisions of a program, not a fresh allowance on every edit. Coupon codes
are normalized ASCII uppercase and unique per market. Coupon terms are immutable;
only audited, version-checked lifecycle changes are allowed. Archived programs
and coupons cannot be reactivated. Business metadata and three-language public
copy remain DB-owned. Mutations require the existing `pricing.sale_price.edit`
permission in the market, a verified admin session and explicit confirmation.
Idempotency keys bind to actor, operation and exact validated request content.

The internal transaction adapter derives eligibility from stored order lines and
09A CRM membership, tags, consent and segment SQL. It accepts only an identity
already verified by its trusted checkout caller; an order contact email never
authenticates a customer. Simulator customer reads additionally require
`crm.customer.view` and `crm.segment.manage`. No public route accepts raw
membership, usage, price or discount claims. No operational checkout caller is
connected in this increment: fee/tax/refund/finance integration remains D71's
next gate. The adapter rejects an order unless its existing monetary snapshot
already agrees with the newly evaluated discount; it never edits order amounts.

Lock order is Order, Market (shared, to exclude concurrent program creation),
then all market Program rows in ascending ID order, then Coupon rows in ascending
ID order. Creation locks Market exclusively. A safety bound of 100 programs per
market matches the evaluator batch bound. Program edits/issuance also lock Program
first. Evaluate with live revision, coupon eligibility and lifetime usage under
these locks at ReadCommitted isolation; never redeem a previously computed quote.
An immutable evaluation (including zero benefit) and immutable discount records
are inserted in the same order transaction. Retry returns the stored result only
for the same verified identity and normalized coupon input. Changed input fails.
Limits include pending and paid orders. An append-only release is allowed only
for a CANCELLED, never-paid order without approved payment evidence; release is
idempotent and frees all its allowances. Paid/refunded orders retain consumption;
refunds never silently restore a coupon. Cancellation wiring remains pending.

Data impact: additive PostgreSQL tables/indexes/FKs/checks and immutable-evidence
triggers only. No existing order, amount, media, permission grant or seed data is
rewritten. Whole-database pg_dump includes the new tables. Restore uses existing
ops/maintenance/safety-backup flow and matching migrations. Rollback uses
compatible code retaining revision/redemption/release history; never DROP/reset
to downgrade. Validate migrations on an isolated `_test` database, permission and
market negatives, stale edits, retry/rollback, real concurrent cap/budget claims,
release guards and direct SQL immutability. Local/S3 restore CI remains mandatory
before Ready. This increment does not complete 09B or authorize deployment/merge.

## D73 — 09B checkout, tax and discount allocation (2026-10-03)

Recorded before commerce integration. Gross item prices/subtotal remain intact.
Quote first computes ordinary D17 fees, evaluates promotions against gross
merchandise and charged shipping, then recomputes TAX using net merchandise and
net taxable charged shipping. Shipping/customs/service selection and bases remain
as configured against gross merchandise, avoiding circular shipping thresholds.
Absorbed shipping cannot be discounted. Fixed/per-item/weight taxes keep their
configured method; percentage/value-bracket taxes use the net merchandise base.
No country-specific rate or legal assumption is introduced: actual tax/fee
configuration still requires the existing pre-release owner/accountant gate.
Order total = gross subtotal + final charged fees - explicit discount total.
No extra rounding to display-price endings is applied after discount allocation.

Checkout re-quotes with server prices and verified session identity, locks market,
programs and coupons at ReadCommitted, and checks the customer's confirmed total.
Coupon strings persist in cart checkout JSON with cart revision locking; address
and shipping updates preserve them, market changes clear them. No browser prices,
audiences or discount evidence are accepted. Public estimates expose applied
public-copy lines only, never rejected rules, CRM evidence or coupon internals.
The cart lock precedes promotion locks for new order creation; the new Order has
no competing owner. Existing-order operations lock Order before promotion rows,
and promotion locks precede inventory/credit locks in cancellation and checkout.
Immutable D72 evaluation/redemptions commit with order, inventory and payment;
any mismatch rolls back everything. Unpaid cancellation/expiry releases capacity
before inventory locks. Paid/refunded orders never release usage.

Return budgets use exact saved merchandise allocations per variant, including
zero-value gifts already in the basket. Shipping discounts do not reduce the
returnable merchandise budget. D55's existing non-refundable fee/tax policy is
unchanged; split returns preserve the final four-decimal remainder. Legacy orders
without promotion evidence keep the existing proportional-discount behavior.
Ledger sales = subtotal minus merchandise discounts; shipping income = charged
shipping minus shipping discounts. Sales attribution uses saved net item weights.
All three monetary roles still use the order FX snapshot. Invoice revisions copy
immutable discount titles/amounts, never live rules. Zero-due discounted orders
follow the existing zero-due fulfillment path, including finance validation.

Data impact: no new schema or historic-order rewrite. D72 tables already preserve
the allocation/copy evidence; cart JSON and new-order snapshots carry new data.
Rollback after accepting discounted orders must retain the allocation-aware
returns/finance readers; do not roll back to code that treats shipping discounts
as merchandise discounts. Backup format/ops boundary unchanged. Required proof:
checkout cap race and stale-total rollback, retry, cancellation, guest isolation,
net tax, zero-due, scoped allocations/partial returns, balanced finance, immutable
invoice in three locales, and no-promotion regression. No deployment/Preview
mutation; 09B stays Draft while the admin interface and final gates remain open.

D73 integration details: commerce consumes narrow server facades, keeping the
pure evaluator DB-free and admin authentication out of ordinary quote imports.
The existing CRM membership predicate is shared unchanged. A verified self-checkout
may evaluate its own identity before a first market purchase; admin simulation
still requires existing membership, and all CRM queries remain market-scoped.
Final checkout uses the validated page locale (including a language switch) for
both evaluation and order/invoice snapshots. Fee passes share one quote instant.
