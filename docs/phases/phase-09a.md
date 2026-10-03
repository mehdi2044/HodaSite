# Phase 09A — CRM 360, Consent/Preferences, Segment Builder

Implemented against docs v1.2 / D04, D08, D09, D10, D24, D31, D50, D63, D65, D69.

Owner authorization: Issue #41, `AUTHORIZED — Unattended Night Work: Phase 09A + Safe Local Sync` and `OWNER PRODUCT DIRECTION — Loyalty / Campaign Engine / Storefront & Admin UX`. This narrows tonight's delivery; it does not remove any acceptance criteria from Phase 09.

## Delivery boundaries

- Market-scoped customer profile/contact, paginated orders/returns/wishlist/carts/reviews/activity, internal notes and tags. JWT customer sessions have no stored history; never invent one or expose tokens.
- Explainable historical gross CLV, AOV and configurable RFM/churn. Decimal calculations use paid SALE order USD snapshots, exclude CANCELLED and exchange orders. Refunds remain separate; the metric is not net revenue, profit or predictive CLV. Four ascending thresholds per R/F/M and a churn day threshold are market configuration. No configuration means unclassified, never a hidden business default.
- Five independent marketing channel choices per market with immutable events, timestamp, source and session-derived actor. Absence and unverifiable legacy JSON do not authorize marketing. Phase 08 browser analytics choices and transactional stock alerts remain separate purposes. No caller-provided IP accepted or retained.
- Authenticated preference center, encrypted/purpose-bound/expiring email unsubscribe link with explicit confirmation; old consent-version links cannot reverse a later opt-in.
- Reviewed export and deletion/anonymization request state machines. No automatic deletion, anonymization or financial mutation. Approving deletion does not claim fulfillment. Private authenticated export parts contain customer-owned data only, never internal notes, credentials or private financial internals. Historical Order shipping/billing snapshots remain separate from the current saved Address book. Address has no marketId: export its session-owned records across countries with explicit contact/address fields and timestamps, without id/customerId; paginate them within the same export parts.
- Versioned saved AND segments: market, locale, paid count/value, AOV, last paid date, purchased category, tags, channel consent. Parameterized SQL, strict validation, bounded rules and paginated minimized audience. Category uses current catalog classification; date comparison is midnight UTC. SQL count/preview share a repeatable-read snapshot and statement timeout.
- FA/TR/EN, RTL, mobile, loading/empty/error states and contextual explanations. One permission-aware CRM navigation entry; no wider admin redesign.

## Acceptance

- Additive migration preserves prior data; fresh migration/seed and upgrade exercised only in isolated test databases.
- Negative permission/market/customer identity, consent opt-out, token tampering/expiry/purpose, revision races, immutable evidence, non-destructive review and private export tests.
- Segment results agree with SQL ground truth; metrics deterministic; query/index review recorded.
- Production build, lint, typecheck, complete unit/integration and mobile browser flows; required `checks`, `docker`, `docker-runtime` green on PR head, plus Windows tooling.
- Backup/restore proof remains in isolated ops runtime CI. Preview update preserves volumes and uses PR46 only; test fixtures never touch its database.

## Explicitly deferred

Promotion/coupons/quoteCart discounts, loyalty/points/tiers/referral, campaign or journey sending, provider integrations, push delivery, return portal expansion, review Q&A/AI summary, Phase 10/11, hosting/deploy and storefront/admin redesign. Stop after the 09A completion report; do not start 09B.

## Durable owner product direction

See [growth architecture backlog #47](https://github.com/mehdi2044/HodaSite/issues/47), [storefront design #48](https://github.com/mehdi2044/HodaSite/issues/48), [admin IA/UX #49](https://github.com/mehdi2044/HodaSite/issues/49). These remain open requirements, not authorization to implement them in 09A.

Future growth programs must be optional and configurable: named/versioned scenarios and groups, WHEN/THEN condition/effect rules, seasons, rolling/calendar windows, priority/stacking, per-customer/global limits and budgets, preview/simulation and explanations, draft/scheduled/active states, frequency/quiet-hour governance. Ordinary changes must not require deployment. Future loyalty has immutable ledgers and refund reversal; no silent recalculation of historical awards. Extensible segment definitions may later include tenure, brand/product, birthdays, acquisition, tiers/referrals and new activity dimensions. 09A only implements the explicitly listed foundation fields.

Storefront visual satisfaction is approximately 30%; it is not finally approved or production-ready. Admin navigation/appearance likewise awaits a separate audit, visual iteration and explicit owner acceptance. Both redesigns must preserve commerce, accessibility, SEO/PWA/performance and all languages/markets.
