# Phase 06 financial calculation foundation

Implemented against docs v1.2, D04/D24/D32/D55. This is the start of Phase 06 calculation work, not a production ledger or a completed finance phase. It can be developed while Phase 05 gates are being closed; storefront/mobile/PWA delivery remains Phase 05b before the finance dashboard rollout.

The first step is pure validation and allocation: journal lines must balance separately in original, functional TRY and reporting USD amounts. Values use decimal strings and numeric(18,4) bounds; currencies cannot be netted against each other. No exchange-rate API is called, no existing order/payment is modified, and no posting is attached to checkout yet. Reversals swap debit/credit snapshots rather than recalculate historical rates.

Landed-cost allocation conserves the complete inbound cost at four decimals, uses deterministic largest remainders for value/weight allocation and returns each line's total allocation, rounded per-unit cost and explicit per-line rounding remainder. That remainder must be carried into the future persisted accounting design, not silently discarded. Zero/negative weights, duplicate item IDs, invalid quantities and non-finite values are rejected. This module does not choose a tax or statutory policy.

Next: immutable ledger schema with idempotent source-event keys; authoritative persisted FX snapshots; payment/refund/shipment postings and compensating entries; purchase receiving/lot linkage; scoped accountant UI and hand-calculated reconciliation. The current Auth.js `Account` model must not be repurposed as a chart-of-accounts table. Ledger/account names need an additive schema decision before implementation.
