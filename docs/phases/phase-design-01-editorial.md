# MODA4 — Curated looks and magazine

Implemented against docs v1.2.1 / D-numbers touched: D23, D24, D31, D40, D44, D64, D70, D74, D77, D78, D80, D81.

| Reuse | Extend | New |
|---|---|---|
| Media and catalog storage, market-aware prices and quotes, Cart's atomic scene add, CMS permissions and AuditLog, instant fitting cutouts | Market SEO routing, storefront entry points, fitting preset resolution | Stable editorial identities, immutable approved content revisions, ordered catalog references and weekly assignments |

The local base is M1 `ba6c083`, stacked above PR89. The current homepage JSON and its approval workflow remain available. Drafts and published content have separate revision identities. A request resolves the latest approved revision whose start time has arrived, then checks its market visibility. Scheduling always requires explicit publish permission. Weekly assignments are resolved by UTC instant, entered in Istanbul civil time, and protected against overlapping ranges per slot.

The migration is additive. An older app can run against the extended schema with its content left in place. Back up the isolated PostgreSQL copy before applying the migration. Keep the backup, checksum and restore rehearsal result. A rehearsal restore uses a separately named database. Take a fresh backup before any later authorized deployment. If rollback is necessary, revert the app image and retain editorial rows and underlying product, stock and order history.

Bulk entry design: use two UTF-8 CSV sheets (or workbook tabs), one for localized looks keyed by stable slug and one for ordered items keyed by slug + SKU. Resolve all references against existing catalog/media and market scope. Return line-numbered errors and an explicit diff in dry run; write all accepted changes as draft revisions in one guarded transaction. Confirm against the input digest and current revision versions, use a uniqueness constraint for position/product, and record the actor and batch ID in AuditLog. Publication remains a separate manager action.
