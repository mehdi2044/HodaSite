# Phase 05c — Editorial storefront and prepared outfit studio

Owner direction, 2026-10-10: retain the existing floating composition as a shop-the-look scene below the primary campaign and inside department pages. Use prepared store models only; no customer-photo upload or paid image generation in this delivery.

Implemented against docs v1.2 / D-numbers touched: D08, D09, D26, D31, D54, D70, D74.

## Scope
- A CMS-configured ShopLook block: translated title/body, department, named prepared looks with a model image and 2–4 product/color references. Reuse eligible looks on category and product pages.
- Model/complete-look selection, floating garment cards, independent size selection, removable pieces, Decimal merchandise total and atomic add of selected pieces to the existing cart. The prepared image represents the named look/color combination; removing pieces does not synthesize an updated photograph.
- Mobile-first RTL/fa, tr/en, keyboard interaction, reduced-motion fallback and existing media/theme/translation editing.
- Five distinct fictional products per root department, additive and idempotent seed, explicit demo artwork disclosure. Preserve existing catalog, merchant compositions and all commerce history.
- Improve category introductions and child navigation, product photo cards, cart presentation and persistent checkout summary while retaining pricing, inventory, payment and guest-checkout behavior.

## Acceptance
- Set selection never calls an image API or consumes credit. No upload control or personal-photo storage.
- Selecting another prepared look changes its image and exact linked products; each piece has visible size selection, quantity one, availability state and a product link.
- One unavailable or wrong-market variant rejects the entire batch; no partial cart writes. Concurrent adds preserve totals and increment cart revision once per accepted batch.
- All merchant copy and look references are editable from existing homepage admin and translated in all three locales. Invalid media/product/category/color references cannot be saved.
- Root department listings include descendants; child links use actual catalog slugs. No invented category filtering.
- Existing theme controls, checkout stages, promotion quote and order snapshots remain authoritative. No schema migration or external AI provider choice.
- Required lint/typecheck/unit checks and new integration/e2e coverage; report which database/browser checks actually ran. Visual acceptance by Mehdi is still required before closing design issue #48.

## Next delivery (not implemented here)
Custom AI outfit generation and weighted credits: welcome/purchase/daily/manual/group rewards, expiration and global spending caps. Provider selection, quality trials, billing and loyalty ledger need a separate specification/ADR. A disabled mock credit balance is not a delivered capability.
