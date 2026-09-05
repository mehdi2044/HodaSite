# نقشهٔ راه اجرایی — ۱۲ فاز، ۵ Checkpoint (v1.1)

اصل: **هستهٔ فروش را کامل و درست می‌سازیم، بعد لایه‌های رشد و AI.** هر فاز خروجی قابل دیدن دارد. تست دستی مهدی فقط در Checkpointها.

```
 Phase 00  Foundation (زیرساخت، Docker، دیتابیس، ادمین خام، بکاپ v1)
 Phase 01a Markets + Site Settings + Theme + Maintenance mode + typed ForbiddenError
 Phase 01b Media Library (آپلود، WebP/AVIF، responsive sizes، صف media-optimize، retry)
 Phase 01c CMS & Storefront Design (منوها، Pages، Homepage Builder، Translation Editor)  ← «همه‌چیز از ادمین»
 Phase 02  Catalog (محصول/Variant/رنگ/سایز/عکس/راهنمای سایز) + ویترین + جست‌وجو
 ─────────────── CHECKPOINT 1: فروشگاه قابل مرور ───────────────
 Phase 03  Pricing + FX (frankfurter + Navasan + manual) + Fees Engine + Inventory + Lot/Cost model
 Phase 04  Cart + ورود بدون رمز + Checkout + Order + پرداخت آفلاین/فیش + ایمیل‌ها + مدل دادهٔ مرجوعی
 Phase 05  Shipping Workflow + رهگیری + فاکتور PDF + مرجوعی/تعویض + RBAC + Audit + Backup/Restore (ops) + Health
 ─────────────── CHECKPOINT 2: سفارش واقعی سر تا ته ───────────────
 Phase 06  Finance Core: PO، Landed Cost، COGS، Ledger، هزینه‌ها، شرکا، حاشیه سود، هشدارها
 Phase 07  AI Gateway + AI Data Entry Assistant (توضیح/SEO/ترجمه با تأیید انسانی)
 Phase 08  SEO فنی + PWA + Performance + Wishlist + نقد ساده + Accessibility + Launch Checklist
 ─────────────── CHECKPOINT 3: آمادهٔ لانچ (Soft Launch) ───────────────
 Phase 09  CRM 360 + Segments + Promotion/Coupon Engine + Loyalty + Campaigns + Consent + نقد کامل
 Phase 10  AI Shopping Agent (متنی، Tool Calling، grounded) + جست‌وجوی معنایی + Recommendation
 ─────────────── CHECKPOINT 4: موتور رشد ───────────────
 Phase 11  Visual Search + Smart Size + Voice + Virtual Try-On (POC) + Native wrapper (Capacitor)
 ─────────────── CHECKPOINT 5: نوآوری ───────────────
```

## جدول فازها

| فاز | نام | خروجی قابل دیدن | تخمین کار Claude Code* |
|---|---|---|---|
| 00 | Foundation | پروژه بالا می‌آید، ادمین لاگین می‌شود، دیتابیس و بکاپ کار می‌کند، CI سبز | ۱–۲ روز |
| 01a | Markets, Settings, Theme | بازارها، تنظیمات سایت، Maintenance mode ادمین، تم + Live Preview، خطای مجوز typed (`ForbiddenError` به‌جای `Error("FORBIDDEN")`) با نمایش i18n در UI | ۱–۲ روز |
| 01b | Media Library | آپلود/کتابخانه، پردازش WebP/AVIF، اندازه‌های responsive، صف `media-optimize`، retry، وضعیت Processing، تست‌های امنیتی | ۱ روز |
| 01c | CMS & Storefront Design | منوها، Pages/بلوک‌ها، Homepage Builder، Translation Editor، Notification Templates، طراحی نهایی 390px | ۱–۲ روز |
| 02 | Catalog & Storefront | صفحهٔ اصلی، دسته‌ها، صفحهٔ محصول با رنگ/سایز، جست‌وجو، سه زبان، موبایل | ۳–۴ روز |
| 03 | Pricing/FX/Fees/Inventory/Lot | قیمت‌ها به تومان/لیر/دلار کانادا (Navasan + frankfurter)، قوانین هزینه، شبیه‌ساز، موجودی با Lot و قیمت خرید | ۳ روز |
| 04 | Cart→Checkout→Payment | خرید واقعی با فیش، تأیید ادمین، ایمیل‌ها، رزرو کوتاه + مهلت پرداخت | ۳–۴ روز |
| 05 | Shipping/Returns/RBAC/Backup | مسیر ارسال چندمرحله‌ای، رهگیری، فاکتور، مرجوعی/تعویض، نقش‌ها، Audit، بکاپ/ریستور با ops | ۴ روز |
| 06 | Finance Core | PO، Landed Cost، COGS، Ledger، هزینه‌ها، شرکا، داشبورد سود، هشدار فروش زیر قیمت | ۳–۴ روز |
| 07 | AI Data Entry | دکمهٔ «تولید با AI» در فرم محصول + ترجمهٔ خودکار با تأیید | ۱–۲ روز |
| 08 | SEO/PWA/Perf | نصب روی گوشی، hreflang، sitemap، سرعت، wishlist، Launch Checklist | ۲–۳ روز |
| 09 | CRM/Loyalty/Promo | بخش‌بندی مشتری، کوپن/کمپین، امتیاز، رضایت بازاریابی | ۴ روز |
| 10 | AI Shopping Agent | چت خرید سه‌زبانه با داده واقعی، افزودن به سبد با تأیید | ۳–۴ روز |
| 11 | Visual/Voice/Try-On/App | جست‌وجو با عکس، پیشنهاد سایز، صدا، پرو مجازی آزمایشی، بستهٔ اپ | ۵+ روز |

*تخمین برای Claude Code به‌علاوهٔ زمان بازبینی. واقعیت معمولاً ۱.۵ برابر است.

## Checkpointها (تست دستی مهدی)

| Checkpoint | بعد از فاز | چه چیزی را تست می‌کنید | چک‌لیست |
|---|---|---|---|
| CP1 | 02 | ورود به ادمین، تغییر اسم/لوگو/رنگ، ساخت محصول با رنگ/سایز، دیدن سایت در سه زبان روی گوشی | `08_TEST_CHECKPOINTS_FA.md §CP1` |
| CP2 | 05 | خرید کامل از سه بازار، آپلود فیش، تأیید، ارسال چندمرحله‌ای، فاکتور، بکاپ/ریستور | §CP2 |
| CP3 | 08 | داشبورد سود/هزینه، AI تولید توضیح، نصب PWA، SEO، سرعت، Launch Checklist (Off-site backup ✔، Iran reachability ✔) | §CP3 |
| CP4 | 10 | کوپن/کمپین/امتیاز، چت خرید | §CP4 |
| CP5 | 11 | جست‌وجوی تصویری، Try-On، اپ | §CP5 |

## قاعدهٔ توقف
اگر در یک Checkpoint بیش از ۳ باگ «مسدودکننده» (نمی‌شود خرید کرد / داده گم می‌شود / پول اشتباه) پیدا شد، فاز بعد شروع نمی‌شود تا رفع شوند.

## ترتیب پیشنهادی سرور
- فاز 00: فقط لپ‌تاپ (Docker).
- قبل از CP1: سرور staging راه بیفتد (راهنما در `07_SETUP_GUIDE_FA.md`).
- بعد از CP2: دامنهٔ اصلی + production.
- بعد از CP3: Soft launch با محصولات واقعی — فقط اگر Launch Checklist کامل باشد: Off-site backup مستقل فعال و verify شده، Test Matrix دسترسی از ایران/ترکیه/کانادا سبز، Restore drill یک‌بار روی staging انجام شده.
