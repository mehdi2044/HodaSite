# راهنمای نصب و راه‌اندازی (برای مهدی — بدون نیاز به برنامه‌نویسی)

این راهنما در چهار بخش است:
A) گیت‌هاب و Codex، B) اجرا روی لپ‌تاپ، C) اجرا روی سرور، D) کارهای روزمره (بکاپ، به‌روزرسانی).
مکس موظف است هر وقت مرحله‌ای عوض شد، همین فایل را به‌روز کند.

---

## A) گیت‌هاب و Codex (یک‌بار برای همیشه — حدود ۱۵ دقیقه)

### A1. آپلود بسته در مخزن (مخزن ساخته شده: `mehdi2044/HodaSite`)
1. وارد https://github.com/mehdi2044/HodaSite شوید.
2. **Add file → Upload files**.
3. فایل zip را روی کامپیوترتان **باز (Extract)** کنید. سپس **محتویات داخل پوشهٔ `fashion-commerce`** را (نه خود پوشه را) انتخاب کنید: `README.md`، `AGENTS.md`، `.env.example`، `.gitignore`، پوشهٔ `docs`، پوشهٔ `scripts`. همه را با هم بکشید و در صفحه رها کنید.
   - نکته: فایل `README.md` فعلی مخزن جایگزین می‌شود؛ اشکالی ندارد.
   - نکته: فایل‌هایی که با نقطه شروع می‌شوند (`.env.example`, `.gitignore`) گاهی در Finder/Explorer مخفی‌اند؛ در مک با `Cmd+Shift+.` و در ویندوز از View → Hidden items نمایششان دهید.
4. پایین صفحه در کادر پیام بنویسید `docs: foundation v1.2` و **Commit changes**.
5. فایل‌های اصلی سند مادر (`Fashion_Commerce_Master_Spec_FA.docx` و `HodaSaite1.pdf`) را داخل پوشهٔ `docs/spec/` آپلود کنید (اول وارد `docs/spec` شوید، بعد Add file → Upload files).
6. اگر مخزن را Private می‌خواهید: Settings → General → پایین صفحه → Change visibility.

> اگر آپلود پوشه‌ای در مرورگر اذیت کرد، **GitHub Desktop** را نصب کنید: Clone `mehdi2044/HodaSite` → فایل‌ها را داخل پوشهٔ محلی کپی کنید → Commit → Push.

> نکته: اگر آپلود پوشه‌ای در مرورگر کار نکرد، از **GitHub Desktop** (برنامهٔ رایگان) استفاده کنید: File → Add local repository → پوشه را انتخاب → Publish.

### A2. اتصال Codex به مخزن
1. وارد Codex شوید (chatgpt.com/codex یا از داخل ChatGPT).
2. **Connect GitHub** → اجازه به مخزن `mehdi2044/HodaSite`.
3. یک Environment برای مخزن بسازید. در تنظیمات Environment:
   - Setup script:
     ```bash
     corepack enable && corepack prepare pnpm@latest --activate
     pnpm install --frozen-lockfile || true
     ```
   - Node: 20
   - اینترنت: روشن (برای نصب پکیج‌ها).
4. تمام. از این به بعد برای هر فاز، متن `docs/prompts/phase-XX.md` را در Codex پیست می‌کنید. Codex خودش `AGENTS.md` را می‌خواند.

### A3. چرخهٔ هر فاز
1. متن prompt فاز را به Codex بدهید.
2. مکس یک **Pull Request** می‌سازد. لینک PR و خلاصهٔ گزارش را اول برای پیکسل و بعد برای وی‌بانو بفرستید تا بازبینی کنند.
3. اگر هر دو گفتند خوب است: در گیت‌هاب روی PR دکمهٔ **Merge pull request** → **Confirm merge**.
4. اگر ایراد داشت: متن اصلاحیه را به همان گفت‌وگوی مکس بدهید. اگر پیکسل و وی‌بانو اختلاف داشتند، شما تصمیم می‌گیرید.

### A4. محافظت از شاخهٔ `main` (مهم — یک بار بخوانید)

روی گیت‌هاب با **پلن رایگان و مخزن خصوصی**، خودِ گیت‌هاب جلوی push مستقیم روی `main` را **نمی‌گیرد**. این را بررسی کردیم: چه با قانون کلاسیک و چه با ruleset، همان پیام «فعال نیست» را نشان می‌دهد. پس چیزی که از `main` محافظت می‌کند، خودِ روشِ کار است:

۱. هر تغییر → یک شاخهٔ جدا → یک Pull Request (حتی یک خط اصلاح در مستندات).
۲. دو بازبینی: اول پیکسل، بعد وی‌بانو.
۳. دکمهٔ Merge را فقط شما (مالک) و فقط بعد از تأیید هر دو می‌زنید.
۴. کسی PR خودش را merge نمی‌کند؛ وقتی تست‌های CI قرمز یا در حال اجرا هستند درخواست بازبینی داده نمی‌شود.

اگر روزی مخزن public شود یا به پلن پولی بروید، همان ruleset که الان ساخته شده **خودبه‌خود فعال می‌شود** و کار اضافه‌ای ندارد.

---

## B) اجرا روی لپ‌تاپ (برای دیدن سایت قبل از سرور)

### B1. نصب ابزارها (یک‌بار)
1. **Docker Desktop**: از docker.com دانلود و نصب کنید. بعد از نصب باید در نوار وضعیت آیکون نهنگ سبز باشد.
2. **Git**: از git-scm.com (ویندوز) نصب کنید؛ روی مک از قبل هست.
3. (اختیاری) **VS Code** برای دیدن فایل‌ها.

### B2. گرفتن کد
در Terminal (مک) یا PowerShell (ویندوز):
```bash
git clone https://github.com/mehdi2044/HodaSite.git
cd HodaSite
```

### B3. تنظیمات محیط
```bash
cp .env.example .env
```
فایل `.env` را با یک ویرایشگر باز کنید. برای لپ‌تاپ **هیچ چیزی لازم نیست عوض کنید** (مقدارهای پیش‌فرض کار می‌کنند). فقط این دو خط را نگاه کنید:
```
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=ChangeMe123!
```
اینها ایمیل و رمز اولین ادمین هستند؛ می‌توانید عوض کنید.

### B4. اجرا
```bash
docker compose -f docker-compose.dev.yml up --build
```
اولین بار ۵–۱۰ دقیقه طول می‌کشد (پکیج‌ها دانلود می‌شوند). وقتی خط `✓ Ready` را دیدید:
- فروشگاه: http://localhost:3000
- ادمین: http://localhost:3000/admin
- فایل‌ها (MinIO): http://localhost:9001 (کاربر/رمز در `.env`)

توقف: `Ctrl + C`. حذف کامل و شروع از صفر (داده‌های تست پاک می‌شود):
```bash
docker compose -f docker-compose.dev.yml down -v
```

### B5. به‌روزرسانی بعد از merge هر فاز
```bash
git pull
docker compose -f docker-compose.dev.yml up --build
```

### B6. اجرای محلی روی ویندوز

این بخش دقیقاً همان دستورهایی است که روی لپ‌تاپ ویندوزی مهدی اجرا می‌شود (PowerShell). Docker Desktop باید نصب و روشن باشد (آیکون نهنگ در نوار وضعیت).

**روشن کردن سایت (بار اول یا بعد از تغییر کد):**
```powershell
docker compose -f docker-compose.dev.yml up --build
```
بار اول ۵–۱۰ دقیقه طول می‌کشد. وقتی خط `✓ Ready` را دیدید، سایت روی http://localhost:3000/fa بالاست.

**روشن کردن سریع (بدون تغییر کد، از دفعهٔ قبل):**
```powershell
docker compose -f docker-compose.dev.yml up -d
```

**خاموش کردن (دادهٔ آزمایشی حفظ می‌شود):**
```powershell
docker compose -f docker-compose.dev.yml stop
```

**پاک‌کردن کامل و شروع از صفر (دادهٔ آزمایشی پاک می‌شود):**
```powershell
docker compose -f docker-compose.dev.yml down -v
```

**دیدن لاگ‌ها (وقتی چیزی درست کار نمی‌کند):**
```powershell
docker compose -f docker-compose.dev.yml logs --tail=200 app
```
برای دنبال‌کردن زنده‌ی لاگ‌ها (تا `Ctrl+C` بزنید): همان دستور را با `-f` اضافه اجرا کنید: `docker compose -f docker-compose.dev.yml logs -f app`.

**اگر سایت بالا نیامد، به ترتیب این‌ها را چک کنید:**
1. `docker compose -f docker-compose.dev.yml ps` — همهٔ سرویس‌ها باید `Up` باشند (`postgres` باید `healthy` باشد).
2. لاگ `app` را ببینید (دستور بالا) و متن خطا را برای پیکسل بفرستید.
3. **تداخل پورت روی ویندوز:** اگر قبلاً یک Postgres یا هر برنامهٔ دیگری روی همین کامپیوتر نصب بوده، ممکن است پورت‌های `3000` یا `5432`/`55432` را قبل از Docker گرفته باشد و اتصال به دیتابیس یا سایت اشتباه برود (بدون خطای واضح). برای بررسی: `netstat -ano | findstr :3000` (یا `:55432`) — اگر یک PID غیرمرتبط با Docker آنجا بود، همان برنامه پورت را گرفته؛ یا آن برنامه را ببندید یا پورت را در `docker-compose.dev.yml` عوض کنید.
4. اگر مطمئن نیستید فایل `.env` درست است: دوباره `cp .env.example .env` بزنید و مقدارهای لازم را پر کنید.

**ایمیل و رمز ادمین کجاست؟** در فایل `.env` (نه `.env.example`) دو خط زیر است:
```
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```
این‌ها فقط روی همین لپ‌تاپ هستند (`.env` هرگز commit نمی‌شود). **رمز و ایمیل سرور Production باید متفاوت از لپ‌تاپ باشند** — همان مقداری که اینجا برای تست محلی گذاشته‌اید را روی سرور واقعی دوباره استفاده نکنید (بخش C4 را ببینید).

---

## C) اجرا روی سرور (staging و production)

### C1. خرید سرور
- کاندیدای اول: **Hetzner Cloud** (hetzner.com) → Cloud → New Project → Add Server. Location: آلمان یا Helsinki. Image: **Ubuntu 24.04**. یک پلن با **۴ vCPU / ۸GB RAM** کافی است (اسم و قیمت پلن‌ها را در زمان خرید ببینید؛ عوض می‌شوند).
- **قبل از Production:** از یک نفر در ایران (بدون VPN)، یکی در ترکیه و یکی در کانادا بخواهید staging را باز کنند: صفحهٔ اصلی، عکس‌ها، ورود با کد ایمیل، خرید تا آپلود فیش. اگر از ایران باز نشد، هاست را عوض می‌کنیم (کد وابسته به هاست نیست).
- SSH key: اگر ندارید، Hetzner گزینهٔ Password می‌دهد (ایمیل می‌کند).
- Backups سرور Hetzner را هم روشن کنید (۲۰٪ هزینهٔ اضافه) — این لایهٔ سوم امنیت است.

### C2. دامنه
در پنل دامنه (مثلاً Cloudflare یا هر جای دیگر) دو رکورد **A** به IP سرور:
- `staging.yourdomain.com`
- `yourdomain.com` و `www.yourdomain.com`
(اگر Cloudflare است، ابر نارنجی را برای شروع **خاموش** (DNS only) بگذارید تا SSL خودکار سرور راحت بگیرد؛ بعداً می‌توانید روشن کنید.)

### C3. نصب روی سرور (یک اسکریپت)
به سرور وصل شوید:
```bash
ssh root@<IP-سرور>
```
سپس (این اسکریپت را Codex در فاز 00 می‌سازد):
```bash
curl -fsSL https://raw.githubusercontent.com/mehdi2044/HodaSite/main/scripts/server-setup.sh | bash
```
اسکریپت: Docker نصب می‌کند، کاربر `deploy` می‌سازد، فایروال را تنظیم می‌کند، مخزن را در `/opt/hodasite` می‌گیرد و از شما می‌پرسد:
- دامنه (staging.yourdomain.com)
- ایمیل ادمین و رمز
- توکن گیت‌هاب (برای مخزن خصوصی؛ در GitHub: Settings → Developer settings → Personal access tokens)
بعد `docker compose up -d` را اجرا می‌کند. ۵ دقیقه بعد سایت روی https://staging.yourdomain.com بالاست.

### C4. تنظیم `.env` سرور
فایل `/opt/hodasite/.env` — مقادیر مهم:
> نکته: در `.env` کامنت درون‌خطی (`مقدار   # توضیح`) ننویسید؛ Docker Compose آن را جزو مقدار می‌خواند. توضیح‌ها را در خط جدا بگذارید.

```
APP_URL=https://staging.yourdomain.com
DATABASE_URL=postgresql://app:<رمز-قوی>@postgres:5432/app
AUTH_SECRET=<خروجی: openssl rand -base64 33>
# s3 = هر فضای S3-سازگار: MinIO داخل Compose، یا Cloudflare R2 در Production
STORAGE_PROVIDER=s3
# کلید API را از resend.com بگیرید
EMAIL_PROVIDER=resend
RESEND_API_KEY=...
# همان کلید رایگان نوسان که در ارزینو دارید
NAVASAN_API_KEY=...
CRON_SECRET=<یک-رشته-تصادفی>
MAINTENANCE_SECRET=<یک-رشته-تصادفی-دیگر>
# برای Production اجباری — یک سرویس جدا از هاست (Backblaze B2 / Cloudflare R2 / Wasabi)
BACKUP_OFFSITE_ENDPOINT=...
BACKUP_OFFSITE_KEY=...
BACKUP_OFFSITE_SECRET=...
```
**فایل `.env` را در یک Password Manager (مثل Bitwarden) کپی نگه دارید.** این فایل بکاپ خودکار نمی‌شود.

### C5. به‌روزرسانی سرور بعد از هر merge
```bash
ssh deploy@<IP>
cd /opt/hodasite && ./scripts/deploy.sh
```
`deploy.sh` قبل از به‌روزرسانی خودکار یک بکاپ امنیتی می‌گیرد، کد جدید را می‌گیرد، migration را (در کانتینر `migrate`) اجرا و سایت را بدون قطعی طولانی ری‌استارت می‌کند. اگر مشکلی شد: تا فاز ۰۵ که rollback خودکار اضافه می‌شود، با `scripts/backup/restore.sh` داخل کانتینر `ops` از همان بکاپ امنیتیِ پیش‌ازدیپلوی بازگردانی کنید.

### C6. Production
همان مراحل C3 با دامنهٔ اصلی روی همان سرور (پورت‌های داخلی متفاوت؛ اسکریپت خودش می‌پرسد `staging` یا `production`) یا یک سرور جدا. پیشنهاد: تا Checkpoint 2 فقط staging.

---

## D) کارهای روزمره

### D1. بکاپ
- خودکار هر شب ۰۳:۳۰. وضعیت در **ادمین → System → Backups** و **System Health**. اگر کپی خارجی (Off-site) شکست بخورد، بکاپ محلی سالم می‌ماند ولی هشدار **قرمز** می‌بینید — نادیده نگیرید.
- بکاپ فوری: ادمین → Backups → **Backup now** یا در سرور: `./scripts/backup/backup.sh --label before-price-change`.
- دانلود: از همان صفحه. فایل zip را جایی امن نگه دارید.

### D2. بازگردانی (Restore)
- ادمین → Backups → انتخاب بکاپ (یا Upload backup) → **Request restore** → رمز + کد MFA. لاگ زنده را می‌بینید.
- یا در سرور: `docker compose exec ops ./scripts/backup/restore.sh /backups/2026-09-15_0330_scheduled --yes` (کانتینر ops خودش migration را اجرا می‌کند؛ به Docker دسترسی ندارد)
- سیستم اول از وضع فعلی بکاپ می‌گیرد، سایت را چند دقیقه در حالت تعمیرات می‌برد، بازگردانی می‌کند، سلامت را بررسی می‌کند و برمی‌گردد. اگر وسط کار مشکلی شد، سایت در حالت تعمیرات می‌ماند و داده‌های قبلی دست‌نخورده است — متن لاگ را برای پیکسل بفرستید.

### D3. نرخ تومان
نرخ از **نوسان** خودکار گرفته می‌شود و در **ادمین → Pricing → FX** به‌صورت «نرخ پیشنهادی» کنار «نرخ فعال» نمایش داده می‌شود؛ با یک کلیک Accept کنید (یا دستی نرخ دیگری بزنید). اگر نرخ جدید بیش از ۵٪ پرش داشت، خودکار اعمال نمی‌شود و از شما تأیید می‌خواهد. لیر و دلار کانادا کاملاً خودکار است. اگر نرخ فعال قدیمی شود، بالای ادمین هشدار می‌بینید.

### D4. اگر سایت بالا نیامد
1. ادمین → System Health را ببینید (اگر باز می‌شود).
2. در سرور: `docker compose ps` و `docker compose logs --tail=200 app`.
3. متن خطا را برای پیکسل بفرستید.

## اجرای فاز ۰۰ روی لپ‌تاپ
```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```
بار اول، migration و seed خودکار اجرا می‌شوند. سایت در `http://localhost:3000/fa`، پنل در `http://localhost:3000/admin` و ایمیل آزمایشی در `http://localhost:8025` است.

برای خاموش‌کردن و پاک‌کردن کامل دادهٔ آزمایشی:
```bash
docker compose -f docker-compose.dev.yml down -v
```
