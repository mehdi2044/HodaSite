# Future fitting stages — additional acceptance (plan only)

Owner-requested additions during FR0–FR2. **No FR3–FR6 implementation is authorized.**

## FR5 / FR6: private image security

- Test anonymous, foreign-customer, cross-market, expired/revoked-session and
  deleted/archived-output access; identifiers and storage keys never substitute
  for server-side ownership/entitlement checks. Deny consistently without
  leaking whether another customer's output exists.
- Verify local and S3 paths, short-lived signed access where applicable, correct
  content type, no public cache/CDN/service-worker/PWA/offline caching, no private
  output in public media/search/metadata, and no URL/token leakage in logs or
  referrers. Test expiry/revocation and concurrent access during deletion.
- Preserve existing encryption/key and backup/restore contracts. No private
  image, bearer URL or customer data may appear in review artifacts.

## FR5 / FR6: wardrobe ownership

- Derive identity from an active verified session; reject forged customer IDs,
  foreign look IDs, cross-market and out-of-scope requests in every read/write,
  load/export/archive/restore/delete and image access path.
- Saved looks do not prove purchased ownership. Preserve the distinction between
  an instant saved composition and an actually owned garment/private AI output.
- Exercise request-key deduplication, expected-version conflicts and two-tab
  concurrent saves/updates; no lost update or ownership transfer. Re-resolve
  current Variant/stock/cutout/model references before reuse or atomic cart.
- Feature-off must be enforced by the server and preserve stored data; reenable
  without destructive backfill. Actor without `ai.settings.manage` cannot change
  settings; keep validation, scope, version checks and audit.

## FR5 / FR6: concurrent coin transactions

- Real PostgreSQL tests: two workers replay the same request key and charge once;
  lost response/retry returns the same result without a second debit/reservation.
- Two distinct simultaneous requests against insufficient combined balance allow
  only the entitled spend; no negative unaccounted balance or double grant.
- Race spend against expiry, reward reversal/debt, refund and failed/retried AI
  jobs; allocation, ledger and session transitions remain atomic and idempotent.
- Refund/release occurs at most once; rejected/provider-failed or REVIEW flows do
  not mint coins or silently forgive debt. Test rollback after partial work,
  deadlock/lock ordering, overflow limits and fractional Decimal precision.
- Exercise each permitted role and market scope. UI state or optimistic balance
  cannot authorize spending. Existing immutable financial records and original
  snapshots must remain intact.

Budgeted external AI/payment tests need separate explicit authorization. These
criteria add verification requirements; they do not authorize a new coin model,
provider, cache architecture, permission namespace or data migration.
