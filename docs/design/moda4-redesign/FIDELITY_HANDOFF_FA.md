# پیام برای وی‌بانو: «شبیه‌سازی دقیق ظاهر MODA4»

سلام وی‌بانو،

مهدی نسخهٔ فعلی DESIGN-01 (PR67 تا PR76) را دیده و می‌گوید **اصلاً شبیه نمونهٔ تأییدشده نیست**. دستور صریح مالک این است: ویترین فروشگاه باید **عین نمونهٔ MODA4** شود. موتوری که Codex ساخته (قیمت هر بازار، پنل، سبد، پروی فوری، پروفایل) ارزشمند است و حفظ می‌شود؛ فقط **ظاهر** باید درست شود.

## چه چیزی آماده است (PR همین سند)

- `FIDELITY_SPEC.md`: قرارداد الزام‌آور ظاهر، علت‌های انحراف، قواعد غیرقابل‌مذاکره و ترتیب تحویل FID-1 تا FID-6.
- `tests/fidelity/moda4-fidelity.spec.ts` و `pnpm test:fidelity`: آزمون خودکار با ۱۴۶ معیار قابل اندازه‌گیری در کامپیوتر و موبایل.
  - نمونهٔ تأییدشده: **۱۴۶ از ۱۴۶** (یعنی آزمون درست است و همهٔ معیارها شدنی‌اند).
  - نسخهٔ فعلی Codex (b5e9c1c): **۴۴ از ۱۴۶**.
- `fidelity/compare/*.jpg`: تصویر کنار هم نمونه و نسخهٔ فعلی برای هر صفحه.
- `fidelity/report-*.md`: جدول کامل نتیجه‌ها.

## فونت‌ها

فونت‌ها همان انتخاب مهدی در D77 هستند (Manrope، Inter، Vazirmatn) و درست بارگذاری می‌شوند. نمونه هم با همین فونت‌ها به‌روز شد و فایل‌های فونت خود پروژه داخلش قرار گرفت. پس فونت **علت انحراف نیست** و تغییری در D77 لازم نیست.

## دو علت اصلی (اندازه‌گیری‌شده)

1. **«صحنهٔ قابل خرید» دور همهٔ بلوک‌ها:** هر بلوک صفحهٔ اول یک عکس بزرگ اضافه با نقاط قیمت و کادر توضیح می‌گیرد. به همین دلیل صفحهٔ اول **۱۷٬۶۱۷ پیکسل** است (نمونه ۶٬۷۸۲) و یک عکس روی موبایل تا ۹ بار دیده می‌شود. منشور، لوک‌بوک و تبلیغ پرو زیر این عکس‌ها گم شده‌اند. نقاط قیمت فقط داخل بنر اصلی و بخش «خرید ست» باشند.
2. **بازنویسی به‌جای انتقال:** CSS نمونه منتقل نشد و هیچ آزمونی نتیجه را با نمونه مقایسه نکرد.

## درخواست

1. سند و آزمون را بررسی کن. اگر موافقی، `FIDELITY_SPEC.md` را مرجع ظاهر DESIGN-01 اعلام کن: در PROGRESS و phase-design-01 به آن ارجاع بده.
2. قاعدهٔ «صحنه فقط در hero و خرید ست» را پیش از کدنویسی به‌عنوان تصمیم ثبت کن.
3. دستور زیر را به Codex بده. FID-1 تا FID-6، هر کدام یک PR پیش‌نویس جدا، روی همان stack فعلی.
4. معیار پذیرش هر PR: `pnpm test:fidelity` برای صفحه‌های همان مرحله سبز باشد، تصاویر کنار هم پیوست شود و مهدی تصویرها را تأیید کند.
5. هیچ مرجی بدون gateهای D70 و اجازهٔ صریح مهدی انجام نشود.

---

## Prompt for Codex (send after Vee's review)

You are the Codex implementation agent for HodaSite. Follow `AGENTS.md` §0 first.

**Owner instruction (Mehdi):** the storefront must look like the approved MODA4 prototype. Keep every DESIGN-01 capability (market prices, CMS, cart, instant try-on, profile), but fix the presentation until it matches.

**Binding inputs, in order:** D77 (unchanged; fonts already match) and the composition rule Vee records for this work → `docs/design/moda4-redesign/FIDELITY_SPEC.md` → `tests/fidelity/moda4-fidelity.spec.ts` → `docs/design/moda4-redesign/prototype/source/template.html` (reference CSS/markup: port it, do not reinterpret) → `SPEC.md`.

**Task:** implement **FID-<n>** from FIDELITY_SPEC §6 as one Draft PR on top of the current DESIGN-01 stack.

**Rules:**
- Add the `data-moda4` hooks from FIDELITY_SPEC §3 to production markup.
- Copy the prototype's values: sizes, spacing, typography, transforms, breakpoints.
- Remove the per-block shoppable-scene wrapper; pins live only in hero slides and Shop the look.
- Keep the D77 fonts (Manrope display, Inter UI/prices, Vazirmatn Persian), self-hosted.
- The seeded default home page must reproduce the prototype composition.
- FID-1 adds `pnpm test:fidelity` to CI as a required job and uploads `test-results/moda4-fidelity/**`.
- Do not relax or delete rules in the fidelity test. Only Mehdi can change a rule, in this file and the test together.
- Keep D31 editability, i18n (fa/tr/en, RTL), accessibility, reduced motion and all existing tests green.
- In the PR body, before the usual three-way verification split:
  - the fidelity pass count before and after;
  - the `report.md` rows for the pages you touched;
  - the side-by-side images from `test-results/moda4-fidelity/compare/`.
- Never merge; D70 gates and Mehdi's explicit authorization apply.
