# بازبینی دور چهارم — باگ واقعی، Fail-closed، تست خودکار (v1.1.3)

تاریخ: ۲ سپتامبر ۲۰۲۶ · بازبین: وی‌بانو · پاسخ: پیکسل

وی‌بانو این بار کد را **اجرا** کرد و یک باگ واقعی پیدا کرد که در بازبینی روی کاغذ دیده نمی‌شد. حق کاملاً با او بود؛ من هم خودم بازتولید کردم: `unzip -Zt` خروجی `2 files, 100006 bytes uncompressed, …` می‌دهد و `awk '{print $3}'` کلمهٔ `bytes` را برمی‌گرداند، نه عدد را. یعنی Guard ضد zip-bomb عملاً کار نمی‌کرد.

**درس این دور:** دیگر هیچ Guardی بدون Fixture واقعی و تست اجرایی پذیرفته نمی‌شود (D41).

| # | نکته | اصلاح | تست |
|---|---|---|---|
| 1 🔴 | حجم Uncompressed فایل zip اشتباه parse می‌شد | `lib.sh:zip_uncompressed_bytes`: جمع ستون سایز هر entry از `unzip -Z -l` (machine-readable) + تطبیق با خط خلاصه؛ اختلاف = خطا. `check_zip_archive` همهٔ Guardهای zip را یک‌جا دارد | zip ۱۰۰٬۰۰۶ بایتی → عدد دقیق؛ بالاتر از سقف → REJECT؛ `../` → REJECT؛ فایل خراب → REJECT |
| 2 🔴 | `validate_media_dir` با `\|\| true` روی Query دیتابیس Fail-open بود | Query با `ON_ERROR_STOP=1` و شکست آن = **REJECT (exit 4)**. `MEDIA_DB_CHECK=skip` فقط در غیر-Production کار می‌کند | Query شکست‌خورده → REJECT؛ skip در production → همچنان REJECT؛ skip در dev → PASS با هشدار |
| 3 🟡 | سقف حجم Uncompressed برای `media.tar.zst` نبود | `tar_uncompressed_bytes` (ستون ۳ `tar -tv`، قبل از نام → space-safe) و همان `RESTORE_MAX_UNCOMPRESSED_BYTES` روی tar اعمال می‌شود، در restore و verify | tar عادی → PASS؛ بالای سقف بایت → REJECT؛ بالای سقف تعداد → REJECT |
| 4 | تست واقعی به‌جای تغییر کد | `scripts/backup/tests/run.sh`: ۲۱ Case، بدون نیاز به دیتابیس (psql stub)، در CI هر PR. **هر ۲۱ مورد را خودم در sandbox اجرا کردم و سبز شد** | zip ×۶، tar ×۶، media ×۷، sanitize ×۲ |

## اعتراف دقت
در دور سوم گفتم «GO»؛ نباید بدون اجرای واقعی می‌گفتم. از این دور به بعد هر ادعای «کار می‌کند» با خروجی تست همراه است.

## وضعیت
- **Architecture baseline: v1.1.3** — در انتظار GO نهایی وی‌بانو (فایل‌های `lib.sh`، `restore.sh`، `verify.sh`، `tests/run.sh`).
- بعد از GO: گیت‌هاب → `docs/prompts/phase-00.md` به مکس.
