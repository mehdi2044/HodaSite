# Department shelves — visual QA (2026-10-12, Istanbul)

final result: passed

Scope: isolated visual slice only.

## Comparison evidence

Source visual truth: the previous homepage at PR57 head `e962754`, server-rendered with the same fixture catalog, fonts and CSS as the implementation. This is a continuation of the existing design, not pixel matching to a new mockup. The intentional differences are four category shelves of five products, their portrait headings, native mobile scrolling and the studio's lower placement. The shared header was not changed and is outside this isolated component capture.

Source and implementation are together in each browser capture:
- `docs/reviews/phase-05e/fa-mobile.jpg`: Persian RTL, 390 CSS px per frame, 1:1 scale.
- `docs/reviews/phase-05e/tr-mobile.jpg`: Turkish LTR, 390 CSS px per frame, 1:1 scale.
- `docs/reviews/phase-05e/en-desktop.jpg`: English LTR, 1280 CSS px per frame, scaled equally to 620 displayed px (620/1280). The desktop comparison is for overall structure; readable typography and prices are inspected separately in the unscaled mobile captures.

Combined capture dimensions are 1348 × 926 pixels for FA/TR and 1341 × 921 pixels for EN. Each source/implementation frame uses the same CSS viewport, density and display scale stated above. The captures include the comparison canvas; both frame sides have the same scale and device density. Mobile usable document width is 375px after the browser scrollbar, with no document overflow. Desktop usable width is 1265px with no document overflow. Source contains the previous mixed “new arrivals” strip; implementation contains department-specific strips. That content/order change is intended. Studio rendering and wishlist hydration are omitted/mocked in the fixture. Actual `HomepageBlocks`, `ProductShelf`, `ProductCard` and `ResponsiveImage` produce the inspected markup; fixtures replace database/pricing calls. The report proves visual rendering, not commerce/database behavior.

## Required surfaces and findings

- Fonts/typography: original self-hosted Inter and Vazirmatn retained. Persian computed font is Vazirmatn. Department headings are clearly larger than card copy, with readable mobile names and exact-format prices; no clipped text was observed at rest.
- Spacing/layout: portrait and heading align using logical layout; two full mobile cards and a native scrollbar show the browsing affordance. Desktop has five equal tracks, with no rail overflow. All four sections contain five cards. Parent document widths match client widths.
- Colors/tokens: existing warm background, text, merchant accent, borders and framed-image shadows retained. Keyboard focus remains visible on the native rail.
- Images: existing disclosed demo media reused, with original subjects and product crops. Loaded card images have nonzero natural width; no broken images remained in the final captures. No replacement artwork was generated.
- Copy/content: existing product names, demo disclosures, prices and locale/market product links retained. The demo campaign now describes all four departments; merchant copy is guarded from automatic upgrade.

No actionable P0/P1/P2 visual finding remains. Before final capture, the temporary fixture's extra card wrapper was removed to preserve the actual direct-child CSS structure, and its image/font serving was repaired. Those were fixture preparation failures, not production design iterations. No production visual fix was made after the first valid combined comparison.

## Interactions and limits

- Browser QA: native rail focused and scrolled with ArrowLeft in Persian; tab navigation to the fifth product moved the horizontal position to -516px (335px client / 852px scroll width). Locale comparison controls were exercised. Canonical category/product hrefs were inspected in the accessibility tree.
- Console inspection: observed errors were extension metadata messages, not application errors. The static fixture has no hydrated commerce runtime.
- Existing reduced-motion/fine-pointer guards are unchanged; their actual behavior remains covered by the existing real-route E2E suite.
- Local lint, TypeScript and 4,117 unit tests pass. Three database-backed browser cases were added for department counts, category navigation, loaded images, fifth-product navigation and studio order. PostgreSQL and real-route browser execution remain CI gates; no local backend success, physical-phone acceptance or owner approval is claimed.

Implementation checklist: run current-head CI and automated review; obtain owner design review; then continue product/category/cart/account/admin design. This page slice does not close issues #48/#49.

---

# Editorial depth continuation — visual QA

The owner accepted the PR #44 upper-page composition and requested creative three-dimensional detail in the continuation. This slice preserves that header/hero and extends its framed imagery to categories, products and the existing CMS service strip. There is no supplied lower-page mockup; this review checks visual coherence and usability, not pixel equivalence to an invented reference.

- Actual `HomepageBlocks` and `ProductCard` were server-rendered with catalog fixtures and the repository CSS/fonts. English desktop (1280px), Persian mobile (390px), and Turkish mobile were inspected in the browser. The fixture harness is not evidence of database or hydrated commerce behavior.
- Categories retain full subjects, warm surfaces, readable labels and two aligned mobile columns. Desktop alternates frame height, with restrained perspective on hover/focus. The observed hovered plane used a 3D transform while its siblings remained static.
- Product cards retain color swatches, image disclosures, price and product links. The wishlist remains a separate 44px button over the photo; the real interaction is covered by the new database-backed browser tests, not the static harness.
- Mobile DOM measurements showed equal scroll/client widths; no horizontal overflow. Persian product text and prices remain readable; labels use logical spacing. Existing merchant content and colors are unchanged. No invented trust claims or product imagery were introduced.
- Motion runs only for fine-pointer hover and `prefers-reduced-motion: no-preference`. Coarse touch and reduced-motion users receive the same static layout. No pointer listener, canvas, animation loop, extra dependency or image request was added.
- Browser console inspection showed only historical extension-metadata errors, not an application error. Required real-route checks, mobile screenshots and reduced-motion/wishlist assertions run in CI on the final PR head before merge.

Visual review result: passed. Production-speed and physical iPhone acceptance remain separate.

---

# Lovable fidelity correction — visual QA

Source: owner-supplied Lovable screenshot and the project's latest screenshot (`lovable-design.png`, 1920 × 1080). Target: the spatial hero's layered composition, offset display typography and compact header, adapted to the owner's four-department catalog. The existing shop brand, images and palette remain merchant-owned; this is not an exact copy of the women's campaign photography or MODA4 brand.

## Comparison evidence

- Browser-rendered component: `spatial-desktop-final.png`; real `SpatialHeroView` rendered with the current demo catalog, CSS and fonts in a temporary visual harness. CSS viewport 1920 × 900; iframe scaled by 2/3 for capture. Hero comparison region: 1280 × 560 pixels.
- Source normalized from its 1920 × 840 hero region (browser/header excluded) to 1280 × 560. `spatial-comparison.png` stacks both normalized inputs in one 1280 × 1120 comparison. This is the combined input used for review, not separate remembered screenshots.
- Mobile: `spatial-mobile-final.png`, 390 CSS px, Persian/RTL, 1:1 capture. No mobile source was supplied; checked responsive behavior rather than claiming pixel fidelity.
- Full header: `spatial-full-desktop.png` (1280 CSS px) and `spatial-full-mobile.png` (390 × 844 CSS px). The actual async Header and its real child components were server-rendered with fixture data; no substitute header markup. The temporary harness proves rendering and native disclosure target areas only; its fixture links do not prove commerce. Database-backed navigation is separately verified by the required CI Playwright suite before merge.

## Findings and iteration history

1. **P1 — equal-card grid replaced the source composition.** Removed equal grid geometry. The revised rendering has one portrait plane, three floating department planes, offset frames, a three-line title and a plain arrow CTA. Resolved in the combined desktop comparison.
2. **P1 — display typography lost its hierarchy.** Added self-hosted Bodoni Moda italic for the Latin middle line; retained Inter and Vazirmatn for the shop. CMS-controlled line breaks replace arbitrary wrapping. Persian uses lighter upright emphasis to preserve readability. Resolved in desktop/mobile captures.
3. **P2 — mobile eyebrow overlapped the main photograph.** Replaced percentage-driven mobile picture heights with a stable image stage; re-captured after the fix with all four images loaded. Resolved.
4. **P2 — header density differed substantially.** Main navigation now contains root departments and utilities use a separate compact row. Actual Header render checked at 1280px and 390px. Search, language, market, account, wishlist and cart remain reachable. The utility row is 44px rather than the reference's 28px to keep link hit areas usable. Resolved; the height difference is intentional.

## Focused review

The normalized hero pair was readable at 1280px, including the display letterforms, caption labels, frame offsets and all four subjects; a separate hero crop was unnecessary. Header spacing and controls were checked in the dedicated full-header captures, and mobile text/image separation in the 390px capture. These are structural comparisons: source marketing copy and photographs differ from the current CMS catalog by design.

## Required surfaces

- Typography: hierarchy, line breaks, italic family and RTL emphasis checked. Longer merchant titles fall back to flowing text.
- Layout: portrait position and title/photo overlap compared at the same normalized desktop size. Four-group imagery, larger usable labels and the mobile stage are intentional adaptations.
- Colors: existing DB theme colors retained, including its brighter orange; no undocumented brand reset.
- Images: current demo catalog assets, full face retained, no invented logo/orbit seal, no parallax dependency. Reference campaign photographs differ intentionally from the four-department catalog imagery.
- Copy: inclusive editable campaign title; shop brand and category labels stay in the CMS. No fake location, seasonal claim or concept-site domain was copied into commerce.

## Interaction and console checks

Cloud browser opened the rendered component, verified loaded image dimensions, clicked the men's target in RTL, opened/closed the native mobile menu, opened the cart disclosure and checked the desktop search destination. No application console error was observed; the cloud browser's extension metadata error was unrelated. Real category/history/gallery/locale and mobile control coverage remains in the repository's Playwright suite.

## Remaining checklist

- Full-header visual review completed. Real route/history/gallery behavior and hydrated close/Escape controls must pass the required CI suite.
- Verify all required checks on the final PR head before merging.

final result: passed
