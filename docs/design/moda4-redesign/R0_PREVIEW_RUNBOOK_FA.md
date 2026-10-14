# R0 — پیش‌نمایش واقعی و محدودیت فعلی محیط

وضعیت: **BLOCKED_ENV برای URL ثابت و ورود مالک**. محیط Codex فقط اجرای داخلی دارد؛ ابزار ingress/ارائهٔ پورت، اتصال staging یا هویت سرور فراهم نیست. هیچ نشانی اینترنتی ساخته یا استقرار انجام نشده است. `127.0.0.1` این محیط نشانی قابل مشاهدهٔ مالک نیست. پاسخ HTTP موفق محلی هم اثبات ورود مالک نیست.

مالک اجرای نسخهٔ تازه روی Windows/Docker موجود را فعلاً کافی دانسته است. اتصال به آن کامپیوتر در این cloud موجود نیست. [دستور آماده برای Codex محلی](LOCAL_CODEX_PROMPT_FA.md) preflight، backup/verify، ساخت قبل از cutover و حفظ داده/تنظیمات را مشخص می‌کند؛ اجرای محلی هنوز NOT_VERIFIED است.

## مبنا و وابستگی

شاخه `phase/design-01-r0-live-preview` از اسناد PR66، مبنا `5a6ed9c7f6cac3b4e5c173eb5cddaf2cad5824ba`؛ ترتیب PR65 → PR66 → R0. هیچ‌کدام خودکار ادغام نمی‌شوند. PR60 در `3242540dd13885b61aac6bf42840f526fda3513b` جدا و merge‌نشده است؛ اصلاحات آن روی main/این شاخه فرض نشده‌اند. PR64 مرجع طرح جاری نیست.

## خروج آمادهٔ کد

- برنامه همان Next.js/PostgreSQL با ورود واقعی password+MFA است؛ backend یا نمونهٔ HTML موازی نداریم.
- `HODASITE_PREVIEW=1` نوار نسخه را فقط به مدیر واردشدهٔ دارای `system.health.view` نشان می‌دهد. پیش‌فرض خاموش؛ نوار وارد تجربهٔ مشتری تولیدی نمی‌شود.
- `HODASITE_BUILD_SHA` **هنگام build** باید SHA کامل نسخه باشد؛ زمان build در همان خروج کامپایل می‌شود. اگر SHA فراهم نیست، صادقانه `unknown` نمایش می‌دهد. Docker از `--build-arg HODASITE_BUILD_SHA=<full-sha>` استفاده می‌کند. HMR توسعه را build موفق staging معرفی نکنید.
- revision از زمان آخرین تغییر و تعداد رکوردهای SiteSettings/ThemeSettings/Homepage ساخته می‌شود؛ محتوای این رکوردها یا credential از API منتشر نمی‌شود. endpoint احراز‌شده و مجوزمحور، `private/no-store/noindex` است.
- برگهٔ باز فروشگاهِ همان مدیر هر ۲ ثانیه revision را می‌خواند و پس از تغییر، server components را تازه می‌کند. tab مخفی متوقف، focus فوری؛ درخواست لغوشده/قدیمی نتیجهٔ تازه را بازنویسی نمی‌کند. فرم ویرایش ادمین خودکار refresh نمی‌شود تا draft از دست نرود.
- این پایه، چرخهٔ brand/theme/homepage ذخیره‌شده را می‌سنجد. draft/schedule/history و refresh قیمت صحنه در R3 هستند؛ R0 آنها را تکمیل‌شده نمی‌نامد.

## آماده‌سازی محیط در دسترس مالک

تنها اطلاعات لازم: مقصد **محیط آزمایشی موجود**، روش اتصال مجاز در Codex، و روش ارائهٔ نشانی HTTPS ثابت یا دسترسی خصوصی مالک. credential را در Issue عمومی ننویسید؛ از اتصال/secret ابزار محیط استفاده کنید. خرید میزبان یا تغییر provider در این تحویل مجاز نشده است.

در محیط انتخاب‌شده، checkout و پروژهٔ Compose جدا، DB/volume/media آزمایشی مستقل و SMTP آزمایشی آماده کنید. `docker-compose.dev.yml` فقط برای شبکهٔ توسعهٔ مورد اعتماد است؛ پورت دیتابیس آن را عمومی نکنید. `.env.example` را محلی تنظیم کنید، رمز نمونهٔ عمومی را پیش از دسترسی بیرونی با رمز یکتا عوض کنید؛ AUTH_SECRET و دیگر secretها خارج مخزن بمانند. ایمیل/پرداخت/AI تولیدی به preview وصل نشوند. startup seed نمی‌کند.

1. checkout تازه همین شاخه، `corepack pnpm install --frozen-lockfile` و `corepack pnpm prisma generate`.
2. فقط پس از احراز اینکه DB و media **تازه و اختصاصی آزمایش** هستند: `corepack pnpm prisma migrate deploy`، سپس `corepack pnpm prisma db seed` با محیط آزمایشی و رمز یکتای محلی. روی DB مالک/preview نگه‌داری‌شده seed/reset اجرا نکنید.
3. در shell همان محیط، `HODASITE_PREVIEW=1` و `HODASITE_BUILD_SHA` برابر خروجی `git rev-parse HEAD` تنظیم شوند. checkout باید پاک باشد؛ نسخهٔ dirty را همان commit معرفی نکنید. `corepack pnpm build`؛ پس از موفقیت، خروج standalone را همراه `.next/static` و `public` مانند Dockerfile اجرا کنید؛ یا برای HMR محیط dev روشن باشد.
4. فقط با reverse proxy/دسترسی خصوصی موجود و مجاز، فروشگاه و `/admin/login` **همان app** را ارائه کنید. پس از ورود و MFA، نوار SHA/زمان/revision را ببینید. نشانی و روش دسترسی خصوصی را به مالک بدهید؛ token ورود عمومی نکنید.
5. هم‌زمان فروشگاه فارسی باز بماند؛ در پنل نام آزمایشی را تغییر و ذخیره کنید. بدون reload دستی، عنوان صفحه باید تازه شود؛ reload پنل باید نام ذخیره‌شده را حفظ کند. نوار revision و زمان تأخیر را ثبت کنید. برای title/image/price صحنه، walkthrough نهایی R3 جدا لازم است.
6. برای کد تازه، build/deploy موفق نسخهٔ جدید و SHA نوار را تطبیق دهید. build شکست‌خورده اجازهٔ جایگزینی نسخهٔ سالم ندارد. این PR deploy pipeline ارائه نمی‌کند.
7. برای توقف، فقط app/cron/ops پروژهٔ آزمایشی مشخص را متوقف کنید؛ volumeها حفظ شوند. `down -v`، restore روی DB مالک یا توقف سراسری Docker ممنوع است. شروع مجدد همان پروژه/secret/volume را استفاده کند.

## شواهد و پذیرش

شواهد local/CI در PROGRESS و PR جدا ثبت می‌شوند. آزمون `tests/e2e/preview-runtime.spec.ts` با backend و MFA واقعی، تغییر نام → save → صفحهٔ ازقبل‌باز → reload پنل و منع anonymous را بررسی می‌کند. UI قدیمی قبل از R1 ظاهر MODA4 نهایی نیست. URL مالک، ورود واقعی مالک، HTTPS/گوشی‌ها و زمان deploy هنوز **آزموده‌نشده** هستند؛ تا شواهد آنها R0 آماده اعلام نشود.
