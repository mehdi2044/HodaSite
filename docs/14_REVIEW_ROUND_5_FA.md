# بازبینی دور پنجم — هفت پیشنهاد وی‌بانو (v1.2)

تاریخ: ۲ سپتامبر ۲۰۲۶ · بازبین: وی‌بانو · پاسخ: پیکسل

هر هفت پیشنهاد پذیرفته و اعمال شد. هیچ‌کدام Feature جدید نیستند؛ همه «سفت‌کردن» چیزهایی هستند که قبلاً به‌صورت کلی گفته شده بود. Foundation با این نسخه بسته می‌شود.

| # | پیشنهاد وی‌بانو | اعمال |
|---|---|---|
| V-1 | Money & FX Test Gate صریح | **فاز ۰۰** یک Gate مسدودکننده می‌گیرد: `Money` فقط Decimal (قانون lint + تست، محاسبات `number` روی پول در ماژول‌های مالی ممنوع)، Rounding به‌صورت داده‌محور و تست‌شده برای هر ارز (تومان → گرد ۱۰۰۰، TRY/CAD → دو رقم، Ending اختیاری)، جمع‌کردن دو ارز مختلف Exception می‌دهد، و **تست تغییرناپذیری Snapshot نرخ**. فاز ۰۳ همان فایل را با یک سفارش واقعی گسترش می‌دهد؛ هیچ فازی حق حذف Case ندارد | phase-00 §13، phase-03 §1 |
| V-2 | قانون BiDi برای قطعات لاتین | کامپوننت مشترک `<Iso>` (رندر `<bdi dir="ltr">`) **اجباری** برای SKU، بارکد، شمارهٔ سفارش/فاکتور، IBAN/شبا/کارت، رهگیری، ایمیل، URL، نام فایل، کد کوپن، شناسهٔ تراکنش. CSS فقط properties منطقی. تست Playwright با snapshot ترتیب کاراکترها | `06_ADMIN_AND_DESIGN.md` §B |
| V-3 | Fees داده‌محور بدون Deploy | صریح شد: افزودن/تغییر/خاموش‌کردن قانون هزینه **هرگز** Deploy یا Migration نمی‌خواهد؛ فقط رکورد. روش‌های محاسبه مجموعه‌ای ثابت در کد است و روش جدید = ADR | D17، phase-03 §4 |
| V-4 | ماتریس RBAC با فراخوانی مستقیم API | تست تولیدشده روی حاصل‌ضرب **Subject × Action × Scope** (همهٔ نقش‌ها + کاربر با Override + کاربر ناشناس) × همهٔ Permissionها × منبع داخل/خارج Scope. هر Case **دو بار** بررسی می‌شود: از UI و با فراخوانی مستقیم Endpoint/Server Action با payload دستکاری‌شده. سیاست 403/404 مستند. Permission جدید بدون ردیف ماتریس = CI قرمز | phase-05 §6 |
| V-5 | Image pipeline صف‌آماده ولی بدون BullMQ | آپلود فوری برمی‌گردد با وضعیت `PROCESSING`؛ پردازش در Job صف‌دار Postgres پشت Interface `ImageProcessingQueue`. Redis/BullMQ اضافه نمی‌شود تا وقتی واقعاً وارد معماری شود؛ عوض‌کردن Driver نباید Call Siteها را تغییر دهد | phase-01 §4، D21 |
| V-6 | جملهٔ سیاست AI عیناً ثبت شود | در D25 و AGENTS و فاز ۱۰ به‌صورت verbatim: *No direct database writes; all mutations through authorized tools; checkout/payment/refund/discount require explicit confirmation and permission.* هر ابزار AI از `assertCan()` با هویت کاربر عبور می‌کند | D25، AGENTS، phase-10 |
| V-7 | QUARANTINE و DAMAGED از ابتدا در Schema | از فاز ۰۴ در Migration: enum `ReturnedItemCondition`، ستون‌های `StockItem.quarantinedQty` و `damagedQty`، و انواع حرکت `RETURN_RESTOCK / RETURN_QUARANTINE / RETURN_DAMAGED`. فقط RESTOCK موجودی قابل فروش را زیاد می‌کند | phase-04 §7b، DB doc |

## وضعیت
- **Architecture baseline: v1.2** — بسته شد. مخزن: `mehdi2044/HodaSite`.
- از این‌جا به بعد هر تغییر در اسناد پایه فقط با ADR.
