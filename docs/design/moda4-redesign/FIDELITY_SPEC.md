# MODA4 visual-fidelity contract (binding for every storefront PR)

> **خلاصه برای مهدی و وی‌بانو:** نسخهٔ فعلی Codex فقط **۳۲ از ۱۳۴** معیار ظاهری نمونهٔ تأییدشده را دارد؛ نمونه خودش **۱۳۴ از ۱۳۴** را دارد. این سند می‌گوید Codex دقیقاً چه چیزی را باید عین نمونه بسازد، و آزمون خودکار `pnpm test:fidelity` بدون قضاوت سلیقه‌ای اندازه می‌گیرد که شبیه شده یا نه. تا وقتی این آزمون سبز نشده، کار ظاهری «تمام» حساب نمی‌شود.

**Status:** owner instruction (Mehdi, 2026-10-16): the storefront must look like the approved prototype. This file is the acceptance contract for that instruction. It does **not** change business logic, data model, money, auth or CMS contracts already built in DESIGN-01; it constrains the *presentation* they produce.

Normative sources, in order: this file → `tests/fidelity/moda4-fidelity.spec.ts` → `prototype/source/template.html` (CSS and markup are the reference implementation) → `SPEC.md`.

---

## 1. What went wrong (measured, not opinion)

Measured on the current stack head (`phase/design-01-r7a-instant-wardrobe`, b5e9c1c), built and seeded locally, 1440×900 and 390×844. Full table: `fidelity/report-codex-b5e9c1c.md`; images: `fidelity/compare/`.

| Area | Prototype | Current app |
|---|---|---|
| Home page length (desktop / mobile) | 6,782 px / 7,567 px | **17,617 px / 13,594 px** |
| Hero | one full-bleed slider, image edge to edge, ≥ 50vw tall | 486×648 photo inside a column with text beside it |
| Below the hero | bands → prism → new-in → fitting ad → shop the look → lookbook → kids → services | every block renders an extra full-size "shoppable scene" (same model photo, price pins, boxed disclaimer); the same photo is visible up to **9×** on mobile |
| Display typeface | Bodoni Moda (editorial, the core of the look) | Vazirmatn/Manrope only — **0 elements** use Bodoni |
| Buttons | crayon fill (SVG displacement filter) + dashed stitch | flat orange pill, no filter |
| Footer | giant MODA4 wordmark (inline SVG) | text footer, no wordmark |
| Kids | pastel world, Fredoka, cut-outs on pastel gradients | standard grid on sand |
| Fitting room | 3D turntable mannequin + garment grid, instant layering | long list of selects next to a photo |

Root causes: (1) D77 replaced the display typeface; (2) DESIGN-01 attached a reusable "shoppable scene" (photo + pins + disclaimer) to every homepage block, so composition was driven by the CMS contract instead of the design; (3) the prototype was re-authored instead of ported, and nothing measured the result against it.

## 2. Non-negotiable rules

1. **Port, do not reinterpret.** Values in `prototype/source/template.html` (sizes, spacing, radii, colours, font sizes, line-heights, transforms, timings, breakpoints at 1100/760 px) are the specification. Map them to ThemeSettings tokens/CSS variables where D31 requires editability; otherwise copy them. "Similar" is not acceptable where a rule below measures the value.
2. **Composition is fixed by the design, content by the CMS.** Admins edit images, copy, links, product references, prices (from catalog), order of *optional* blocks and on/off. They cannot turn one block into a different layout. A block renders exactly the prototype section for its type — nothing else around it.
3. **Shoppable scenes are not a wrapper.** Price pins live *inside* the hero slides and the Shop-the-look banner only (prototype `.float` notes and `.hot` hotspots). No block may append a second full-size photo, a pin overlay or a boxed explanatory paragraph. The demo-image disclosure is one small chip per image (prototype `.demo`).
4. **Typography (needs a D77 amendment by Vee, approved by Mehdi):** Latin display headings and the logo world = **Bodoni Moda** (roman + italic, self-hosted, latin + latin-ext which covers Turkish ğ ş ı İ); Persian = Vazirmatn (light 200–300 for headings, as in the prototype); Latin UI/body/prices may stay Inter; hand-written accents = Caveat; mono labels = IBM Plex Mono; kids display = Fredoka. All self-hosted (D26 still forbids Google Fonts). Admin may choose among *these* roles only.
5. **Seeded default = prototype.** On a fresh `prisma db seed`, `/fa` must render the prototype composition with the demo assets (`prisma/demo-assets/v2`, `docs/design/moda4-redesign/assets`). Campaigns, pop-ups, scheduled versions and extra blocks are empty/off by default.
6. **Fidelity hooks are part of the contract.** Every element listed in §3 carries its `data-moda4` attribute in production markup (stable, locale-independent). They are test hooks, not styling hooks.
7. **Motion & a11y stay as specified in SPEC.md §8–9** (reduced motion stops autoplay/rotation; real buttons/links; contrast). Fidelity never overrides accessibility; if a prototype value fails a11y, fix it in both places and note it in the PR.

## 3. Hook contract

| Hook | Where | Prototype element |
|---|---|---|
| `data-moda4="announcement"` | rotating top bar | `.ann` |
| `data-moda4="header"` | sticky site header | `header.hdr` |
| `data-moda4="logo"` | header logo link, **inline SVG** (hanger hook path animatable) | `.logo` |
| `data-moda4="nav"` | desktop mega-menu nav | `.navs` |
| `data-moda4="footer"`, `data-moda4="footer-wordmark"` | footer, giant inline-SVG wordmark | `footer.ft`, `.word` |
| `data-moda4-display` | every Latin display heading (hero titles, section accents) | `h1/h2/h3` with Bodoni |
| `data-moda4-kids-display` | kids display headings | `.kids-world h2`, `.kid-hd h1` |
| `data-moda4-cta` | every crayon button | `.cbtn` |
| `hero`, `hero-slide`, `hero-title`, `hero-progress` | home hero slider | `.hero`, `.slide`, first slide `h1`, `.bars` |
| `bands`, `band` | crossing marquee bands | `.bands`, `.band` |
| `worlds-prism`, `worlds-face` | four-worlds 3D prism | `.prism`, `.face` |
| `new-in` | new-in rail | `#newRail` |
| `product-card`, `product-card-media` | every product card and its 3:4 media box | `.pc`, `.pc .im` |
| `fitting-ad`, `fitting-ad-rack`, `fitting-ad-mannequin` | rack → mannequin ad | `.fit3d`, `.rack`, `.manq` |
| `shop-the-look` | full-bleed look banner | `.stl` |
| `lookbook`, `lookbook-ring`, `lookbook-card` | 3D lookbook ring | `.ring-wrap`, `.ring`, `.look` |
| `kids-world`, `kids-turntable`, `kids-turntable-item` | pastel kids section | `.kids-world`, `.tt`, `.tt-item` |
| `services` | service strip | `.svc` |
| `plp-grid` | category product grid | `#shopGrid` |
| `kids-header` | pastel kids category header | `.kid-hd` |
| `pdp-gallery`, `pdp-buybox`, `pdp-sizes`, `pdp-add` | product page | `.gal`, `.buy`, `#pSizes`, `#pAdd` |
| `tryon-stage`, `tryon-turntable`, `tryon-mannequin`, `tryon-grid`, `tryon-item`, `tryon-layer` | fitting room | `.tstage`, `.turn`, `#mBody`, `#tgrid`, `.ti`, layer `img` |
| `auth`, `auth-steps` | sign-in/up | `.acct`, `.steps` |

## 4. Measured rules

Implemented in `tests/fidelity/moda4-fidelity.spec.ts`; every rule runs at **1440×900 and 390×844** on home, women category, kids category, product, fitting room and sign-in (134 checks).

- **G1–G7 (every page):** header present and 64–84 px tall; logo is inline SVG, centred on desktop; footer with SVG wordmark ≥ 50% width; paper ground `#F7F4EF` (kids `#FFF9F5`); crayon CTA (`::before` SVG filter + dashed `::after` stitch); no horizontal overflow; display headings in Bodoni Moda (home and fitting must have one).
- **H1–H16 (home):** hero full-bleed; hero ≥ 50vw and ≥ 560 px (mobile ≥ 600 px); ≥ 3 slides, active image covers ≥ 95% of the hero and is top-anchored (no head crop); hero title Bodoni ≥ 56 px (mobile ≥ 40 px); progress bars; exact section order; two rotated bands; prism `preserve-3d` with 4 faces in 3:4; new-in ≥ 4 cards with 3:4 media; fitting ad with rack and mannequin; full-bleed shop the look; lookbook ring `preserve-3d` with ≥ 5 cards; kids world gradient + Fredoka + ≥ 4 turntable items; services; page ≤ 8,500 px desktop / ≤ 9,500 px mobile; no visible full-width photo repeated more than twice.
- **C1, K1, K2 (category):** grid ≥ 4 cards, 4 per row ≥ 1100 px and 2 per row on phones, media 3:4; kids header gradient + Fredoka; kids card media on pastel gradient.
- **P1, P2 (product):** gallery and sticky buy box side by side on desktop; size buttons ≥ 44 px; add-to-bag is a crayon CTA.
- **F1, F2 (fitting):** 3D turntable (`preserve-3d`) with mannequin and ≥ 6 items; picking an item puts a new layer on the mannequin immediately (client-side, no server round trip).
- **A1 (sign-in):** split layout (2 grid columns) on desktop, 3-step indicator.

The prototype passes 134/134 (`fidelity/report-prototype.md`) — every rule is achievable as written. Rules may only be relaxed by Mehdi; record any change in this file and in the test in the same PR.

## 5. How to run

```bash
# self-test: must stay 134/134
MODA4_FIDELITY_TARGET=prototype pnpm test:fidelity
# the app (built + seeded like the e2e suite; or set MODA4_APP_URL to a running server)
pnpm test:fidelity
```

Outputs `test-results/moda4-fidelity/<target>/report.md`, `results.json`, full-page screenshots, and — when both targets ran — side-by-side images in `test-results/moda4-fidelity/compare/`. App paths default to the seeded demo slugs; override with `MODA4_HOME_PATH`, `MODA4_WOMEN_PATH`, `MODA4_KIDS_PATH`, `MODA4_PDP_PATH`, `MODA4_FITTING_PATH`, `MODA4_ACCOUNT_PATH`.

## 6. Delivery and gate

1. **FID-1 shell & type** (G1–G7): tokens, fonts per §2.4, crayon/lace, header, logo, footer wordmark. Add `pnpm test:fidelity` to CI (job after `next build` with the seeded DB, uploading `test-results/moda4-fidelity/**` as an artifact) and make it a required check.
2. **FID-2 home** (H1–H16): remove the per-block scene wrapper (§2.3), port each section, seed the prototype composition.
3. **FID-3 category & kids** (C1, K1, K2).
4. **FID-4 product** (P1, P2).
5. **FID-5 fitting room** (F1, F2) — on top of the existing R7a instant-composition data model.
6. **FID-6 sign-in & profile** (A1; profile visuals per prototype `#pg-profile`).

Each PR: Draft; Persian summary first; attach `report.md` and the `compare/` images for the pages it touches; the rules of earlier FID steps must stay green. A PR that touches the storefront and lowers the pass count is not mergeable. The visual verdict remains Mehdi's (AC-18): green tests are necessary, not sufficient — he approves from the side-by-side images.
