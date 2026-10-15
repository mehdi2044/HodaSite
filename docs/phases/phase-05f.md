# Phase 05f — Product, category, bag and admin design continuation

Owner authorized merging the prior delivery and continuing all four surfaces in order on 2026-10-12 (Istanbul). Extend the existing merchant theme and real page/components; preserve commerce contracts and permissions. This is a design implementation, not final owner approval or production release acceptance.

## Scope and acceptance

- Product: keep real color/size/stock/price selection, gallery/zoom and mobile purchase button. Put description after selection, retain explicit demo-image disclosure in a compact expandable section, and use coherent framed imagery/details/purchase spacing. Verify variant/media/price changes and adding to the real bag.
- Category: canonical breadcrumb, existing category media in a framed intro, readable result/filter toolbar, active-filter count and recoverable empty result. Preserve URL query filtering/sorting/reset/pagination and market/locale navigation.
- Bag: item count, mobile anchor to the real summary, clearer image/quantity controls, exact existing quote/discount/fee/coupon lines, desktop sticky summary and themed empty state. Preserve mismatch/requote, quantity/remove and checkout paths.
- Admin: group the existing server-supplied links, label the most specific active route, search those visible sections only, and offer an in-flow mobile menu with Escape/focus return. All old server permission predicates remain. Move identity/sign-out/alerts to a readable topbar and style current KPI/table/form surfaces. Product names follow the selected admin locale; empty product results are explicit.
- FA/TR/EN, 390/1280px, real keyboard/touch targets, document containment and native reduced-motion behavior. DB UI overrides continue to override base messages; no merchant copy or settings writes.

## Constraints and evidence

No schema, auth, payment, pricing, stock, provider or backup contract changes. No new analytics/KPI calculations, global record-search service or fictional shopping state. The navigation search is explicitly for admin sections. UI integration changes go through a new branch/PR; no direct main pushes. Local checks and current-head CI/review evidence belong on that PR.

Capture before/after renders at matched viewports using actual components. Fixture QA proves layout/control behavior only; PostgreSQL-backed navigation, commerce, permission and backup regressions run in CI. Owner visual acceptance (#48/#49), physical-device acceptance, merchant photography and production rollout remain separate.


## Owner homepage review — 2026-10-13

The owner accepts the upper campaign/header but rejects repetition between category navigation and new arrivals, the sparse lower page and stretched footer columns. Continue this design phase; acceptance of the whole shop is still open.

- Replace equal category frames with a responsive editorial mosaic using existing CMS order/limit and merchant media. Support additional roots (up to the existing CMS limit), no-image/empty states, localized labels and visible demo-artwork disclosure. Preserve category routes, image presentation metadata and reduced-motion behavior.
- Give latest-product shelves their own shopping layout with a native mobile rail. Do not fabricate discounts, stock, service claims or product reviews.
- Use the configured brand/tagline and compact footer navigation/contact/social columns; put the existing consent controls inside its closing row without changing consent decisions or loading rules.
- Expose the existing authorized category-image field through the shared media picker. Editing a category must preserve its previously selected cover. No auth/schema/commerce/seed changes.
- Verify category links and pointer/reduced-motion behavior, footer containment/compact contact spacing/privacy choices at 390/1280px in FA/TR/EN, and category-cover persistence through the real admin save flow.

## Owner-authorized completion — 2026-10-13

Complete ADMIN-001 with optional cover clearing and stale-cover recovery; improve daily admin task entry, taxonomy navigation and catalog filter recovery. Deliver the missing sample catalog through a local-preview-only additive operator tool and a pinned PowerShell updater with verified backup. Preserve the approved hero, merchant data and all commercial contracts. No production enablement or general seed. PR60 consolidates the already-included #59/#61 history and targets main directly; the previous retarget-after-#59 sequence is superseded for this delivery. Owner design/device acceptance and D70 merge approval remain distinct.
