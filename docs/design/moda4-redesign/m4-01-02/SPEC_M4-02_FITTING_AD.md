# SPEC M4-02 — "From the rail to you" (fitting-room ad)

> **خلاصه برای مهدی و وی‌بانو**
> صحنهٔ نمونه عیناً منتقل می‌شود: رگال واقعی با پایه و میله، لباس‌های آویزان که آرام تاب می‌خورند، مانکن خطی، و پرواز لباس‌ها یکی‌یکی از رگال روی تن مانکن. بعد خط اسکن می‌آید، عکس واقعی ست ظاهر می‌شود و نوشتهٔ «Your look is ready ✦» نمایش داده می‌شود.
> - لباس‌ها و مانکن از دادهٔ واقعی فروشگاه می‌آیند: همان cutout و هندسه‌ای که در اتاق پرو استفاده می‌شود.
> - اگر ستی معتبر نباشد، اصلاً نمایش داده نمی‌شود. اگر هیچ ستی معتبر نباشد، به‌جای رگال خالی یا یک عکس ثابت نمایش داده می‌شود یا فقط متن و دکمه.
> - این بخش هیچ قیمتی نشان نمی‌دهد.
> - روی گوشی صحنهٔ جمع‌وجورتری با لباس‌های همان ست ساخته می‌شود که بزرگ‌تر و خواناتر است.
> - در حالت «کاهش حرکت» صحنه بدون هیچ پروازی مستقیم نتیجهٔ نهایی را نشان می‌دهد.

Normative order: this file → `tests/fidelity/moda4-m4-01-02.spec.ts` (M4-02 block) → `reference/assets/fitting-ad.{css,js}` → prototype `template.html` (`.fit3d`, `.scene`, `.rack`, `.garm`, `.manq`, `.scan`, `.reveal`, `.badge-ready`, JS `RACK/SETS/play()`).

---

## 1. Root cause in FID-6 (`c0781c3`)

1. **Empty rack.** The seeded FittingAd looks are `COMPOSITE` scenes created **without `match`** (`prisma/moda4-homepage-seed.ts`, `scene()`). Photo scenes are stamped (`moda4-photo-seed.ts`). `resolveShoppableScene()` returns `pieces: []` whenever `reason` is set (`MATCH_REQUIRED`), so `FittingAdMotion` renders `.moda-clothes-rack` with no children. Confirm with the new admin diagnostics (`fittingLookHidden`) before and after the fix.
2. **No fallback.** The component draws the rack and the white stage even when there are no pieces.
3. **Not ported.** The prototype's scene structure (legs, base, rail, hangers, sway, floor, step label, scan, arched reveal, badge) and timeline were re-authored. The ad also reused the generic carousel controls (numbers, two pause buttons).

## 2. Structure (logical scene, scaled as one unit)

The scene is a fixed coordinate system scaled with `transform: scale(k)`, `k = box.clientWidth / sceneWidth`. It is always LTR (rack → mannequin reads left to right in every language). Only the copy column follows the page direction.

| Element | Wide scene 1100×640 (> 760 px) | Compact scene 720×640 (≤ 760 px) | z |
|---|---|---|---|
| `.m4-step` label | `right:20px; top:10px`, Inter 12 px, `.14em` tracking | `right:12px` | — |
| `.m4-floor` | `left/right:-200px; bottom:20px; h:150px`, radial shadow, `rotateX(70deg)` | same | 0 |
| `.m4-rack` | `left:40; top:70; 560×520; rotateY(18deg); preserve-3d`; rail `top:40 h:8`; legs `h:470` at 6 px from each end; bases 70×8 at −25 px | `left:24; width:300; rotateY(14deg)` | 1 |
| `.m4-garm` (on rack) | `top:28px`, hanger SVG 64×44 (`margin-bottom:-6px`), cutout `width` by slot, `animation: sway 4s` (rotateY −26°↔−20°, rotateZ ±.8°), staggered delays | active look only | 1 |
| `.m4-model` | `left:660; top:40; 420×560` = the store model frame (3:4). Seeded models are the prototype mannequin vector centred in 420×560, so the body lands exactly on the prototype's `.manq` (760…980). | `left:300` | 1 |
| `.m4-fly` (flying, dressed) | created per piece at the rack position | same | slot: BOTTOM/SHOES 5, TOP/ONE_PIECE 6, LAYER 7, ACCESSORY 8 |
| `.m4-scan` | `left:705; w:330; h:3`, accent gradient + glow | `left:345` | 19 |
| `.m4-reveal` | `left:705; top:30; 330×440; border-radius:200px 200px 10px 10px`, `object-fit:cover; object-position:top` | `left:345` | 20 |
| `.m4-ready` | `left:760; top:490`, Manrope 600 26 px, "Your look is ready ✦" (`lang=en dir=ltr`) | `left:380` | 20 |

**Rack slot widths** (prototype values): TOP 118 · ONE_PIECE 110 · LAYER 84 · ACCESSORY 90 · BOTTOM 70 · SHOES 70. Spacing: `x_i = 10 + i·(rail − 20 − w_last)/(n − 1)`.
**Rack content:** wide = union of every playable look's garments (a rich rack, as in the prototype); compact = the active look's garments only.
**Target on the mannequin** = `projectCutout(piece.layer.geometry, modelImage, {aspect:"3:4", fit:"contain"})`. This gives the centre x, top y and width as fractions of the 420×560 box, computed server-side in `resolveFittingAdLooks()`. It is the same geometry the instant fitting room uses, so the ad and the fitting room always agree.

Copy column (prototype `.fit3d .txt`): eyebrow "AI FITTING ROOM" (Inter 11.5 px, `.2em`), h2 Manrope **400** with the light part **300** (title `From the rail|to you.`), body 15.5 / 1.95, chips (one per playable look + "Replay" + an icon-only pause with `aria-pressed`), accent CTA. Grid `minmax(0,.8fr) minmax(0,1.6fr)`, gap 40, `padding-block:96px`. Single column ≤ 1100 px. Background `#EFE9E0`.

## 3. Animation — step by step (one master clock)

All motion uses the Web Animations API from a single start time. A hidden "clock" animation holds the cycle length, so **pause, leaving the viewport (IntersectionObserver ≥ .35) and a hidden tab freeze everything at once**. The step label is read from the clock on `requestAnimationFrame`.

| t (ms) | Step label | What happens |
|---|---|---|
| 0 | `01 — PICK` | reset: rack garments visible and swaying, mannequin opacity 1, reveal/badge 0 |
| 700 + 1250·i | `0{i+1} — DRESS` | piece *i* (sorted BOTTOM → SHOES → ONE_PIECE → TOP → LAYER → ACCESSORY): the rack garment hides, a clone flies for **1500 ms**, `cubic-bezier(.45,.05,.2,1)`: `0%` in place `rotateY(-24deg)` → `22%` lift −70 px, `scale 1.08` → `62%` arc to 55 % of dx, dy−160, `rotateY(200deg) rotateZ(-6deg)` → `100%` on target, `rotateY(360deg)`, scaled to the target width. Hanger fades out at +500 ms over 500 ms |
| last + 1250 + 600 | `04 — STYLE` | scan line top 30 → 470 px, 1200 ms (the prototype said "GENERATE"; no AI runs here, so the label is honest) |
| + 1100 | `05 — YOUR LOOK` | if a final photo exists: dressed garments fade (500 ms), mannequin fades (600 ms), reveal fades and scales `.92 → 1` (900 ms). Without a final photo the dressed mannequin is the final frame. Badge fades in after 400 ms (600 ms) |
| + 3600 | — | next playable look (chips follow), loop |

Cycle for 3 pieces ≈ 9.75 s (prototype identical). Chip click = jump to that look and restart. Replay = restart the current look.

## 4. Mobile, tablet, reduced motion
- **≤ 760 px:** compact scene (720×640) with the active look only. Garments render about 1.5× larger than the prototype's scaled-down wide scene. The copy is above the scene and the chips wrap.
- **761–1100 px:** single column, wide scene.
- **`prefers-reduced-motion: reduce`:** no flight, no sway, no scan, **no auto-advance**. The active look is shown finished (reveal photo, or the dressed mannequin) with the badge and `05 — YOUR LOOK`. Chips switch looks instantly. Required by FIDELITY_SPEC §2.7 and WCAG 2.2.2.
- **Pause control:** always present while animated (WCAG 2.2.2, motion > 5 s): one icon chip, `aria-pressed`, labels `modaHomepage.pause`/`resume`. Never two pause buttons.

## 5. Valid, invalid and empty states (never an empty rack, never a price)

| State | Condition (server, `resolveFittingAdLooks`) | Renders |
|---|---|---|
| **animated** | ≥ 1 look with `reason === null`, ≥ 2 pieces, each with a cutout layer + slot, and a model image with dimensions | full scene. Only playable looks get chips |
| **static** | no playable look, but some look has a valid final photo | copy + CTA + the arched photo with a small "styling preview" chip. No rack, no chips |
| **copy-only** | nothing renderable | copy + CTA only (the reference shows the bare mannequin sketch as decoration) |
| admin preview | any look hidden | dashed diagnostics list: `fittingLookHidden {look} {reason}` with `MATCH_REQUIRED · INVALID_REFERENCE · COMPOSITE_PENDING · TOO_FEW_PIECES · MISSING_CUTOUT · MISSING_MODEL` |

Partially invalid data: an invalid look is skipped; the others still play (reference `?state=partial`). The ad shows **no prices**: none in the prototype, and none are needed. Purchase lives in the fitting room and the PDP.

## 6. Porting guide (prototype CSS/JS → component)

| Prototype | App |
|---|---|
| `.fit3d .wrap / .txt / h2 / .fa / p` | `.m4-fit-wrap / .m4-fit-txt / h2 / .m4-fit-body` (`moda-fitting-ad.css`) |
| `.scene-box` + `fitScene()` | `.m4-scene-box` + `ResizeObserver` setting `--k` |
| `RACK[]` hard-coded | rack from `looks[].pieces` (slot widths §2) |
| `SETS[].items [key,left,top,width,z]` hand-tuned | `piece.target` from cutout geometry + `SLOT_Z` |
| `.manq` SVG | store model image (`look.model`, `ResponsiveImage`) |
| `play()` with `await wait()` | one WAAPI timeline + clock animation (pausable). Timings in `FITTING_TIMELINE` |
| `reveal` `IMG[S.reveal]` | `look.finalPhoto` (PHOTO scene with the same garments, validated) |
| `IntersectionObserver(.35)` | same, plus `visibilitychange` and pause |
| `<img>` | `ResponsiveImage` (unit rule `storefront-no-raw-img`). Flights clone the rack node |

**Seed (root cause fix):** `prisma/moda4-homepage-seed.ts` stamps each COMPOSITE look with `match.fingerprint` computed with **the same JSON as `compositeSceneFingerprint()`** (`{model, pieces:[{id, variants:[{variantId, profileId, version, media, geometry, slot, anchor}]}]}`), without importing `src/` (the ops image rule). The prototype sets become: women = trousers + knit + bag (final photo *Soft Forms*), men = chinos + shirt (*Easy Days*), boys = trousers + cardigan (*Ready to Play*), girls = dress + cap (no matching photo, so the dressed mannequin is the final frame). Each final photo shows exactly the garments in the set.
`tests/integration/moda4-fresh-demo.spec.ts` now asserts `snapshot.fingerprint === scene.match.fingerprint` for composites, and that every look resolves playable in IR/TR/CA. **This must be run against a real DB (not verified in this package).**

## 7. Acceptance criteria

1. **AC-F1** Prototype self-test: the M4-02 block of `tests/fidelity/moda4-m4-01-02.spec.ts` is green (verified: animated 390/1440, pause, reduced motion, static/copy/partial fallbacks).
2. **AC-F2** App (seeded): `data-state="animated"`. Rack ≥ 3 garments (≥ 2 on 390). `DRESS` within 4 s. `YOUR LOOK` within 12 s. Badge opacity 1. No `.moda-price` in the ad. The scene fits the viewport. `data-scene` is `compact` at 390.
3. **AC-F3** Integration: every seeded FittingAd look resolves playable in all three markets. Composite fingerprints equal the server's.
4. **AC-F4** Breaking one look (e.g. archive one of its products) hides only that look. Breaking all looks shows the static photo or copy-only state. No rack is rendered without garments. Admin preview lists the reason.
5. **AC-F5** Reduced motion: no `.m4-fly`, final frame immediately, the selected chip unchanged after 12 s.
6. **AC-F6** Timeline video (or 8 frames as in `images/20-fitting-timeline-1440.jpg`) of the app at 1440 and 390, attached to the PR next to the reference frames.
7. **AC-F7 (Mehdi)** On phone and computer: garments visibly leave the rail and dress the mannequin, the real photo appears, and nothing looks empty or broken in fa/tr/en.
