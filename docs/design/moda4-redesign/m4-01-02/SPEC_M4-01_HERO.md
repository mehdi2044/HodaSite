# SPEC M4-01 — Hero composition (MODA4)

> **خلاصه برای مهدی و وی‌بانو**
> متن بنر همیشه روی **سمت خالی عکس** قرار می‌گیرد، نه «سمت شروع زبان». عکس هیچ‌وقت آینه نمی‌شود. برای همین در فارسی، ترکی و انگلیسی ترکیب یکی است و فقط تراز متن عوض می‌شود.
> روی هر لباسی که مدل پوشیده یک نقطهٔ شماره‌دار هست:
> - **کامپیوتر:** نام و قیمت کنار همان نقطه نوشته می‌شود.
> - **گوشی و تبلتِ ایستاده:** زیر عنوان یک ردیف قیمتِ همیشه‌پیدا نمایش داده می‌شود.
>
> عکس لباسِ شناور فقط در کامپیوترهای بزرگ (۱۲۸۰ پیکسل به بالا) و فقط در فاصلهٔ خالی کنار مدل نشان داده می‌شود. اگر جایش نشود، نمایش داده نمی‌شود.
> همهٔ این قواعد با یک آزمون خودکار در ۳ زبان × ۴ اندازه × ۴ اسلاید اندازه‌گیری می‌شوند. نمونهٔ مرجع این آزمون را ۴۸ از ۴۸ پاس کرده است.

Status: design contract for the implementation PR. Normative order: this file → `tests/fidelity/moda4-m4-01-02.spec.ts` (H-01…H-07) → `reference/assets/hero.css` + `hero-layout.js` → prototype `template.html` (`.hero/.slide/.copy/.float`).
Owner rules respected: D77 fonts (Manrope 400/300 for Latin display, never italic), D81 (price pins and the purchase form stay **inside** hero slides), SHOPPABLE_SCENES §3 (every worn garment priced and readable without hover; prices only from the resolver; no fake amount), D31 (all content editable).

---

## 1. Root cause in FID-6 (`c0781c3`)

| # | Cause | Where |
|---|---|---|
| 1 | `textSide: "start" \| "end"` is **logical**. In fa (RTL) "start" = right, so the copy sits on the empty right side. In en/tr (LTR) "start" = left = **on the model**. The photo is not mirrored. | `moda4-contracts.ts`, `.moda-hero-slide[data-text-side]` |
| 2 | The decorative cutout is rendered **inside the price pin**, so it sits on the garment point. Result: a coat cutout on the model's coat, and a bag over the title in LTR. | `shoppable-scene.tsx` (`decorations` inside `.scene-pin`) |
| 3 | Pin positions are projected with `scenePointInFrame()` against the **frame aspect** (16:9), but the hero container has a different aspect at every width. At 768 px (portrait, ≈0.82) pins and floats land far from their garments. | `geometry.ts`, hero CSS `aspect-ratio:auto !important` |
| 4 | There is no 761–1279 px composition. The desktop rules apply to a portrait tablet, so the model is cropped at the edge and everything overlaps. | `moda-fidelity-home.css` (only 760 breakpoint) |
| 5 | Seeded pin points are synthetic (`x: .25 + i*.2, y: .46`), not on the garments. | `prisma/moda4-photo-seed.ts` |

---

## 2. Composition modes (decided by viewport, never by language)

| Mode | Viewport | Image | Copy box | Pins | Float | Price strip |
|---|---|---|---|---|---|---|
| **A** mobile | ≤ 760 | mobile (3:4) | bottom, `left/right: 20px`, `bottom: 84px`, over scrim | numbered dots only, hidden if inside/below copy | never | **always** |
| **B** tablet-stacked | 761–1099 **portrait** | mobile (3:4) | bottom, `left/right: 48px`, `bottom: 96px`, body text visible | as A | never | **always** |
| **C** desktop-compact | 761–1279 **landscape** | desktop (wide) | side box on `copySide`, `max-width:min(44%,560px)` | dot + label | never | only if a label cannot be placed |
| **D** desktop | ≥ 1280 | desktop (wide) | side box on `copySide`, `max-width:min(42%,620px)`, `width:fit-content` | dot + label | ≤ 1, in the gutter beside the person | only if a label cannot be placed |

Media queries (one source: `HERO_MEDIA` in `hero-layout.ts`):
- stacked = `(max-width:760px), (min-width:761px) and (max-width:1099px) and (orientation:portrait)`
- floats = `(min-width:1280px)`

## 3. Exact placement per language and size

`copySide` is **physical** and belongs to the photo (`left|right` of the image). Language only changes text alignment.

| | fa (RTL) | tr / en (LTR) |
|---|---|---|
| Copy box (C/D) | `right: 7%` if `copySide=right`, `left: 7%` if `left` | **same** |
| Text alignment | `text-align: right`; Latin title `dir=ltr` but right-aligned | `text-align: left` |
| Eyebrow | Latin, `direction:ltr`, right-aligned | left-aligned |
| Label side | **away from the copy** (copy right → label left of the dot) | **same** |
| Float | at the subject's inner edge, toward the copy | **same** |
| Progress bars / arrows | bars at inline-start, arrows at inline-end | mirrored by the page direction (bars left, arrows right) — they never touch the copy (rule H-02) |

Vertical (C/D): copy `top: header + 7%`, `bottom: 16%`, flex column, `justify-content: center`, gap 22 px (18 px in C).
Title: Manrope **400**, last word or text after `|` **300**, `font-style: normal`, `font-size: clamp(56px, 7.4vw, 128px)` (D), `clamp(52px, 6.4vw, 84px)` (C), `clamp(40px, 12.4vw, 56px)` (A), `clamp(56px, 9vw, 88px)` (B), `line-height: .92`, `letter-spacing: -.025em`.

## 4. Allowed positions for floats and price points

### 4.1 Price points (pins)
- **Data:** `piece.desktop` and `piece.mobile` are **image** coordinates (0..1 of the image itself, not of the frame). The admin drags them onto the garment.
- **Projection (CSS, SSR-stable, no JS):**
  ```css
  .m4-slide { container-type:size; --rw:max(100cqw, 100cqh * var(--ar)); --rh:max(100cqh, 100cqw / var(--ar)); }
  .m4-pin   { left: calc((100cqw - var(--rw)) * var(--fx) + var(--px) * var(--rw));
              top:  calc((100cqh - var(--rh)) * var(--fy) + var(--py) * var(--rh)); }
  ```
  `--ar` is the intrinsic aspect of the image that is actually shown (desktop or mobile, switched by the stacked media query). `--fx/--fy` are the same numbers used for `object-position`. This is exactly `object-fit: cover`, so a point stays on its garment at every width.
- **Dot:** 30 px circle, 44 px hit area (`::after inset:-7px`), number in Inter 600 12 px, paper background, 1.5 px ink ring.
- **Label (C/D):** opaque paper card (`rgb(247 244 239 / .94)`), name 13 px / 500, price Inter 600 13.5 px tabular, never handwritten. It sits 24 px from the dot centre.
- **Label placement order (guard):** away-from-copy, then the other side, then away ±34 px, then the other side ±34 px. If none fits, the label collapses (dot only) and the price strip turns on.
- **A pin is hidden** (and listed in the strip) when its 44 px target is inside `copy ⊕ 16px`, under the header, over the controls, within 8 px of the hero edge, or (A/B) at or below the copy top minus 12 px.

### 4.2 Float (decorative cross-sell cutout)
- Optional, at most one per slide. Admin picks product + colour. The price comes from the catalog. If no price can be resolved, there is **no** float (never a stale or invented amount).
- Mode D only. Width `clamp(120px, 9vw, 150px)`. Caption pill under it, Inter 600 15 px, with a crayon ellipse (decorative SVG, `filter:url(#moda4-crayon-line)`).
- **x:** if `copySide=right`, `left = subject.right − 0.2·w`. If `copySide=left`, `left = subject.left + 0.2·w − w`. The float may overlap the person's edge by up to 20 %.
- **y:** the first slot that fits, from `46%`, `30%`, `58%` of the hero height.
- **Must not** come within 24 px of the copy, cover any pin dot or label, touch the controls, or leave the hero. Otherwise it is hidden.

### 4.3 Price strip
`<ul data-moda4="hero-prices">` inside the copy, above the CTAs. It wraps (no horizontal scroll). Each item: number, name, price. It is a link that opens the D81 purchase sheet. It is visible when the mode is A or B, or when at least one label was collapsed.

## 5. Image positioning
- **Desktop focal x** = `heroFocalX(layout)`: the subject centre, clamped to `≤ .5` when the copy is on the right and `≥ .5` when the copy is on the left. **Focal y** = scene frame `focal.y` (seed: 0 = top-anchored, no head crop).
- **Mobile focal** = scene mobile frame focal.
- The subject box `layout.subject = {x0, x1}` is the person's horizontal extent in the desktop image. It drives the focal point, the float placement and rule H-01. An invisible `[data-moda4=hero-subject]` element renders it for the guard and the tests.

## 6. Measurement rules (shared by guard, admin preview, Playwright)

| Id | Rule | Modes |
|---|---|---|
| H-01 | `copy ⊕ 16px` ∩ subject = ∅ | C, D |
| H-02 | copy fully inside the hero, not under the header, not over the controls | all |
| H-03 | title not clipped (`scrollWidth ≤ clientWidth`), size ≥ 40 (A) or ≥ 52 (others), weight **400** | all |
| H-04 | every visible dot and label: no overlap with copy, header, controls, or another label; inside the hero | all |
| H-05 | float only in D; ≥ 24 px from copy; no overlap with pins or controls | all |
| H-06 | every garment price readable: as a label, or listed in a visible, unclipped strip that has one item per garment | all |
| H-07 | every CTA fully visible and ≥ 44 px tall | all |

Implementations:
- `src/modules/content/hero-layout.ts` → `heroViolations()` (pure; unit-tested in `tests/unit/hero-layout.spec.ts`)
- `tests/fidelity/hero-audit.js` → `MODA4Hero.auditHero()` (DOM)
- `src/components/storefront/use-hero-layout-guard.ts` → applies the same gaps to decide visibility

Run matrix: **fa/IR, tr/TR, en/CA × 390×844, 768×1024, 1024×768, 1440×900 × every slide**.

## 7. Admin editability (D31) — nothing becomes code-owned

| Field | Where | Notes |
|---|---|---|
| Desktop and mobile images, fit, focal | existing scene editor | focal x on desktop is derived from `subject` (§5) |
| Eyebrow, title, body (`subtitle\nbody`), CTA label + target, secondary | existing | the title may contain `\|` to choose the light part |
| Garments (product, colour, preferred size, pin points d/m) | existing scene editor | points are image coordinates |
| **Copy side** (`layout.copySide`: left/right of the photo) | new radio | replaces the "start/end" select |
| **Subject x0/x1** | new number fields (0..1, step .01) | recommended next step: two drag handles on the preview |
| **Float** (`float: {productId, colorId}`) | new select (products with a cutout) | optional |
| Preview warnings | **to implement by Codex (not in the patch):** the admin homepage preview runs `heroViolations()` at the 4 sizes × 3 languages and lists them | message key `modaAdmin.heroLayoutWarning` already added |

**Backward compatibility:** `layout` and `float` are optional. `normalizeHeroLayout()` reads old records: `textSide:"start"` becomes `copySide:"right"`, `"end"` becomes `"left"` (content was authored in fa). No database migration is needed. Saving in the admin writes the new fields.

## 8. Files (see `M4-01-02-proposal.patch`, applies cleanly to `c0781c3`)
`hero-layout.ts` (new) · `moda4-contracts.ts` (+layout, +float) · `moda-hero-slide.tsx` (new) · `use-hero-layout-guard.ts` (new) · `moda-hero.css` (new, imported in `app/layout.tsx`) · `moda-homepage-block.tsx` (HeroSlider branch) · `shoppable-scene.tsx` (`only="purchase"`, so the D81 sheet stays in the hero) · `moda4-hero-fitting.ts` (`resolveHeroFloat`) · `moda4-block-fields.tsx` (admin) · `crayon-filter.tsx` (+`moda4-crayon-line`) · `messages/*.json` · `prisma/moda4-photo-seed.ts` (points on garments) · `prisma/moda4-homepage-seed.ts` (layout, float, titles) · tests.
Old `.moda-hero-*`, `.moda-hero-float` and `.moda-hero-slide .shoppable-scene` rules in `moda-fidelity-home.css` no longer match anything. Delete them in the same PR after the visual check.

## 9. Acceptance criteria (Codex must attach evidence for each)

1. **AC-H1** `MODA4_FIDELITY_TARGET=prototype pnpm test:fidelity tests/fidelity/moda4-m4-01-02.spec.ts` → all green (verified for this package: 19/19).
2. **AC-H2** The same spec against the seeded app → 12/12 hero tests green, zero H-violations. The report lists mode and slide for every run.
3. **AC-H3** `tests/unit/hero-layout.spec.ts` green. The existing `tests/fidelity/moda4-fidelity.spec.ts` stays at its current count or higher. H3, H4, H5, H15 and H16 keep passing.
4. **AC-H4** e2e `moda4-scenes.spec.ts` (D81 purchase from the hero pin) and `homepage-header.spec.ts` stay green.
5. **AC-H5** Side-by-side images (`images/1x-hero-matrix-slide*.jpg` layout): reference left, app right, for all 4 slides × 3 languages × 4 sizes, attached to the PR.
6. **AC-H6** Old content without `layout` renders exactly like the seeded new content in fa, and correctly (no overlap) in tr/en.
7. **AC-H7** Turning a slide's garment unavailable in a market removes its price (`priceUnavailable` / `outOfStock` text). No pin shows an amount that the resolver did not return.
8. **AC-H8 (Mehdi)** On a real phone and a real computer, in the three languages, the title is readable on every slide, each worn garment shows a price, and nothing covers the face or the text.
