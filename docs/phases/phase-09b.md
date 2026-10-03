# Phase 09B — Scenario / Rule Engine + Promotion Foundation

Implemented against docs v1.2 / D-numbers touched: D04, D07, D08, D17,
D24, D31, D55, D60, D69, D70, D71, D72, D73.

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
2. **Implemented; connected to checkout code under D73, not deployed:** D72 additive Program/Revision,
   Coupon, OrderEvaluation, Redemption (immutable DiscountLine snapshot) and
   UsageRelease tables; constraints, audit, immutable-evidence triggers and
   indexes. No old orders/media are rewritten. Local/S3 runtime restore CI
   remains a gate before Ready.
3. **Implemented service boundary:** permission-checked, market-scoped admin
   save/list/single-or-bulk coupons and lifecycle services; CRM 09A membership,
   segment SQL, tags and consent loader. No endpoint accepts raw membership or
   usage claims. Server Actions and the admin interface remain pending.
4. **Implemented transaction adapter and D73 checkout/cancellation wiring:**
   fixed Order/Market/Program/Coupon lock order, lifetime program/coupon limits,
   per-customer caps, Decimal budgets, atomic retry/rollback and append-only
   unpaid-cancellation release. It verifies stored order amounts, never changes
   them, and is not exported as a public action. PostgreSQL tests race two real
   checkouts against capacity one. Cancellation/expiry releases unpaid usage
   before inventory/credit locks; paid usage stays consumed.
5. **Implemented under D73:** opt-in trusted quoteCart evaluation, cart coupon
   persistence, checkout and invoice DiscountLines; original item prices stay
   unchanged. TAX uses net merchandise/taxable shipping; other fee bases retain
   their configured gross basis. Returns and sales attribution consume immutable
   merchandise allocations; shipping income is reduced separately. Existing
   orders without promotion evidence retain their legacy calculation. Three
   locale storefront flows pass in Chromium at 390px; admin flows remain pending.
6. **Backend simulator implemented; UI pending:** read-only saved-cart simulation
   with live server prices, market-scoped CRM and explicit draft-preview mode.
   No activation/redemption side effect; estimates are not checkout quotes.
   Still required: no-code editor, lifecycle/schedule/group/budget fields,
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

For the offline evaluator, `pnpm test:unit -- tests/unit/promotions.spec.ts` uses
the unit-only configuration and no database. `pnpm lint` and `pnpm typecheck`
remain required. Storefront coupon input and explicit discount lines exist;
admin rule/coupon management and simulator UI remain pending.
Evaluation has no ambient clock, database, network or coupon-consuming side
effect. Reason codes are an internal API and must be translated by the eventual
UI. Do not expose rejected promotion/segment details on a public route.

D72 adds migration `20261003160000_phase09b_promotions`. Apply/test only against
disposable `_test` databases while this PR is Draft. Test
`tests/integration/phase09b-promotions.spec.ts` with `TEST_DATABASE_URL` set;
use UTF-8, PostgreSQL session timezone UTC and the documented test-only secrets.
No Preview sync or deployment. Rollback must retain persistent evidence, using
compatible code instead of dropping the new tables. This is an implementation
implementation, not authorization to deploy or activate live discounts.

## Outside this phase

Loyalty/tiers/referrals (09C), campaigns/sending/journeys (09D), return/review
expansion (09E), #48 storefront redesign, #49 admin IA redesign, phases 10/11
and infrastructure purchase/deployment are not part of #53. Real-environment
acceptance and owner visual acceptance stay open. D70 merge gates remain active;
Codex never merges its own implementation PR.
