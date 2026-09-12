# Phase 06 — Finance Core: Purchase Orders, Landed Cost, COGS, Ledger, Expenses, Partners, Margin Dashboard

## Goal
Owner sees true profit per product/order/market and partner capital, with alerts. Management accounting (not statutory).

## Scope
1. **Ledger core** (double-entry-ready): `Account` (chart of accounts seeded: cash/bank per market currency, inventory, COGS, sales, shipping income/expense, customs, tax collected, fees, expenses categories, partner capital/draws), `JournalEntry`/`JournalLine` (each line in original currency + functional TRY equivalent + reporting USD equivalent + rates — D04), auto-postings on: payment approved (sales, tax, fees), shipment cost entered, refund, expense created, capital transaction. Manual journal entry (accountant role).
2. **Purchase & landed cost** (data model already exists from Phase 03 — D32): `Supplier`, `PurchaseOrder` (items, original currency, status, FX snapshot at PO date), receiving → `Lot` + StockMovement IN; landed cost allocation (inbound shipping/customs/other) by weight or value → unit cost per lot in original currency + TRY/USD equivalents; COGS by FIFO (default) or average (setting). Migrate any `defaultPurchaseCost` values into opening Lots.
3. **Expenses**: categories, recurring expenses, attachments, per market/none, approval flag.
4. **Partners/Capital**: `Partner`, `CapitalTransaction` (contribution/withdrawal/profit-share), ownership %, statement per partner, "which capital funded which PO" (optional link).
5. **Margins & alerts**: per order/product/variant/category/market: revenue, COGS, fees absorbed, gross margin, contribution; dashboard with period filter, charts; alerts (`SystemAlert`): sale below landed cost, margin < threshold, slow-moving stock (no sales in N days), pricing errors (price deviates > X% from median in category). Alerts never block; shown in product editor too.
6. **Reports**: sales by market/category/brand/time, payment verification time, fulfillment time, returns; CSV/XLSX export; refunds/returns reduce margin correctly.
7. **AI Financial Analyst** is deferred to after Phase 07 (AI gateway); leave a feature-flag stub only.

## Acceptance criteria
- Approving a payment creates balanced journal lines (debits = credits) in market currency and USD equivalent.
- Landed cost: PO 100 pcs at 1000 TRY + 2000 TRY inbound shipping → unit cost 1020 TRY → USD at PO-date rate.
- Margin dashboard equals hand-calculated example in tests; refund adjusts margin.
- Accountant role sees finance but cannot edit products/prices.


## First delivery slice — transaction reports (2026-09-12)
After the merged Phase 05b shopping/PWA implementation and automated checks, build the readonly report surface first. Physical phone/HTTPS acceptance remains a pre-release gate under D51/D54; it is not claimed by this slice.

- Route `/admin/finance`; permission `finance.report.view`, checked against each market before reading transactions. CSV is the same authorized dataset with no customer records. D58 moves this permission from reserved to the operational role/scope matrix.
- Group by market and original currency; preserve numeric(18,4) exactly. Paid-order total includes frozen fees and discounts, counted once at `paidAt`. Approved payments use `reviewedAt`. Completed refunds use their record `createdAt`, including refunds of older orders. Store credit is separate from external payment/refund movement.
- Inclusive UTC dates, at most 366 days; no silent row cap. Missing approval dates are excluded from period totals and surfaced as an all-time count. Daily breakdown, private CSV, fa/tr/en and 390px mobile layout are included.
- Net external movement is approved external payments minus completed external refunds for the selected period. It is not profit or bank balance. COGS, functional/reporting equivalents, journals and the remainder of this phase retain their separate acceptance criteria above.
- Verification includes hand-calculated fractional amounts, inclusive/exclusive date boundaries, earlier-order refunds, original-currency separation, large-value precision, formula-safe CSV, real PostgreSQL authorization matrix and three-language accountant browser flows.

- Credit-report basis clarification: return/exchange credits come from `StoreCredit.amount` at `createdAt`, linked through the source return to its original market. A credit-method Refund and its issued StoreCredit count once; direct return credit and exchange credit without a Refund are included. Mutable credit balance and unrelated credits are not substituted. PostgreSQL fixtures verify all three paths and spent balances.
