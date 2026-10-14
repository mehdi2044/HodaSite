# R5 — selected MODA4 catalog and actual purchase path

STARTED 2026-10-14. Stacked from R3b PR72/source6230b72d79340cb0282dec35a66a80d0d4b406a6; main remains8e0b953 and PR60 remains open/unmerged at3242540. R3b current-head runtime/browser evidence is still being finalized; this branch is independent implementation preparation, not release/merge of unfinished dependencies. No merge authorization. Online R0 remains BLOCKED_ENV; owner Windows launch/login/visual/phones and D70 review remain open. Last green Windows candidate is PR71/SHA0eb1ddd with the retained-data handoff.

Implemented against docs v1.2 / D-numbers touched: D09, D10, D24, D31, D44, D51, D66, D70, D74, D77, D78.

## Inventory and scope

Reuse the existing PostgreSQL catalog/search/facets, market-aware Decimal price resolver, category presentation inheritance, actual Variant/media/stock, ProductGallery lightbox, CommerceForm/cart/quote/checkout, wishlist and OTP. Product prices and size/color options stay real; no parallel money/inventory/promotion engine, schema migration, auth/provider change, seed reset or historical edits. PR60/#63 findings remain independent unless actual targeted evidence resolves one; do not cherry-pick or merge all of PR60.

Close these observed gaps: search/collection listings currently omit category-page filters; selected filter state has no removable chips or useful empty reset; PDP initial displayed price can disagree with the chosen color/size because it uses the first active variant; subsequent RSC initial price is not synchronized with the selected actual variant; the selected shared-scene ShopLook is not consumed by PDP/category recommendations; mobile buy controls and desktop stacked gallery need the selected layout; cart drawer currently lacks real quantity/removal controls.

## Behavior and admin mapping

- Category/search/collection filters share existing supported fields and URL history. Preserve query, collection and explicit market; removing a facet resets only pagination/cursor and that facet. Named active chips, reset, keyboard/focus, Back/Forward, empty state and three languages. Show actual size options; a short visible row is presentation only, with all options in the filter form. Existing admin categories/tree/media/presentation, products/variants/colors/sizes/material and collections remain authoritative; no duplicate business settings.
- PDP derives gallery, selected actual variant and initial Decimal formatted price from one choice. User-selected color/size remains explicit and stock/price errors stay visible; expired/sold-out/hidden references cannot bypass server checks. Keep live selection and price consistent across RSC updates without switching size behind the buyer. Named swatches, disabled size styling, lightbox contain, selected stacked3:4 desktop gallery/vertical thumbs and mobile swipe; phone buy bar uses the same real form/action, no duplicate purchase request.
- Shared PHOTO/COMPOSITE ShopLook recommendations use the same current resolver/real-size atomic purchase path as the homepage; legacy prepared looks remain compatible. Never invent a product/size/price, PHOTO confirmation, wardrobe save or AI result.
- Cart drawer quantity/removal use existing authorized customer-cart actions and current quote; show actual variant details and totals/errors. Preserve market mismatch/requote/empty states and existing checkout/order/payment contracts. No production payment/email/AI call.

## Verification and delivery

Meaningful PostgreSQL/quote/stock and permission tests where logic changes; actual browser category/search/collection facets→remove→Back/Forward→empty/reset, PDP selected-color image/size/price→cart/drawer→checkout and stale/invalid variant rejection. FA/TR/EN at390 and desktop; keyboard/Esc/focus, reduced-motion, no overflow, screenshots. Lint/typecheck/full tests/build and current-head four CI jobs; retain Local+S3 restore and all prior domain evidence. Public sample-only evidence, exact SHA/buildUTC; owner data/settings/env/AUTH_SECRET/MFA/volumes remain intact. Separate Draft PR, source/base/dependencies and a protected Windows viewing handoff; no Ready/merge implied by local or old-head green results.

## Existing-field merchandising choice (before implementation)

The actual Product schema has no `isNewArrival` field. The old PDP inferred its badge from a fixed30-day clock and the card exposed no real flag. Reuse existing editable `Product.tags` with the reserved code-contract tag `merchandising:new`; no migration/column or date-derived promise. Add a named admin checkbox alongside ordinary tags, with an explicit form marker for checkbox presence. Generic legacy product payloads retain their existing tags contract; the server still authorizes/audits the existing product save transaction. Card and PDP read the same tag. No product/tag backfill or existing-row overwrite. Verify checkbox save/reload/storefront, removal, legacy payload compatibility and unauthorized-save negatives using real existing paths.
