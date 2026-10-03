# Phase 09B — Scenario / Rule Engine + Promotion Foundation

Implemented against docs v1.2 / D-numbers touched: D04, D07, D08, D17,
D24, D31, D55, D60, D69, D70, D71.

Owner-authorized scope: [Issue #53](https://github.com/mehdi2044/HodaSite/issues/53).
The previous preparation is not completion. Work starts from PR #52's merge
`c93cc624212d5028fc5bea82b357de9f56f79b95` on
`phase/09b-scenario-promotion-engine`. No other executor is assigned by this PR.

## Delivery sequence and current status

1. **Implemented, offline only:** D71 and strict version-1 contracts; pure rule
   evaluation with explanations, selected/excluded merchandise, deterministic
   priority/stacking, currency-safe allocations, percentage/fixed/shipping,
   same-pool buy-X-get-Y and spend-X-get-Y. Input usage/coupon evidence is an
   estimate, not a redemption guarantee. Unit tests exercise invalid inputs,
   exact money, isolation, limits and allocation conservation.
2. **Pending:** additive Program/Revision/Promotion/Coupon/usage/order-discount
   schema, constraints, immutable revision/audit/snapshot evidence and indexes.
   Preserve existing orders/media and keep backup/restore compatible.
3. **Pending:** permission-checked, market-scoped server adapters that load the
   existing CRM segment membership/consents from 09A. Never accept raw evaluator
   context or membership/usage claims from a browser.
4. **Pending:** transactional coupon/promotion redemption at order placement;
   fixed lock order, total/per-customer/budget enforcement, idempotent retry,
   and explicit cancellation/expiry/release behavior. Test against PostgreSQL:
   a cap of one and two concurrent checkouts can consume at most once.
5. **Pending:** quoteCart/checkout/cart/invoice integration, explicit DiscountLine
   rendering and immutable order snapshots. Resolve/test fee and tax bases,
   amount rounding and returns/finance allocation before wiring the evaluator.
   Existing item unit prices and historic orders must remain untouched.
6. **Pending:** no-code scenario editor, lifecycle/schedule/group/budget fields,
   coupons (single and batch), simulator and explanations, permission-aware
   access, contextual helper text/safe defaults/examples/warnings in fa/tr/en,
   RTL/LTR and 390px browser tests. Bundle/gift mechanics require precise
   semantics; existing-basket multi-buy does not claim automatic gift insertion.
7. **Pending:** full #53 acceptance matrix, integration/E2E and all current-head
   CI gates. Keep the PR Draft until all implementation and intended commits are
   complete and local checks pass. Do not close #53 or declare Phase 09 complete.

## Required acceptance (not waived by the first increment)

- CA-only minimum basket benefit and rejection in other markets.
- Deterministic priority, mutual exclusions and stacking with correct amounts.
- Clear discount lines in cart/checkout/invoice; no hidden unit-price edits.
- Coupon total/per-customer limits and budgets survive concurrent order placement.
- Versioned definitions and audited mutations; immutable order evidence.
- Explainable simulator using the same evaluation service.
- Decimal/numeric only; no cross-currency arithmetic or float conversion.
- Server permission and market-isolation negative tests.
- Real fa/tr/en admin browser flows in 390px and RTL/LTR.
- Complete CI, including Local/S3 backup/restore, on the latest head.

## Verification and safe operation

For the offline increment, `pnpm test:unit -- tests/unit/promotions.spec.ts` uses
the unit-only configuration and no database. `pnpm lint` and `pnpm typecheck`
remain required. There is no manual UI to test yet; the simulator is pending.
Evaluation has no ambient clock, database, network or coupon-consuming side
effect. Reason codes are an internal API and must be translated by the eventual
UI. Do not expose rejected promotion/segment details on a public route.

No migration, seed, preview sync, restore or deployment is part of this first
increment. Later integration tests use only disposable `_test` databases.
Rollback of the unused evaluator removes files; after persistent evidence is
introduced, rollback must retain that evidence rather than drop tables.

## Outside this phase

Loyalty/tiers/referrals (09C), campaigns/sending/journeys (09D), return/review
expansion (09E), #48 storefront redesign, #49 admin IA redesign, phases 10/11
and infrastructure purchase/deployment are not part of #53. Real-environment
acceptance and owner visual acceptance stay open. D70 merge gates remain active;
Codex never merges its own implementation PR.
