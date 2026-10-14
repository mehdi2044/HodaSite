# دستور آماده برای Codex روی Windows — preview با حفظ داده

این متن را در Codex روی همان Windows دارای Docker فروشگاه اجرا کنید. cloud به آن کامپیوتر اتصال ندارد؛ VPN/TCP grant/سرور مقصد تنظیم نشده است. مالک اجرای نسخهٔ تازه روی همان کامپیوتر را فعلاً کافی دانسته؛ بخش آنلاین R0 تا فراهم‌شدن زیرساخت BLOCKED_ENV می‌ماند.

## فرمان قابل کپی

> در مخزن mehdi2044/HodaSite روی همین Windows، دستور نسخهٔ ۲ Issue62 و این فایل را اجرا کن. هدف پیش‌فرض R0 در PR67، branch `phase/design-01-r0-live-preview` است. اگر مالک PR مرحلهٔ تازه‌تری را در همین گفتگو برای مشاهده تعیین کرده، هدف همان مرحله باشد. metadata زندهٔ PR، full head SHA و CI/review آن را بخوان و **همان SHA را pin کن**؛ از شمارهٔ PR یا HEAD checkout، نسخهٔ runtime را حدس نزن. هیچ PR را merge نکن و روی main چیزی ننویس. داده/تنظیمات موجود حفظ شوند. اطلاعات خصوصی را در GitHub چاپ نکن.
>
> **شناسایی قبل از هر تغییر:** AGENTS.md، current-policy، اسناد setup/backup و گزارش مرحله را بخوان. checkout، `git status --short --branch`، worktreeها، `docker compose ls`، label پروژهٔ container و فایل‌های واقعی Compose/override را بررسی کن. نام پروژه، مسیر، پورت و نسخهٔ app/ops/postgres/cron را از واقعیت تعیین کن، نه پیش‌فرض hodapreview/3000. env و inspect حاوی credential را dump نکن.
>
> **حفظ کار مالک:** تغییرات محلی/untracked، `.env`، AUTH_SECRET، رمز، media و volume موجود باقی بمانند. clean/reset/checkout اجباری، stash مخفی، down -v، prune، seed عمومی و restore روی DB موجود ممنوع. checkout کثیف: worktree/checkout جدا برای ساخت artifact؛ پروژه و volume فعلی خودکار به نام تازه جابه‌جا نشوند. override استقرار محلی خارج git باشد و محیط واقعی را با .env.example جایگزین نکن.
>
> **preflight و recovery:** image/کد runtime قبلی و روش شروع مجددش را ثبت و نگه دار. diff runtime تا SHA هدف برای migrations/schema، package/lockfile، Docker/Compose، storage و AUTH_SECRET بررسی شود. `scripts/update-preview.ps1` در مبنای R0 از main وجود ندارد و در PR60 جداست؛ تنها اگر واقعاً موجود و compatibility دقیقاً برقرار است استفاده کن. guard baseline58bef4e را حذف نکن یا dependency تازهٔ R1 را به زور با updater قدیمی اجرا نکن. ابتدا path ارتقای محدود با build/rollback مناسب را آماده کن.
>
> **backup الزامی پیش از cutover:** در ops همان پروژه backup تازهٔ DB+media و verify واقعی آن تا scratch DB مستقل، با scripts/backup همان نسخه اجرا کن. وجود ZIP کافی نیست؛ checksum، DB و Media verification و exit موفق لازم‌اند. backup خصوصی و image قبلی برای recovery نگه داشته شوند. اگر ops/backup/verify/محل امن یا runtime شناسایی نشد، اقدام وابسته BLOCKED_ENV؛ سرویس را stop نکن و آماده‌سازی مستقل build/runbook را تمام کن.
>
> **ساخت قبل از توقف نسخهٔ سالم:** SHA هدف در checkout تمیز، frozen pnpm از packageManager، Prisma generate، lint/typecheck و build بررسی شود؛ image app و ops سازگار پیش از جایگزینی ساخته شوند. Docker build با `--build-arg HODASITE_BUILD_SHA=<full pinned SHA>` و runtime preview با `HODASITE_PREVIEW=1`؛ مقدار SHA از مرحلهٔ شناسایی است، placeholder را کور اجرا نکن. build ناموفق نسخهٔ سالم را عوض نکند. credential وارد commit/خروجی عمومی نشود.
>
> **داده و استقرار:** R0/R1 migration schema ندارند. مرحلهٔ دارای migration، scratch migrate/restore و اثر داده/rollback PR آن را لازم دارد؛ forward migration فقط مطابق ops/backup/maintenance جاری. seed/reset/rewrite تاریخچه ممنوع. default تازهٔ MODA4 برای DB تازه است؛ نام/رنگ فروشگاه موجود از پنل و با انتخاب مالک تغییر کند. artifact با همان پروژه/volume/env و override بررسی‌شده راه بیفتد، cron/ops قبلاً فعال سالم بمانند. maintenance/drain در صورت نیاز همان handshake موجود؛ rollback کد سازگار با داده/ledger، نه restore روی DB جاری یا حذف رکوردهای جدید.
>
> **مشاهده روی همین Windows:** نشانی واقعی فروشگاه و `/admin/login` همان app/DB را از پورت یا proxy مشاهده‌شده بده؛ localhost همین کامپیوتر قابل قبول است، localhost cloud نیست. fa/tr/en، media و health app/ops/cron بررسی شوند. ورود password+MFA واقعی را به مالک بده؛ MFA خاموش/بازنویسی نشود، recovery code جدید نساز، session/token عمومی نشود. تا ورود مالک رخ نداده NOT_VERIFIED ثبت کن؛ کارهای مستقل ادامه یابند.
>
> **آزمون R0:** پس از ورود مدیر دارای system.health.view، SHA/UTC/revision نوار با artifact برابر باشد. فروشگاه و پنل برند در دو برگه؛ نام/tagline آزمایشی با انتخاب مالک از فرم تغییر/ذخیره؛ فروشگاه باز بدون reload دستی تازه و reload پنل مقدار را حفظ کند. مقدار اولیه یادداشت و پس از آزمون از همان فرم برگردد؛ دادهٔ دیگر تغییر نکند. R1: نقش فونت/رنگ/دکمه از Theme، preview قبل از save، سپس save/reload/فروشگاه در سه زبان بررسی و مقادیر اولیه از فرم بازگردند. تست concurrency/destructive فقط scratch، نه preview نگه‌داری‌شده.
>
> **گزارش Issue62:** مرحله، branch و full SHA واقعی runtime، build UTC، revision، local/CI/not verified و backup/verify ثبت شوند. نشانی محلی را خصوصی به مالک بده؛ ایمیل/مسیر/credential/IP یا عکس خصوصی در Issue عمومی نباشد. محدودیت online R0، دستگاه واقعی و gateهای باز حفظ شوند. هیچ merge/APPROVE/force push/main push، provider/پرداخت/ایمیل/AI تولیدی یا paid call انجام نده.

## معنی آماده‌بودن

این دستور اجرای Windows را از راه دور انجام نداده است. «راهنما آماده» با «کامپیوتر مالک ارتقا یافت» متفاوت است. نسخهٔ قابل مشاهده باید همان SHA artifact باشد؛ checkout dirty را deploy تازه معرفی نکنید. Codex محلی بعد از اجرای واقعی، شواهد و محدودیت‌ها را ثبت کند.
