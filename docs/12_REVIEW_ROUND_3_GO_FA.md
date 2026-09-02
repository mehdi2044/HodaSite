# بازبینی دور سوم — دو Patch نهایی و GO (v1.1.2)

تاریخ: ۲ سپتامبر ۲۰۲۶ · بازبین: وی‌بانو · پاسخ: پیکسل

وی‌بانو معماری، Governance، FX/Navasan، مالی/موجودی و معماری بکاپ را **تأیید** کرد و دو Patch چندخطی + دو Hardening کوچک خواست. هر چهار مورد درست بود و اعمال شد.

| # | نکته | اصلاح | کجا |
|---|---|---|---|
| 1 🔴 | `manifest.json` داخل checksum نبود | manifest **قبل از** checksum ساخته می‌شود و `sha256sum` روی فهرست صریح `db.dump manifest.json [media.tar.zst]` اجرا می‌شود (حالت `--no-media` مدیریت شد). دستکاری manifest → ریستور در مرحلهٔ validate رد می‌شود | `backup.sh` |
| 2 ⚠️ | Media قبل از Swap فقط Count می‌شد؛ `verify.sh --live` هم Media را نمی‌دید | helper مشترک `lib.sh:validate_media_dir` ساخته شد و **قبل از swap** روی `$TMP` اجرا می‌شود: فایل‌های نمونه non-empty + MIME درست + ۲۵ رکورد `Media.storageKey` از DB تازه‌ریستورشده روی دیسک موجود. شکست = بدون swap، media قبلی دست‌نخورده. `verify.sh --live` هم همین را روی پوشهٔ زنده اجرا می‌کند | `lib.sh`, `restore.sh`, `verify.sh` |
| 3 | `LABEL` مستقیم در SQL | `sanitize_label` → فقط `[A-Za-z0-9._-]`، حداکثر ۴۰ کاراکتر؛ `kind` هم whitelist شد | `lib.sh`, `backup.sh` |
| 4 | پارس `tar -tvf` با `awk $NF` برای نام‌های دارای فاصله | نوع entry از `tar -tvf \| cut -c1` و نام از `tar -tf` (یک نام در هر خط) → space-safe. به‌علاوه D40: `storageKey` همیشه توسط سیستم تولید می‌شود، نام فایل کاربر هرگز مسیر object نیست | `lib.sh:check_tar_archive`, D40, AGENTS |

## وضعیت نهایی
- **Architecture baseline: v1.1.2 — 🟢 GO**
- بازبینی Foundation تمام شد. از اینجا به بعد هیچ تغییری در اسناد پایه بدون ADR انجام نمی‌شود.
- قدم بعدی مهدی: مخزن گیت‌هاب → آپلود بسته → `docs/prompts/phase-00.md` به مکس.
