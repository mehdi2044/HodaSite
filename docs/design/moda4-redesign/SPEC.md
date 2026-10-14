# MODA4 storefront redesign — design specification

Updated 2026-10-14 under D77/D78. The selected prototype remains the layout/motion reference, but the ADRs, [phase specification](../../phases/phase-design-01.md) and [shoppable scenes/live preview contract](SHOPPABLE_SCENES_AND_PREVIEW.md) take precedence over demo CSS/JS. Typography and behavior below amend the prototype; its old fonts, fake prices/AI/OTP, fixed counts and timers are not production requirements. Resolve authorized technical conflicts without asking the owner again; record genuinely unresolved scope questions.

خلاصه برای مهدی: این سند همهٔ جزئیات ظاهری (رنگ، فونت، اندازه، حرکت) و رفتار هر بخش را برای برنامه‌نویس می‌نویسد تا سایت واقعی دقیقاً شبیه نمونه شود.

---

## 1. Principles

1. **International editorial fashion** (reference feel: COS, Arket, Jacquemus) — imagery first, generous whitespace, light Persian type weights, Manrope Latin display titles as admin-editable content.
2. **Calm premium, playful details** — crayon-textured buttons, lace trims, hand-drawn accents, subtle 3D. Never busy: one primary action per section.
3. **Keep the intended model/garments visible.** Use per-image framing/focal controls and separate mobile art; verify actual crops at target viewport sizes. A 3:4 frame or top alignment alone does not guarantee a visible head. Wide banners may use suitably approved wide art (see §6.1).
4. **Configuration over code (D31).** Brand name, logo, colors, banners, block content, menus, Latin/Persian titles and every string are admin-editable / translated. Nothing in this spec is meant to be hard-coded copy.
5. **Motion is optional.** Everything respects `prefers-reduced-motion: reduce` (no autoplay, no rotation, instant transitions) and pauses when off-screen or when the tab is hidden.

## 2. Brand

| Item | Value |
|---|---|
| Name | **MODA4** (admin: Settings → Brand, all three locales) |
| Wordmark | `brand/moda4-wordmark.svg` — Bodoni Moda (wght ≈520, opsz 96) outlines; hanger hook on the "O" (`.hk` path); italic "4" in accent orange `#FF6A1A` |
| Mark / favicon / PWA icon | `brand/moda4-mark.svg` (ink rounded square, paper "M", orange italic "4"); PNG exports in `brand/` |
| Story | "4" = four worlds: Women, Men, Kids, Accessories |
| Hook swing | on hover the `.hk` path rotates around its base (keyframes `swing`, 1.4 s). Works only when the logo is inline SVG; with a raster logo the effect is simply absent |
| Font licence | Bodoni Moda — SIL OFL 1.1 (outlines embedded in the SVG; commercial use allowed) |

Seed compatible PNG logo exports as Media without overwriting merchant edits; use an audited built-in SVG only for optional hook motion. The current upload allowlist does not accept SVG: do not bypass it or inline uploaded SVG. Admins can replace logos and choose safe sizing; retain aspect ratio and a legible header/footer layout.

## 3. Design tokens

Extend `ThemeSettings.colors` (`COLOR_KEYS` + `safeColorMap`) rather than hard-coding. Proposed keys and defaults:

| Token | Light | Use |
|---|---|---|
| `background` (paper) | `#F7F4EF` | page ground |
| `text` (ink) | `#141210` | text, dark buttons, footer ground |
| `muted` (stone) | `#6B645C` | secondary text (5.3:1 on paper) |
| `surface` | `#FFFFFF` | cards, inputs, panels |
| `sand` | `#ECE5DA` | image grounds, chips |
| `sandDeep` | `#E2D8CA` | |
| `primary` (accent) | `#FF6A1A` | accent fills — **text on it is ink** (6.5:1); never white text on accent |
| `primaryText` | `#B93D0B` | accent used as text/links on paper (5.1:1) |
| `success` | `#2E7D4F` | |
| `line` | `#141210` + bounded opacity `0.12` | hairlines; retain six-digit HEX validation, never raw CSS or eight-digit bypass |
| Kids pastels | `#F8D7E3` pink · `#CFEEDF` mint · `#CFE4F8` sky · `#FFF0B3` butter · `#E4DAF7` lilac · `#FFDCCB` peach | kids presentation theme only |
| Kids ink | `#5B4A6B` (headings, 6.8:1), accent words `#F28BA8` in the prototype is only 2.2:1 — **use `#D4547F` (≥3:1 for display sizes)**, `#F6A9BE` (button, ink-plum text `#3E2F48` 6.7:1), `#9FD9BE` (secondary button) | |
| Profile themes | Rosé: bg `#F8EEEA` soft `#EBD3CC` accent `#A8434F` deep `#4E1C25` · Slate: `#EDF1F5` `#CBD6E2` `#2D4A6E` `#132238` · Sand: `#F3EEE4` `#E0D5C2` `#6E5E3A` `#2A2519` | profile page only |

Radii: cards 6 px (kids cards 22 px), panels 14–18 px, pills 999 px, arches `999px 999px 8px 8px` (lookbook/profile wardrobe tiles), fitting stage `280px 280px 24px 24px`.
Spacing: container max 1440 px, side padding 48 / 28 / 16 px (≥1100 / ≥760 / phone). Section rhythm 110–120 px desktop, 64–72 px phone. Header height 72 px (60 px phone).

## 4. Typography (all self-hosted — D26)

| Role | Family | Notes |
|---|---|---|
| Persian UI + body | Vazirmatn (already self-hosted) | weights 200–700; headings are **light (300)** with one bold phrase, not heavy |
| Latin UI (tr/en) | Inter (already self-hosted) | unchanged |
| Latin display titles | **Manrope variable** | campaign/section/kids headings; re-tune scale and wrapping, no forced italics |
| Labels / prices / short accents | **Inter** | readable prices with tabular numerals and BiDi isolation; replace handwritten/mono notes |
| Kids display | **Manrope** | playful character comes from composition/pastels/motion, not a fourth font family |

The unchanged historical prototype loads its old font set from Google Fonts. Production must follow D77's recorded D26 amendment: vendor the pinned Manrope Fontsource OFL distribution and license through the existing script, keep Inter/Vazirmatn self-hosted, include Turkish Latin-ext, and expose only safe role/allowlist choices in admin. No runtime Google Fonts/CDN requests.

Scale (desktop → phone): hero display `clamp(56px, 7.4vw, 128px)` / 56 px; section title `clamp(30px, 3.2vw, 46px)`; kids display `clamp(52px, 6vw, 96px)`; body 15.5 px / line-height 1.95 (Persian); labels/prices at a readable size in Inter (start at 14 px on mobile); adjust display scale to Manrope and actual translated content.

## 5. Components

### 5.1 Crayon button (`.cbtn`)
- Pill, min-height 54 px (44 px `sm`), padding 0 30 px, weight 600.
- Fill is a `::before` layer with SVG filter `#crayon` (feTurbulence 0.8 → feDisplacementMap scale 4.5 + grain mask `0 0 0 -2 2.2`) so the **edge and fill look like wax crayon** while the text stays crisp.
- `::after` inset 5 px, 1.2 px **dashed stitch** line (white 42 % on dark, ink 35 % on light) — the "lace / embroidery" detail.
- Variants: ink (default), `accent` (orange, ink text), `light` (paper), `ghost` (2.2 px ink outline, no stitch), `pastel`, `mint` (kids).
- Hover: `translateY(-2px) rotate(-.6deg)`; optional magnetic follow (≤18 % x / 30 % y of cursor offset) on hover-capable pointers only.
- Must remain a real `<button>`/`<a>`; disabled state opacity .45.

### 5.2 Lace trims
- Header bottom edge and footer top edge use a repeating 26×12 px SVG scallop with an eyelet hole (`--lace-light`, `--lace-dark` data URIs in the prototype). The header trim appears only when the header turns solid.
- Nav hover: hand-drawn orange squiggle underline (SVG data URI) scales in from the inline-end.

### 5.3 Header
- Grid: nav (start) · logo (center) · tools (end). Over the home hero it is transparent with a soft paper gradient for legibility; becomes solid paper after 40 px scroll and on all other pages.
- Announcement bar (36 px, ink): rotating messages (admin, per market) + market switch (IR/TR/CA) + language switch.
- Tools: search (opens overlay), account, wishlist, bag (opens drawer, count badge in accent).

### 5.4 Mega menu
- Driven by the existing `MenuItem` tree (`parentId`). Each top-level item: column of children, a "collections" column, a "help" column and **two featured tiles** (3:4 image, title, sub-line). Featured tiles need an additive per-item presentation field (see plan R2).
- Opens on hover/focus-within; closes on Escape and pointer leave. Mobile: right-side drawer with `<details>` accordions.

### 5.5 Product card
- 3:4 image, radius 6 px, hover: second image (look photo) cross-fades in; 3D tilt (≤10° Y, ≤8° X) + glare (radial soft-light following the cursor); quick-add size row slides up (`translateZ(30px)`); wishlist heart (accent fill when pressed); colour swatches switch the image.
- Kids products show the **cut-out** on a pastel gradient instead of the studio photo.
- Readable Inter localized new-arrival flag top inline-start; visibility follows actual catalog settings.

### 5.6 Drawers & overlays
- Cart drawer (inline-end side; quantity stepper, remove, subtotal, "shipping/tax shown next step" note).
- Search overlay from the top: big input, trending chips, 6 result tiles (existing `/api/catalog/suggest`).
- Lightbox: `object-fit: contain`, never crops.
- Toast: ink pill, bottom center, 2.6 s.

## 6. Home page sections (each = an admin homepage block, per market)

### 6.1 Hero slider (new block `HeroSlider`)
- Use the selected hero composition, with independently framed desktop/mobile images and focal X/Y. Prototype height is a starting point, not proof against cropping. Verify head and all offered garments/price labels in actual 1440×900, 1920×800 and 390×844 screenshots; use contain or appropriate artwork when cover cannot preserve them.
- Per slide: desktop/mobile media, framing/focal X/Y, text side, Inter eyebrow, Manrope display title, localized line/body/CTAs, and shared shoppable-scene references for EVERY offered garment. Prices remain readable without hover; optional floating cutout also uses live catalog price. Mobile uses numbered points and an always-visible price list where needed. All fields have admin controls.
- Autoplay 7 s with progress bars (pause on hover/focus, reduced motion = no autoplay), arrows, swipe. Titles reveal letter-by-letter.
- **Wide art without head crops:** the four demo banners in `assets/banners/` were produced by extending the studio wall/floor of a 3:4 photo sideways (edge-column stretch + vertical blur + grain). For production, admins upload their own wide campaign art; optionally Codex can add an admin-side helper that does the same extension with `sharp` when only a portrait is available.

### 6.2 Crossing bands (`Bands`)
Two full-width bands crossing at −3° / +2.4°: Manrope display words and Inter short labels; opposite marquee directions (30 s). Words are localized editable block content; pause control, focus/visibility pause and reduced-motion are required.

### 6.3 Four worlds prism (`WorldsPrism`)
CSS 3D square prism (starting faces 330×440, with explicit media framing), `rotateX(-9deg)`, top cap carries the logo. Auto-rotates every 3.8 s to the next face, drag to rotate, tabs select a face, the CTA follows the current face. Faces link to configured featured categories; the kids face uses pastel gradient + cut-outs. Four faces are a presentation choice, never a business limit: a fifth root and nested categories remain discoverable through menus/category navigation.

### 6.4 New-in rail (existing `ProductStrip`, restyled)
Horizontal snap rail of product cards (§5.5), "view all" link.

### 6.5 Fitting room 3D ad (`FittingAd`)
A 1100×640 scene scaled to width: a clothes rack in perspective (`rotateY(18deg)`) with swaying garment cut-outs on hangers, a crayon-sketch mannequin, and a loop: each selected garment detaches, spins 360° in 3D while flying and lands in its slot on the mannequin (reparented into the flat scene for exact landing), then a scan line passes and the real model photo of the same outfit fades in ("Your look is ready ✦"). Two outfits alternate (women/men); chips choose; "replay". Runs only while in view.

### 6.6 Shop the look (existing `ShopLook`, restyled)
Full-width banner with pulsing numbered hotspots; glass panel on the opposite side of the model with items, per-item size chips, total and "add look to bag".

### 6.7 Lookbook ring (`Lookbook`)
Six arched 3:4 cards on a CSS 3D cylinder (radius 430 px / 300 px phone), auto-advance 4.8 s, drag, arrows; far cards dim/desaturate.

### 6.8 Kids world (`KidsWorld`)
Pastel gradient section with floating bubbles, drifting clouds, twinkling stars; Manrope headings; a **turntable**: kids cut-outs on pastel podiums arranged on a rotating ring, each billboarded to face the viewer (rAF loop, pause on hover, drag). Items link to products.

### 6.9 Services + newsletter + footer
Four service tiles (shipping to 3 countries, easy returns, transparent prices — no fake discounts, real support). Footer: lace top edge, newsletter (consent-respecting), four link columns, giant wordmark, payment method labels.

## 7. Other pages

- **Category (PLP):** title (Persian + Manrope Latin), sticky filter bar (sub-category chips from the category tree, size chips, sort), 4/3/2-column grid. Kids categories switch to the pastel presentation with a decorated pastel header.
- **Product (PDP):** sticky vertical thumbnails + stacked 3:4 shots (cut-out shot on sand/pastel), click → lightbox; buy box: crumb, Persian name + Manrope Latin name, price + tax note, colour swatches, size grid (out-of-stock dashed/struck), stock line, add to bag (crayon), wishlist, "try on the model" ghost button, three perk tiles, accordion (description, size guide, material & care, shipping & returns), complete-the-look grid; phone sticky buy bar.
- **Fitting room:** see `FITTING_ROOM_PLAN.md` §3 (instant layered try-on on a 3D turntable stage).
- **Sign-up / login:** split screen (themed image | form), 3 steps with progress: email → 6-digit OTP (auto-advance, backspace back, resend countdown) → profile (name, profile theme, usual size chips, style interest chips). Uses the existing customer OTP flow.
- **Profile:** themed cover with crayon avatar ring and lace edge, theme switch (Rosé/Slate/Sand), side nav, stats (orders in transit, fitting coins, wishlist, wardrobe looks), active order with 5-step timeline, wardrobe (arched tiles + "new look" tile), my sizes, shopping settings, wishlist grid.

## 8. Accessibility

- Real controls only; `aria-pressed` for toggles, `aria-expanded` for disclosures, `aria-current` in profile nav, icon buttons labelled.
- Contrast: ink on accent 6.5:1; muted on paper 5.3:1; kids accent word must be darkened (see §3); never white text on accent; hero copy sits on light wall areas or the phone gradient overlay.
- Keyboard: mega menu opens on focus-within; Escape closes overlays; lightbox close button; carousels have buttons as well as drag/swipe.
- `prefers-reduced-motion`: disable autoplay, rotation, parallax, magnetic buttons, loaders; transitions ≈0.
- BiDi: Latin titles/prices/SKUs isolated (`<bdi>` / `unicode-bidi:isolate`), CSS logical properties throughout.

## 9. Performance budget

- Mobile LCP ≤ 2.5 s (docs/06): hero first slide image is the LCP candidate → responsive `next/image`, priority on slide 1 only, other slides lazy.
- No WebGL/three.js: all 3D is CSS transforms. rAF loops only while their section is intersecting and the tab is visible.
- No content-covering startup loader. Optional logo reveal is non-blocking, short and reduced-motion-safe.
- Aim for cut-outs ≤120 KB when visual quality permits; responsive dimensions and transparent WebP/PNG through the media pipeline. Self-host Manrope/Inter Latin+Latin-ext and Vazirmatn, preload only critical faces.

## 10. Copy & data in the prototype

All copy, product names and USD prices are demo data from `prisma/style-seed.ts`. Placeholders in `[ ]` (tax note, size-guide values, reviews, material/care) must come from admin data. Coin balances and order numbers are illustrative. Real AI output cannot be simulated with setTimeout and a preselected photo. See the scene contract for real market prices, exact sizes, image/product matching and admin synchronization.
