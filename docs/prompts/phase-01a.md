# Phase 01a — Markets, Site Settings, Maintenance, Theme, typed authorization errors

> Sub-phase of Phase 01 (decision D45/roadmap v1.2, split into 01a/01b/01c on 2026-09-05). Phase numbering and Checkpoint 1 (after Phase 02) are unchanged. Everything in `docs/phases/phase-01.md` **not** listed here belongs to 01b (Media Library) or 01c (Menus, Pages/CMS, Homepage builder, Translations editor, Notification templates, final storefront design) and must **not** be implemented now.

## Goal
Mahdi can configure *who the shop is* (brand, contact, legal, social), *where it sells* (the three markets with their locales and currencies), *what it looks like* (full theme with live preview) and *whether it is open* (maintenance mode) — all from `/admin`, with changes visible on the storefront within one page load. Authorization failures become a typed, translatable error instead of a raw `Error("FORBIDDEN")`.

## Scope

### 1. Markets (`Market` model already exists from Phase 00)
- Admin page `/admin/markets`: list of the 3 fixed markets (IR / TR / CA — **no create/delete**, only edit).
- Editable per market: `isActive`, `salesPaused`, `currency`, `enabledLocales`, `defaultLocale`, `supportChannels` (JSON: phone/whatsapp/telegram/email per market), `announcementBar` (I18n text + enabled + link), `seo` (I18n title/description defaults). Add missing columns with an **additive** migration; keep the existing pricing fields (`markupPercent`, `roundingRule`, `holdHours`, `paymentDeadlineHours`) read-only on this page (they belong to Phase 02).
- Storefront: `MarketSwitcher` and `LocaleSwitcher` components (header + footer), cookie persistence (`market`, `NEXT_LOCALE`), middleware resolution per `docs/03_ARCHITECTURE.md` §3.1. Only locales in `enabledLocales` of the current market are offered.
- **Geo suggestion banner** (suggestion only, never redirect): from `Accept-Language` and, if present, `x-vercel-ip-country` / `cf-ipcountry` / a configurable header name in env. Dismissible; dismissal stored in a cookie. Copy comes from `messages/*.json`.
- Announcement bar rendered at top of storefront when enabled for the current market.

### 2. Site Settings (`SiteSettings` model already exists; fill in the JSON shapes and the UI)
Admin pages under `/admin/settings/`:
- `brand` (extend Phase 00 page): name I18n, tagline I18n, logo / logoDark / favicon / emailLogo. **Media Library is 01b** — for now each is a single-file upload field storing the file via the existing `StorageProvider` abstraction and saving a `Media` row with `status = READY` and no variants. Keep the field API identical to what 01b's media picker will use (`mediaId`), so 01b only swaps the picker component.
- `contact`: email, phones per market, address I18n, opening hours I18n (free text).
- `social`: links per market (instagram, telegram, whatsapp, x, tiktok, youtube, linkedin) — empty = hidden.
- `legal`: company legal name, registration no., tax no., I18n footer legal line.
- `checkout`: placeholder section with a clear "configured in Phase 03" note (no fields yet).
- `maintenance`: state `off | on | scheduled`, message I18n, `allowlistIps` (CIDR list), optional `startsAt/endsAt`. Middleware enforcement: storefront returns the maintenance page with **HTTP 503** + `Retry-After`; `/admin/*`, `/api/health`, `/api/cron/*`, `/api/ops/*` and allowlisted IPs always pass. This replaces/extends the Phase 00 ops-driven maintenance flag — both sources must be honoured (restore.sh's flag OR admin state → maintenance).
- Every settings save: Zod validation, `assertCan('settings.write')`, AuditLog entry with before/after, `revalidateTag('site-settings')`. Storefront reads settings through one cached accessor (`getSiteSettings()`), never Prisma directly from components.
- `<title>`, `<meta description>`, favicon, `og:site_name` on storefront come from settings + market SEO defaults.

### 3. Theme (`ThemeSettings` model exists; extend Phase 00 page)
- Full palette (background, surface, text, muted, primary, primaryText, accent, danger, success, border), light/dark pairs, `darkMode: off | on | system`.
- Font pairs: a list of **self-hosted** fonts shipped in `public/fonts/` (at minimum one Persian-first family with Latin fallback, one Latin/Turkish family); per-locale font assignment. No Google Fonts at runtime.
- Radius, header style (`minimal | centered | editorial`), button style (`pill | soft | sharp`), `heroStyle` (existing).
- Custom CSS textarea, **sanitized** (strip `@import`, `url(` to external hosts, `expression(`, `<`); max 20 KB.
- Theme is emitted as CSS variables on `<html>` (Tailwind v4 runtime theming, D-stack). Save → `revalidateTag('theme')`.
- **Live preview**: the theme editor shows the storefront home in an `<iframe>` at 390px and 1280px widths; unsaved changes are pushed to the iframe via `postMessage` (preview only), and the iframe reloads on save. Preview route must be admin-only and must **not** write anything.

### 4. Typed authorization error + i18n surface (Vee, review of Phase 00)
- Add `ForbiddenError` (and `UnauthorizedError`) classes in `src/modules/access/errors.ts` with `permission`, `scope`, `code` fields. `assertCan()` throws `ForbiddenError` instead of `Error("FORBIDDEN")`.
- Server Actions catch it and return `{ ok: false, code: 'FORBIDDEN', message }` (never leak stack); admin UI renders the message from `messages/*.json` (`errors.forbidden` etc.) in the current admin locale.
- Route handlers map it to HTTP 403 JSON; middleware unchanged.
- Update the existing structural test so it also asserts no `new Error("FORBIDDEN")` remains anywhere in `src/`.

### 5. Storefront (minimal, data-driven; final design is 01c)
Header (logo, market switcher, locale switcher), announcement bar, footer (contact, social, legal line) are rendered from settings and theme. Layout must be correct at 390px and RTL, but the visual polish pass is **01c** — do not spend time on hero/home composition now.

## Out of scope (do not implement)
Media Library grid/variants/jobs (01b); menus, pages/CMS, homepage builder, translations editor, notification templates, final storefront design (01c); anything from Phase 02+.

## Acceptance criteria
1. Changing brand name in `/admin/settings/brand` → new `<title>` on `/fa`, `/tr`, `/en` within one page load (e2e).
2. Setting maintenance `on` → `/fa` returns **503** with the localized message; `/admin` and `/api/health` still return normally; an allowlisted IP (simulated via header in test) gets 200 (e2e + integration).
3. Disabling `tr` for market IR → `/fa` locale switcher no longer offers Turkish; `/tr` under market IR redirects to IR's default locale (e2e).
4. Changing primary color in theme editor → preview iframe updates **without** saving; after save `/fa` renders the new `--color-primary` (e2e).
5. Custom CSS containing `@import url(https://evil)` is rejected with a readable error (unit).
6. A non-privileged admin role calling a settings action gets a localized "forbidden" message, not a crash (e2e), and `grep -r 'Error("FORBIDDEN")' src` is empty (unit/structural).
7. `pnpm lint && pnpm typecheck && pnpm test` green; e2e green in CI; backup → restore cycle still green in `docker-runtime`.
8. Fresh `down -v && up --build` seeds all of the above with sensible demo values in three languages.

## Deliverables
Code + additive migrations + seed; unit/integration/e2e tests; `docs/PROGRESS.md` row **01a** done with manual test steps in simple Persian; `docs/06_ADMIN_AND_DESIGN.md` §A rows tagged 01 that are covered here marked as `01a`; PR titled `Phase 01a: Markets, Site Settings, Maintenance, Theme`.
