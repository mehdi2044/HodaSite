# Phase 05 permission acceptance evidence

Implemented against docs v1.2 / D50, D51, D54, D57, D58.

## Executable contract

`tests/fixtures/phase05-operational-coverage.json` maps all 58 namespace entries. CI fails for missing entries, missing executable files or production implementation of a permission still classified as reserved. The four reserved permissions belong to phases 06/09 and currently have no operation to invoke (D58); their full role/override/scope decisions remain tested. They must acquire real operational rows when implemented.

| Suite | Real surface | Cases |
|---|---|---:|
| phase05-global-action-matrix | 25 mutation permissions; posted FormData and direct crafted FormData | 1,800 |
| phase05-read-matrix | 12 read permissions; server pages, forged route queries and guarded cost service | 864 |
| phase05-privileged-matrix | 6 backup, upload, receiving and notification permissions | 432 |
| phase05-market-action-matrix | 11 resource permissions across TR and IR | 396 |

Seven seeded roles, an override user and an anonymous session participate. Forged payloads use the real seeded owner ID and a valid TR market ID against IR resources, so a handler accidentally trusting those fields cannot pass. The override actor is warehouse with an explicit brand-write allow and order-view deny. Global operations reject market/category/section-only grants. Resource operations use a TR grant against real TR and IR targets. Each positive mutation must succeed and persist; each denial compares PostgreSQL row digests before/after, including inserts, updates and deletes without audit. Test fixtures are prepared before snapshots. Permission checks, Prisma, transactions, validation and mutation gates are real. Session and Next request context are supplied by the harness. Notification tests use the no-op provider; uploads use local test storage. Restore positives use newly enrolled fixture owners with real password/TOTP checks; production replay protection remains active.

A server action invocation is the UI/server-action boundary specified by V-4; the second invocation bypasses UI constraints. These are not browser click tests. Existing Playwright security, order, shipping, invoice and return flows remain required in CI. Private invoice fixture bytes verify access/response integrity only; trilingual invoice rendering has separate visual proof and browser tests.

## Resource existence policy

- Bank-account changes scope the database lookup by both ID and authorized market; a forged TR market cannot reassign an IR account. Unknown and inaccessible targets both return `FORBIDDEN`.
- Admin order/shipping/return services throw the same `ForbiddenError` for inaccessible and nonexistent records. Actions either propagate it or return the stable `FORBIDDEN` error, never a successful response containing filtered private data.
- Admin server pages stop rendering via Next redirect or not-found before exposing private content. A redirect is not counted as a successful authorized read.
- Private invoice download returns an empty 404 with `private, no-store` for missing and unauthorized records. Authorized downloads return the exact private bytes with no-store. Customer/guest ownership remains separately tested.
- Session revocation selects own sessions or globally authorized targets and uses a uniform forbidden error for unknown/inaccessible IDs. Revoking one's own session requires a session, not the permission to revoke others.
- An anonymous HTTP upload returns 401; an authenticated denial returns 403. Direct actions use their established typed unauthenticated errors. Validation failures never satisfy an authorization assertion.
- Costs are a separate guarded query. The inventory page also requires `inventory.view`; an accountant with only cost-view can pass the guarded cost service but cannot open the inventory page. No cost table is emitted to a warehouse-only user.

## Release evidence

PR #23 previously passed all required gates: 3,118 unit/database tests, 67 browser tests, Docker image and LocalStorage/S3 backup/restore runtime. PR #24 adds the operational matrices and the session privacy/cost guard fixes; its latest-head CI results are the authority for acceptance. No local PostgreSQL, physical-phone installation, production HTTPS or independent off-site restoration result is claimed. D51 retains the latter deployment/device gates before launch. The next product delivery is Phase 05b mobile storefront/PWA, then Phase 06 finance workflows (calculation foundations already merged in PR #20).
