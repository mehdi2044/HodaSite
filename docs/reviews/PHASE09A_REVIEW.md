# Phase 09A technical review

Implemented against docs v1.2 / D-numbers touched: D04, D08, D09, D10, D24, D31, D50, D63, D65, D69.

Delivery: [PR #50](https://github.com/mehdi2044/HodaSite/pull/50). The PR and Issue #41 completion report record the final source SHA, CI run and merge SHA. This is implementation-agent self-review plus automated verification, not independent human review or owner visual acceptance.

## Data and recovery

`20261003010000_phase09a_crm` adds nine CRM tables, restrictive foreign keys, indexes, validation constraints and immutable evidence triggers. It does not rewrite customer, order, payment or inventory data. Applied migrations were not edited. Existing financial/custom search SQL remains intact; a schema-diff diagnostic was read only and was never applied.

The existing preview was synchronized from `ba8f174` to PR46/main `86c07d0`, retaining its custom branch and personal untracked audit file. App/ops images were rebuilt and recreated, with no volume removal, reset, seed or destructive restore. The original 102-table pre-sync fingerprint matched the prior stabilization fingerprint. A fresh backup and verification in a scratch database succeeded. Backup bookkeeping itself creates legitimate operational records. Offsite storage is not configured; this is not a live offsite-recovery acceptance claim.

09A migration, seed, integration and browser fixtures use separate disposable `_test` databases. Preview remains on PR46; no 09A migration or fixture was applied there. Rollback means running compatible previous application code while retaining the new consent/request evidence; do not drop the tables or restore over a live database. Existing ops-only recovery and CI Local/S3 restore boundaries are unchanged.

## Security and privacy

- Every admin operation derives the actor from its authenticated session, checks its permission and market, and validates input. Notes/tags also require customer-view membership. A known foreign customer ID cannot grant access.
- The seven-permission matrix exercises owner, scoped grant, wrong market, explicit denial, inactive user and anonymous actor against actual domain operations. Separate tests cover missing note/tag/export grants, forged actors, private exports and cross-market data.
- Consent absence never authorizes marketing. Legacy unverified JSON is retained but not read as permission; analytics consent has a separate purpose. Concurrent first writes serialize on the customer row; evidence is append-only. No IP is collected.
- Unsubscribe uses encrypted, purpose-bound, expiring, consent-version-bound tokens and POST confirmation. A stale link cannot reverse subsequent opt-in. No campaign sender exists.
- Export approval needs both privacy-review and export permission. Downloads additionally require the same authenticated customer and approved request, with private/no-store headers. Contact, whitelisted historical shipping/billing address fields and owned activity are paginated; notes, credentials, tokens, receipts and banking snapshots are excluded. Deletion approval records review only, never destructive fulfillment.
- Segment revisions use optimistic version checks. Metrics settings use a transaction lock so concurrent audit records retain the correct prior definition. Audit entries avoid copying notes or customer contact into general logs.

## Query and UX verification

Segment count/member queries use the same parameterized predicate and repeatable-read snapshot, at most 12 AND conditions, a five-second statement timeout and pages of 25 minimized members. Scope membership and paid-sale aggregates use market/customer indexes; tag storage has a GIN index. Integration compares every supported dimension and intersections with independent SQL, and exercises a 1,000-customer audience with JSON `EXPLAIN ANALYZE`, stable non-overlapping pages and upper page bounds. This is a bounded regression fixture, not a production-scale throughput guarantee. Large offsets and substring customer search remain candidates for later measured optimization.

Historical value/AOV use original frozen USD snapshots and Decimal. Refunds remain separate from gross paid-sale value; cancelled/exchange orders are excluded. Category membership means current catalog classification, and date boundaries mean midnight UTC. RFM/churn thresholds are editable market settings; no configuration means unclassified. No ML, new pricing logic or external senders were added.

Browser flows cover all three locales at 390px, RTL, customer OTP, channel preference/unsubscribe, export/delete requests, admin password/MFA in the test environment, notes/tags, segment preview/save, metric configuration, review and private export. Test selectors distinguish visible forms during streamed navigation, and segment controls have explicit accessible labels. CRM browser assertions use a bounded 30-second semantic outcome budget for streamed refreshes, and OTP setup waits for the actual document navigation and starts in the tested locale/market. A CI trace exposed a separate setup race: changing the market cookie after English/CA login could be overwritten by an in-flight old-market response and redirect the Turkish page to English. The fixture now establishes its market before the first storefront request. No sleeps, skipped assertions or automatic retries were added. Two consecutive fresh-customer rounds (six locale flows) passed locally. Full production CI and backup/runtime gates must pass on the final PR head before merge.

CRM action responses no longer include a redundant server-side path revalidation. These authenticated pages query uncached data, and EngagementForm already refreshes after receiving success. Keeping the mutation result separate from the streamed page render prevents the action pending state from depending on that render. Repeated CI failures persisted with a 30-second assertion budget, so increasing test timeouts alone was not treated as a fix.

Automated PR review identified two corrections: tag reads now require the tag grant (the domain skips the query and the UI hides the section), and private exports include whitelisted order addresses while rejecting unknown/nested snapshot fields. Regression tests cover both; final CI reruns on the corrected head.

## Remaining acceptance

`OWNER_DECISION_REQUIRED`: Preview's existing admin requires the owner's MFA code. Only its login form and protected redirect were checked; MFA was not altered or bypassed. Authenticated admin smoke is covered separately in the disposable environment. This does not block 09A implementation/merge under the unattended authorization.

Phase 09 remains partial. Growth requirements (#47), storefront acceptance (#48, approximately 30% satisfaction) and admin IA/UX (#49) remain open. No loyalty, referral, promotions/coupons, campaign sending, redesign, Phase 10/11 or deployment was started. Stop after the Issue #41 completion report.
