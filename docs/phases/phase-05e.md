# Phase 05e — Storefront design continuation: department shelves

Owner authorized continuation of the reviewed plan on 2026-10-12 (Istanbul): resolve pending delivery bookkeeping, then improve the complete storefront and admin experience before real-device/release acceptance. This first design slice implements the previous request for five sample products in each of Women/Men/Kids/Accessories and keeps the look studio as one part of the shop.

## Scope

- Keep the shared header and the existing editorial campaign layout.
- Four separate CMS category ProductStrip sources, each with five products in the untouched demo composition.
- Category image/title and canonical market/locale “view all” link. Two cards visible in a keyboard-focusable native mobile scroll region; five columns on desktop.
- Place the prepared-look studio after normal department shopping, not at the start of the homepage.
- Reuse current catalog media, ProductCard, exact price formatter, wishlist and CMS controls. No new visual provider, schema, business rule or commerce path.
- Preserve single-field merchant edits, reordered sections, market overrides and deleted homepages. Explicit optional CLI only updates recognized untouched demo composition, never performs a general seed.

## Acceptance

- FA/TR/EN: all four departments show five real catalog cards in the seeded test shop; category and product navigation preserve the current market.
- Fifth product remains reachable at 390px; the page has no horizontal overflow at 390/1280px; catalog images load and prices continue through the existing formatter.
- The look studio follows all four department shelves.
- Upgrade is revision-guarded/idempotent and does not replace merchant copy/order/limits or commercial records.
- Local lint/typecheck/unit evidence and current-head CI are recorded in the PR. Physical-phone acceptance and final design approval remain open (#48/#49).

## Next design slices

Product/category detail, cart/checkout/account consistency; admin information architecture and visual polish. These are not completed by this homepage slice. General Phase 09C–11 and real publication remain separate.
