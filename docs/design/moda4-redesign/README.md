# MODA4 — پیشنهاد طراحی تازهٔ فروشگاه (Design Proposal)

> **وضعیت:** پیشنهاد طراحی تأییدشده از نظر ظاهر توسط مهدی (مالک محصول) — **هنوز پیاده‌سازی نشده**.
> این پوشه فقط مستندات و فایل نمونه است؛ هیچ فایلی در `src/`، `prisma/` یا `messages/` تغییر نکرده است.
> اجرای آن طبق AGENTS.md و D70 با بررسی وی‌بانو و پیاده‌سازی Codex در PRهای جداگانه انجام می‌شود.

## این پوشه چیست؟

مهدی ظاهر فعلی فروشگاه را «معمولی و خیلی ایرانی» می‌دانست و یک ظاهر امروزی، بین‌المللی و جذاب خواست. نتیجه، یک **نمونهٔ کامل قابل‌کلیک (prototype)** با برند جدید **MODA4** است که مهدی آن را دید و تأیید کرد. این پوشه همهٔ چیزهایی را دارد که برای پیاده‌سازی واقعی لازم است:

| فایل / پوشه | محتوا | برای چه کسی |
|---|---|---|
| `prototype/MODA4-Redesign-v3.html` | نمونهٔ کامل و مستقل؛ با دوبار کلیک در مرورگر باز می‌شود (عکس‌ها داخل فایل‌اند) | همه |
| `prototype/source/template.html` | سورس خوانای همان نمونه (HTML/CSS/JS بدون عکس‌های base64) | Codex |
| `prototype/source/build.py` | ساخت دوبارهٔ نمونه از سورس + عکس‌های مخزن | Codex |
| `SPEC.md` | مشخصات طراحی: رنگ‌ها، فونت‌ها، کامپوننت‌ها، هر بخش، تعامل‌ها، دسترس‌پذیری، کارایی | Codex / وی‌بانو |
| `IMPLEMENTATION_PLAN.md` | تقسیم کار به ۷ PR با معیار پذیرش، نگاشت به ماژول‌های فعلی و تصمیم‌های لازم | وی‌بانو |
| `FITTING_ROOM_PLAN.md` | عیب‌یابی اتاق پروی فعلی و نقشهٔ سه‌لایه برای درست‌کار کردن آن | وی‌بانو / Codex |
| `HANDOFF_VEE_FA.md` | پیام آماده برای وی‌بانو | مهدی → وی‌بانو |
| `CODEX_PROMPT.md` | دستور آماده برای Codex (بعد از تأیید وی‌بانو) | وی‌بانو → Codex |
| `brand/` | لوگوی MODA4 (SVG و PNG) و نشان M4 | همه |
| `assets/cutouts/` | ۱۹ عکس محصول با پس‌زمینهٔ حذف‌شده (برای پروی فوری و تبلیغ سه‌بعدی) | Codex |
| `assets/banners/` | ۵ بنر عریض ساخته‌شده از عکس‌های نمایشی مخزن (بدون بریده‌شدن سر مدل) | Codex |

## نمونه را چطور ببینیم؟

فایل `prototype/MODA4-Redesign-v3.html` را دانلود کنید و با Chrome باز کنید. در کامپیوتر، نوار کوچک پایین‌چپ بین صفحه‌ها جابه‌جا می‌کند (خانه، دسته، محصول، اتاق پرو، ثبت‌نام، پروفایل). روی گوشی از منوی ☰ استفاده کنید.

> نکتهٔ مهم: نمونه برای سرعت، فونت‌ها را از Google Fonts می‌گیرد. در پیاده‌سازی واقعی طبق **D26** همهٔ فونت‌ها self-host می‌شوند (جزئیات در SPEC.md).

## خلاصهٔ تغییرات ظاهری

- برند **MODA4**: لوگوی Bodoni با قلاب چوب‌لباسی روی «O» و «4» نارنجی ایتالیک (۴ = چهار جهان: زنانه، مردانه، بچگانه، اکسسوری).
- بنر اسلایدی تمام‌عرض با ۴ کمپین؛ عکس‌ها گسترده شده‌اند تا سر مدل هرگز بریده نشود.
- تم «مداد شمعی + توری» برای دکمه‌ها، هدر و فوتر.
- منوی بزرگ با زیرمجموعه و عکس پیشنهادی.
- منشور سه‌بعدی «چهار جهان»، نوارهای متحرک متقاطع، لوک‌بوک چرخان، کارت‌های محصول با کج‌شدن سه‌بعدی و برق.
- دنیای پاستیلی بچگانه (صفحهٔ اول، دسته و محصول بچگانه).
- تبلیغ سه‌بعدی اتاق پرو (لباس از رگال تن مانکن می‌رود).
- اتاق پروی فوری که برای هر ترکیبی کار می‌کند + نمای واقعی با هوش مصنوعی.
- ثبت‌نام سه‌مرحله‌ای (ایمیل → کد → پروفایل) و پروفایل با تم رنگی قابل انتخاب.

---

## English summary (for the implementing agent)

Owner-approved visual direction for a storefront redesign under the new brand **MODA4**. Docs-only: no application code, schema or translations are changed by this folder. Implementation must follow `AGENTS.md`, the D70 gates and the PR breakdown in `IMPLEMENTATION_PLAN.md`. The prototype is a single self-contained HTML file; its readable source is `prototype/source/template.html`, rebuilt by `python3 docs/design/moda4-redesign/prototype/source/build.py` (Pillow required) from the demo images already in `prisma/demo-assets/` plus the cutouts/banners in `assets/`.

Prototype ≠ production code: it uses vanilla JS, hard-coded demo copy and Google Fonts for speed. Production must use the existing Next.js/next-intl/ThemeSettings/Homepage-block architecture, admin-editable content (D31), self-hosted fonts (D26) and the existing fitting room contracts (D74/D75).

All product photos are the AI-generated demo assets already disclosed in `prisma/demo-assets/v2/README.md`; cutouts and banners are derived from them (background removal / edge extension), so they are demo artwork as well.
