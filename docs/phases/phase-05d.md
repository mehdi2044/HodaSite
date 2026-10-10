# Phase 05d — Custom fitting room, coins and wardrobe

Implemented against docs v1.2 / D-numbers touched: D08, D09, D10, D21, D24, D25, D31, D70, D74, D75.

Owner scope: optional custom combinations and variant colors on fixed store models (woman/man/girl/boy), paid fractional usage (example 12.5 coins), daily limits and expiring allowance, welcome/purchase/manual rewards, catalog coin packs with ordinary editable prices, purchased clothing in a private wardrobe, independent locale/market, child Girls/Boys/Baby taxonomy and arbitrary category nesting. Crop the hero without clipping the model head.

Admin owns feature toggle, provider/model/quality, timezone, per-use charge, limits, welcome/daily grants, market purchase reward thresholds, eligible store models, catalog pack amount and manual batch grants. Never accept browser balances, prices, arbitrary image URLs, customer photos or prompt instructions. Only real catalog colors may be purchased; AI preview is illustrative, not a fit guarantee. Existing purchased variants may be used as owned references even when no longer sold; new products must remain active in the current market.

Requests have idempotency keys; selected model/variant IDs are snapshotted before dispatch. All coin spending is serialized and exact. Successful generation charges once; failed jobs refund once. Uncertain remote requests are not automatically retried. Saved looks and output images are customer-private. Coin packs follow existing checkout/payment/stock contracts with zero shipping weight, separately tagged service inventory; no bespoke payment gateway. Payment hooks snapshot grants, exclude coin-pack spending from loyalty rewards and revoke refundable sources. Historical order rows are not backfilled into coin rewards; wardrobe reads owned paid items.

Default off and no live API call during implementation. Tests use a deterministic injected provider only. Connecting the environment key, four approved model images and validating garment fidelity with real paid trials remain operator setup, explicitly distinct from tested integration code.


Unpaid replacement cancellation must release store credit and cumulatively reverse the source sale coins/rewards in one transaction, including partial/nested exchanges; replay is idempotent and spent entitlement becomes debt. Wallet reporting sums spendable grants with PostgreSQL numeric aggregation, preserving all four decimal places above the per-row limit. No historical financial backfill.
