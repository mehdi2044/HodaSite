# Phase 01 — Markets, Site Settings, Theme, Menus, Pages/CMS, Translations, Media Library

## Goal
Everything visual and textual on the storefront is admin-editable (see `docs/06_ADMIN_AND_DESIGN.md` §A rows tagged 01). After this phase Mahdi can brand the shop without code.

## Scope
1. **Markets** (`Market` full fields per DB doc): admin CRUD-lite (3 fixed markets, editable settings: active, currency, enabledLocales, defaultLocale, supportChannels, announcementBar I18n, seo). Market switcher + locale switcher components in storefront header/footer; cookie persistence; middleware resolution per architecture §3.1. Geo suggestion banner ("به نظر می‌رسد در کانادا هستید…") using `Accept-Language`/optional geo header — suggestion only.
2. **Site Settings**: brand (name I18n, tagline I18n, logo/logoDark/favicon/emailLogo), contact (email, phones per market, address I18n), social links per market, legal (company name, registration no.), checkout options placeholder, maintenance mode (on/off + message I18n + allowlisted IPs) with middleware enforcement (admin always reachable).
3. **Theme**: extend Phase 00 page: full palette, font pairs (list of self-hosted fonts), radius, header style, button style, dark mode toggle, custom CSS (sanitized), **live preview iframe** of the storefront home on mobile/desktop widths. Save → revalidate tag.
4. **Media Library**: grid with upload (drag&drop, multi), folders/tags, search, alt text I18n, delete (soft), image processing **as a job, not inline** (V-5): upload returns immediately with a `PROCESSING` state; a `media-optimize` job (`sharp` → webp/avif + sizes 320/640/960/1280/1920 + blur placeholder) runs via the existing DB-backed `Job` queue behind an `ImageProcessingQueue` interface. Queue-ready but **no Redis/BullMQ** — swapping the driver later must not touch call sites (D21). UI shows a placeholder until ready and retries failed jobs. Image URL helper for storefront.
5. **Menus**: header / mobile / footer (multi-column) menus, nested items, I18n labels, per-market visibility, drag & drop ordering, link types (URL / category / page / collection — later types resolved when those exist).
6. **Pages (CMS)**: `Page` with slug per locale, type static/landing, status, SEO, block-based content. Blocks: RichText (TipTap, RTL-aware), Image, Hero, TwoColumns, FAQ, CTA, Countdown, Embed. Storefront route `/[locale]/pages/[slug]`. Seed pages: about, contact, terms, privacy, returns, size-guide, faq (placeholder text in 3 languages).
7. **Homepage builder**: ordered blocks: Hero (image/video, title, subtitle, CTA), CategoryCards, ProductStrip (source: newest/best/collection — collection resolves after Phase 02; show placeholder until then), Banner, TrustBar (4 items with icons), RichText. Per-market override of homepage optional.
8. **Translations editor**: table of UI keys (from `messages/*.json`) with fa/tr/en values, search, inline edit, "reset to default", import/export JSON. Runtime merge: DB overrides file. Also lists entity translations missing for a locale.
9. **Notification templates** table + editor (subject/body I18n, variables list, send test) — email provider `smtp`/`resend` + `noop` (logs to console). Templates seeded: `auth.otp`, `order.placed`, `order.receipt_received`, `order.paid`, `order.rejected`, `order.shipped`, `order.delivered`, `order.cancelled`.
10. Storefront header/footer/home now fully data-driven and designed per §B (this is where visual quality starts to matter — make it beautiful on 390px).

## Acceptance criteria
- All rows tagged 01 in `06_ADMIN_AND_DESIGN.md` §A are editable and reflected on storefront within one page load.
- Maintenance mode blocks storefront (200 with message page, 503 status) but not admin.
- Uploading a 6MB JPEG produces webp variants and blur placeholder; storefront uses them.
- Persian RTL rich text renders correctly with mixed Latin words (BiDi isolate).
- e2e: change site name → visible in `<title>` on `/fa` and `/en`; add menu item → rendered; create page → reachable.
