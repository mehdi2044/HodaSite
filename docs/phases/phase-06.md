# Phase 06 — Finance Core: Purchase Orders, Landed Cost, COGS, Ledger, Expenses, Partners, Margin Dashboard

## Goal
Owner sees true profit per product/order/market and partner capital, with alerts. Management accounting (not statutory).

## Scope
1. **Ledger core** (double-entry-ready): `Account` (chart of accounts seeded: cash/bank per market currency, inventory, COGS, sales, shipping income/expense, customs, tax collected, fees, expenses categories, partner capital/draws), `JournalEntry`/`JournalLine` (each line in original currency + functional TRY equivalent + reporting USD equivalent + rates — D04), auto-postings on: payment approved (sales, tax, fees), shipment cost entered, refund, expense created, capital transaction. Manual journal entry (accountant role).
2. **Purchase & landed cost** (D32: Phase 03 supplies Lot/StockMovement; Supplier and PurchaseOrder still require models and migrations in Phase 06): `Supplier`, `PurchaseOrder` (items, original currency, status, FX snapshot at PO date), receiving → `Lot` + StockMovement IN; landed cost allocation (inbound shipping/customs/other) by weight or value → unit cost per lot in original currency + TRY/USD equivalents; COGS by FIFO (default) or average (setting). Migrate any `defaultPurchaseCost` values into opening Lots.
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

## Persistent ledger foundation — D59
The next delivery adds LedgerAccount (separate from Auth.js Account), JournalEntry and JournalLine with additive migrations. Internal application services post manual journals, reverse a posted journal once, and read an authorized entry. They derive the actor from the real session, apply market permissions, and write audit records in the posting transaction. `finance.journal.post` is an operational accountant permission; the real PostgreSQL role/scope matrix covers post, reverse and read.

Each line retains exact original amounts, TRY/USD equivalents and positive original-to-TRY/USD rates (12 decimal places). Conversion uses four-decimal HALF_UP; a rounding imbalance fails rather than adding a hidden adjustment. Header `fxAsOf` records the supplied manual snapshot time. Account currency/market and per-currency rates must agree. A journal is balanced by original currency and in both equivalent currencies. DRAFT only exists within the creation transaction; deferred database constraints require POSTED at commit. Posted entries/lines cannot be edited, extended or deleted, including direct SQL. A reversal retains the original FX snapshot and exactly swaps every debit/credit; the original stays unchanged. Account deactivation blocks new manual entries but permits exact compensating reversals.

Idempotency is per market/request key with a canonical content-and-actor hash, transaction advisory locking and a unique constraint. A retry rechecks current authorization; a different request/actor using the same key fails. Reversals additionally serialize on the original entry, have a unique original-entry link, and cannot precede it or reverse another reversal.

This is a backend foundation delivery, not a new admin form or automatic accounting recognition. Next slice adds manual-entry/reversal UI and payment/refund posting policy with explicit historical opening/cutover handling. Do not backfill old payments, infer missing exchange rates, or call the transaction report a profit/bank-balance report. Procurement, cost, expenses and partners retain their remaining acceptance criteria.


## First delivery slice — transaction reports (2026-09-12)
After the merged Phase 05b shopping/PWA implementation and automated checks, build the readonly report surface first. Physical phone/HTTPS acceptance remains a pre-release gate under D51/D54; it is not claimed by this slice.

- Route `/admin/finance`; permission `finance.report.view`, checked against each market before reading transactions. CSV is the same authorized dataset with no customer records. D58 moves this permission from reserved to the operational role/scope matrix.
- Group by market and original currency; preserve numeric(18,4) exactly. Paid-order total includes frozen fees and discounts, counted once at `paidAt`. Approved payments use `reviewedAt`. Completed refunds use their record `createdAt`, including refunds of older orders. Store credit is separate from external payment/refund movement.
- Inclusive UTC dates, at most 366 days; no silent row cap. Missing approval dates are excluded from period totals and surfaced as an all-time count. Daily breakdown, private CSV, fa/tr/en and 390px mobile layout are included.
- Net external movement is approved external payments minus completed external refunds for the selected period. It is not profit or bank balance. COGS, functional/reporting equivalents, journals and the remainder of this phase retain their separate acceptance criteria above.
- Verification includes hand-calculated fractional amounts, inclusive/exclusive date boundaries, earlier-order refunds, original-currency separation, large-value precision, formula-safe CSV, real PostgreSQL authorization matrix and three-language accountant browser flows.

- Credit-report basis clarification: return/exchange credits come from `StoreCredit.amount` at `createdAt`, linked through the source return to its original market. A credit-method Refund and its issued StoreCredit count once; direct return credit and exchange credit without a Refund are included. Mutable credit balance and unrelated credits are not substituted. PostgreSQL fixtures verify all three paths and spent balances.


## Admin ledger delivery — D04/D24/D59 (2026-09-13)

`/admin/finance/journal` lists authorized entries by effective UTC date (inclusive, at most 366 days), with explicit 30-entry keyset pages ordered by posting time/id. Detail pages show original and TRY/USD amounts, original rates/timestamps, original/reversal links and no editable posted data. Inactive markets remain visible for historical accounting. The form at `/admin/finance/journal/new` supports one market and one of TRY/USD/CAD/IRT per document; the underlying multi-currency service remains unchanged. Rates are explicitly supplied, never inferred from current quotes.

A read-only server review precedes a deliberate posting confirmation. Server Actions use the maintenance/in-flight gate and existing session-derived, transaction-scoped ledger authorization. A review grants no continuing authority. Confirmation is validated on the server. Known input/permission errors are translated; an unknown posting outcome locks the reviewed payload/request key and permits only the same retry. The form does not persist financial drafts in browser storage. Refreshing/navigation loses a pending in-memory draft; users must check the ledger before creating another entry after an unknown result. A successful post remains successful even if cache invalidation fails.

The readonly permission and posting permission both extend their operational PostgreSQL role/scope matrix to these new surfaces. Browser acceptance covers fa/tr/en at 390px in Chromium/WebKit: unbalanced refusal, review without mutation, explicit post, exact detail, full reversal, restricted market/form access and an intentionally lost post response followed by idempotent retry. This delivery needs no migration and does not enable automatic payment recognition, historic backfill, profit reporting, procurement, costs or partner capital workflows.
