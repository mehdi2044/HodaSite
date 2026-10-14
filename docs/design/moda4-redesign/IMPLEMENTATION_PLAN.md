# MODA4 redesign — implementation plan (proposal for Vee)

> وضعیت: پیشنهاد. شمارهٔ فاز، ترتیب نهایی و ADRها را وی‌بانو تعیین و در `docs/02_DECISIONS.md` و `docs/phases/` ثبت می‌کند. هر PR طبق AGENTS.md: برنچ جدا، Draft، خلاصهٔ فارسی برای مهدی، سه‌بخش شواهد (local / CI / not verified)، و مرج فقط با gateهای D70 و اجازهٔ صریح مهدی.

Working name: **Phase 12 — MODA4 storefront redesign** (Vee may renumber; `phase-10`/`phase-11` already exist as future AI phases). Baseline docs v1.2.

## 0. Decisions to record before code (ADR candidates)

| # | Topic | Why an ADR | Proposal |
|---|---|---|---|
| A1 | Brand rename to MODA4 | business setting only (D31) — no ADR needed, but record the owner decision for traceability | seed/default brand name + logo media; admin can change |
| A2 | Typography amendment to **D26** | adds display/accent families | self-host Bodoni Moda (roman+italic), Caveat, IBM Plex Mono, Fredoka (latin subsets) via the existing vendor-fonts approach; Vazirmatn/Inter unchanged; still no Google Fonts |
| A3 | Theme tokens extension | `ThemeSettings.colors` keys are validated by `COLOR_KEYS` | add `sand`, `sandDeep`, `primaryText`, `line` + kids pastel set; `buttonStyle` gains `crayon`; header/footer `lace` trim flag |
| A4 | New homepage block types | extends the Homepage JSON block contract (D67/D74 precedent) | `HeroSlider`, `Bands`, `WorldsPrism`, `FittingAd`, `Lookbook`, `KidsWorld`; restyle `ProductStrip`, `ShopLook`, `TrustBar` |
| A5 | Category presentation theme | additive schema | `Category.presentation Json?` e.g. `{ "theme": "pastel" }`, inherited by descendants and their products |
| A6 | Menu featured tiles | additive schema | `MenuItem.presentation Json?` (up to 2 tiles: mediaId, localized title/subtitle, link) |
| A7 | Customer profile theme | additive schema + privacy | `Customer.profileTheme` enum `ROSE | SLATE | SAND` (store the theme, **not gender** — see Questions) |
| A8 | Fitting room: instant layered try-on | extends D75 | per-variant cut-out media + slot geometry config per model kind; no coins, client-side compositing |
| A9 | Fitting room: dedicated try-on provider | **AI provider change** → mandatory ADR | new adapter behind the existing `FittingProvider` interface; OpenAI adapter stays as fallback (see FITTING_ROOM_PLAN.md) |

## 1. PR breakdown

Each PR is shippable alone, mobile-first (390 px first), fa/tr/en, RTL-correct, reduced-motion safe, and adds Playwright coverage for its user-facing flow.

### R1 — Brand & design foundations
- Brand: MODA4 name (3 locales), default logo/dark logo/favicon/PWA icons from `brand/` seeded as Media (no overwrite of merchant edits).
- Fonts per A2 (vendored, subset, `font-display: swap`).
- Tokens per A3 wired through `ThemeSettings` → CSS variables; theme editor gets the new keys with contrast warnings (`src/lib/contrast.ts`).
- Shared UI: crayon button variants (§5.1), lace trims, hand-drawn underline, toast; update `src/components/ui/button.tsx` (fix today's white-on-orange contrast: ink text on accent).
- Global motion utilities: reveal-on-scroll, reduced-motion guard, visibility-paused rAF helper.
- **Acceptance:** theme editor preview shows new tokens; buttons match prototype in fa/en, light; axe passes; LCP unchanged.

### R2 — Shell: header, mega menu, drawers, search
- Announcement rotator (per market, admin), market + language switches.
- Header transparent-over-hero → solid on scroll; logo hook swing for SVG logos.
- Mega menu from `MenuItem` tree + A6 featured tiles (admin: Content → Menus); mobile drawer accordions.
- Cart drawer (existing cart module), search overlay (existing `/api/catalog/suggest`).
- Footer: lace edge, newsletter (existing consent rules), columns from menus, giant wordmark.
- **Acceptance:** keyboard-only navigation of mega menu; Escape closes overlays; cart drawer totals equal cart page; Playwright for menu → category and add-to-bag → drawer.

### R3 — Home page blocks
- `HeroSlider` (per slide: desktop/mobile media with D67 framing/focal X, text side, localized eyebrow/Latin title/Persian line/body/CTAs, optional floating product reference), `Bands`, `WorldsPrism`, `Lookbook`, restyled `ProductStrip` (tilt + glare + quick add), restyled `ShopLook` (hotspots + glass panel), restyled `TrustBar` (services).
- Admin homepage builder: add/edit/reorder these blocks with mobile/desktop preview; zod schemas; per-market overrides as today.
- **Acceptance:** models' heads never cropped at 1440×900, 1920×800, 390×844 (Playwright screenshot assertions on focal area); autoplay stops under reduced motion; LCP ≤ 2.5 s mobile in CI budget.

### R4 — Kids pastel world
- A5 category presentation; PLP/PDP/cards switch to pastel tokens, Fredoka headings, cut-out cards on pastel gradients.
- `KidsWorld` block with turntable (product references, podium colours from pastel tokens).
- **Acceptance:** kids category + a kids product render pastel; other departments unaffected; contrast ≥ 4.5:1 body / 3:1 display.

### R5 — PLP & PDP polish
- PLP sticky filter bar (sub-categories from tree, sizes, sort), responsive grid.
- PDP gallery (thumbs, stacked shots, cut-out shot, lightbox `contain`), buy box per SPEC §7, accordion, complete-the-look, phone sticky buy bar.
- **Acceptance:** out-of-stock size disabled + announced; lightbox keyboard accessible; add-to-bag from sticky bar works.

### R6 — Sign-up & profile
- 3-step OTP UI on the existing customer auth (no auth logic change unless required — if touched, auth evidence per AGENTS.md).
- Profile dashboard per SPEC §7; A7 `profileTheme`; saved sizes/style interests via existing CRM preferences where possible.
- **Acceptance:** OTP flow unchanged server-side; theme persists across sessions; privacy export includes profileTheme; anonymization clears it.

### R7 — Fitting room v2 (see FITTING_ROOM_PLAN.md)
- R7a: instant layered try-on page + `FittingAd` block (A8). Admin: per-variant cut-out upload, slot geometry editor with live preview per WOMAN/MAN/GIRL/BOY.
- R7b: queue/provider health diagnostics + stuck-session alerting (no provider change).
- R7c (after A9 ADR): dedicated try-on adapter, sequential garment application, result cache, pre-generation of ShopLook looks.

## 2. Mapping prototype → code

| Prototype part (`template.html`) | Production home |
|---|---|
| `:root` tokens, `.cbtn`, lace vars | `src/styles/tokens.css`, `src/components/ui/*`, ThemeSettings |
| `#annRot`, `.hdr`, `.mega`, drawers, `.search` | `src/components/storefront/{announcement-bar,header,mobile-menu,cart-drawer,search-box}.tsx` |
| `.hero`/`.slide` | new `HeroSlider` block in `src/modules/content/homepage.ts` + `homepage-blocks.tsx` |
| `.bands`, `.prism`, `.ring`, `.kids-world` | new block components under `src/components/storefront/` |
| `.fit3d` scene | `FittingAd` block (client component, IntersectionObserver-gated) |
| `.stl` | existing ShopLook (`shop-look.tsx`, `shop-look-studio.tsx`) |
| `.pc` card | `product-card.tsx` |
| `#pg-shop` | `src/app/[locale]/c/[slug]/page.tsx` + `catalog-filter.tsx` |
| `#pg-product` | `src/app/[locale]/p/[slug]/page.tsx` + `product-gallery.tsx`, `product-options.tsx` |
| `#pg-fitting` | `src/app/[locale]/fitting-room/*` + `fitting-room.tsx` + `src/modules/fitting/*` |
| `#pg-account`, `#pg-profile` | `src/app/[locale]/account/*`, `customer-login.tsx` |
| JS data `P`, `DEPTS`, `GEO` | **must come from DB** (catalog, categories, fitting geometry config) |

## 3. Questions for PM (Mehdi)

1. **Gender → profile theme:** the owner asked for the profile colour to follow gender. Proposal: the sign-up step shows three choices (زن / مرد / ترجیح می‌دهم نگویم) but we store only the resulting theme (ROSE/SLATE/SAND), never gender. OK?
2. **Latin titles in Persian pages** (e.g. "City Layers" above «لایه‌های شهری»): approved by the owner as the international look; they are per-locale content fields, so tr/en can differ.
3. **Font additions** (A2) — approve the D26 amendment.
4. **Try-on provider** (A9): budget and provider choice need owner approval before R7c.
5. **Loader animation**: keep (≤1.5 s, first visit per session) or drop?
