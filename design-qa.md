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
