# Phase 09B admin delivery and acceptance

Implemented against docs v1.2 / D-numbers touched: D08, D09, D24, D31,
D69, D70, D71, D72, D73.

## Scope and behavior

`/admin/promotions` adds one permission-aware navigation entry in the existing
admin shell. This is the 09B operational interface, not the separate #49 redesign.
Market-scoped program cards lead to a no-code editor covering metadata, public
FA/TR/EN copy, all eleven condition types, all five supported effects, inclusion
and exclusion selectors, scheduling, lifecycle, priority, grouping, conflict
exclusions, budget and lifetime usage caps. New programs default to disabled Draft
and exclusive-group evaluation. Save requires an explicit confirmation; active,
scheduled and irreversible archive choices have contextual warnings.

Dates in the editor explicitly use UTC and retain sub-minute precision. Decimal
amounts stay strings; integer conversion is restricted to counts/priority. Empty
limits mean unbounded; zero means no capacity. Business definitions, public copy
and notes remain versioned DB data; new UI text uses the existing translation
layer and override mechanism. No permission namespace or data model changed.

Coupon management includes single codes, batches of 1–100 generated codes,
immutable terms, per-customer/total caps and version-checked status changes.
Lost-response save/issuance retries lock the form and reuse the exact original
payload and mutation key. A successful response clears the confirmation. Coupon
status changes are version-checked, not keyed replays. A lost response or stale/
archived reply locks that form and offers a full reload to inspect current status;
it never offers a retry or repeats a change against a new version. Even a matching
current status is not interpreted as proof that the original request succeeded.
Reload also resets the confirmation before any new change.
Duplicate coupon errors and stale revisions are translated, without raw database
errors. Program/coupon/history lists paginate at 25 records.

The simulator selects a nonempty open cart from the authorized market, showing
its customer display name (or guest), language, line count and time. Cart tokens,
checkout addresses, email and raw CRM evidence are not sent to the browser.
Customer-view and segment-management permissions are required in addition to
promotion management. The existing server service loads actual prices/CRM and
explains conditions, conflicts and benefit amounts. An explicit preview checkbox
can evaluate the saved inactive program without changing it; date, coupon,
capacity and other eligibility checks still apply. Input changes clear results.
The interface labels the result as an estimate, not a final checkout total:
validated saved province, city, postal code and selected shipping rule are used
by the same quote service as checkout. Partial drafts remain usable; malformed
shipping fields and unavailable/inapplicable selections are rejected, not silently
replaced with a global rate. Personal/contact fields stay server-side. Missing
address details and final checkout tax can still change the estimate. Unsaved
editor changes must be saved before simulation.

Saved category/collection IDs in conditions, inclusions and exclusions must
resolve to non-deleted taxonomy. A market condition must equal the program
market. Invalid references fail before any version/revision/audit write; taxonomy
remains global. Historical definitions are retained and need explicit correction
before a fresh save. Tests cover stale taxonomy, invalid creates/updates and
deduplicated valid retries. The three locale browser flows also verify the saved
location-scoped, selected shipping amount in the free-shipping estimate.

The public cart and admin simulator share saved-shipping validation. Returning
from checkout preserves its selected shipping benefit; invalid selections stop
the estimate and keep a route to review delivery details. Usage evidence uses at
most four grouped queries for program/coupon total/customer limits, after the
existing locks and database clock. Unlimited or inactive rules need no usage
query. Lifetime and unpaid-release semantics remain unchanged. Customer segment
conditions come only from eligible revisions (or the explicit inactive preview)
and use one parameterized query over a shared customer/paid-order relation.
Membership and market guards remain unchanged; PostgreSQL compares the batch
with individual predicate results over 100 saved segments.

## Bundle / gift boundary

The safe 09B foundation is D71's existing-basket multi-buy: a selected pool needs
X+Y existing units; the cheapest Y are discounted, with ordinary saved item
allocations and returns. Spend steps and category/product/collection selectors
provide the other supported combinations. The editor explains these mechanics.
Automatic gift insertion, a cross-pool gift and a separate fixed bundle price are
not implemented and are not advertised. Issue #53 makes additional bundle/gift
mechanics conditional on a safe explicit contract; D71's deferral is retained.
No new effect or inventory semantics are introduced by this UI increment.

## Verification

Final local run: 132 files / 8,714 unit and PostgreSQL tests passed, including
required coverage thresholds (99.49% lines over the configured money/pricing/fees/
inventory targets, not whole-project coverage). ESLint, TypeScript, production
build and backup guards passed. All three FA/TR/EN Chromium flows passed at 390px;
rendered screenshots were visually self-reviewed. Remote evidence belongs to the
current PR head and is not inferred from local results.
New tests exercise form money/UTC/defaults/confirmation, every effect,
translation-key completeness, direct authenticated actions and read services,
anonymous/inactive/denied/wrong-market users, pricing-only simulator denial,
market isolation, retries and stale revisions. The browser spec covers three
languages at 390px, create/edit, single/batch coupons, a committed request with a
lost response and identical retry, non-consuming Draft preview, inactive-rule
explanation, lifecycle change, RTL/LTR and horizontal overflow.

The 2026-10-07 review follow-up extends all three locale flows with a lost request
before commit, lost pause/archive responses after commit, and a second tab's
successful mutation followed by a stale form submission. Assertions check the
locked form, reload recovery, actual database status/version and exact audit count.
Fresh execution results for this follow-up belong to PROGRESS and the PR head;
the earlier local results above do not validate these added scenarios.

Technical self-review and automated checks are not independent human review.
Physical-phone/HTTPS and owner visual acceptance remain open under D51/D70.
Remote current-head CI must include Local/S3 restore and the D70 review gates.

## Data and recovery

No schema, migration, provider, dependency or backup-format change in this
increment. All test writes use disposable `_test` databases; no Preview sync,
reset, live activation, deployment or customer-data edit. Existing D72 additive
migration and D73 allocation-aware recovery contract remain mandatory. Never
remove immutable promotion/order evidence when rolling back compatible code.

Catalog dropdowns show the first 1,000 rows in stable ID order; saved references
outside that set are preserved and labelled. Larger catalogs need paginated
search before using those selectors at scale. This does not truncate stored
rules or broaden an existing program on save. CRM audience-wide forecasts are
not invented; the simulator estimates only its selected cart.

The second 2026-10-07 review follow-up limits product options to non-deleted
products assigned to the selected market. Server saves check all product
conditions, inclusions and exclusions against that same assignment; foreign,
deleted or missing IDs fail without a revision/audit write. Shared products remain
valid when assigned to this market. Categories/collections remain global taxonomy.
Old invalid references are retained in immutable history but must be corrected
before saving a new revision; they are never silently removed. The D73 tax
correction separately excludes absorbed shipping from the recomputed tax base.
Current-head verification for both fixes is recorded in PROGRESS and PR #54.
