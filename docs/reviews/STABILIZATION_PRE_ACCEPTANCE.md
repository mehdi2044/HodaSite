# Stabilization & Pre-Acceptance

Implemented against docs v1.2 / D-numbers touched: D21, D23, D24, D31, D40, D41, D50, D63, D67, D68.

This is engineering stabilization, not Phase 09. Starting state: branch
`preview/spatial-20260919`, HEAD/origin/main/live main
`ba8f174f1ada1045e257d80e63afb503bbb3ef52`, ahead/behind 0/0, no open PR.
The pre-existing untracked audit plan was left in the original checkout.
Work is isolated on `stabilization/pre-acceptance`. Latest baseline PR45
run 35442952011 passed checks/docker/docker-runtime (identical tree to main).

## Purge commit boundary

Purge rereads the persisted Media under PostgreSQL FOR UPDATE, rechecks retention,
status and kind, and checks ProductMedia, VariantMedia, Category, Color, Receipt,
Invoice, ReviewPhoto, replacement work and pending/running optimization jobs.
It also protects ThemeSettings scalar IDs and Page/Homepage block media IDs,
including drafts and soft-deleted content. Non-public/private kinds and object
namespaces cannot enter generic cleanup. Financial DB guards remain unchanged.

The same transaction deletes the unreferenced Media and writes a deterministic
`media-purge-objects:<mediaId>` Job containing every original/rendition key.
Only after commit may storage deletion start. Constraint failure, outbox failure
or rollback therefore cannot remove any file. No distributed transaction is
claimed: storage failure may leave **unreferenced** objects partially deleted,
but the complete durable cleanup manifest remains, with idempotent deletes.
Crash before cleanup, lost completion acknowledgement and retry do not need a
Media row to reconstruct the work. The existing queue reclaims stale RUNNING
jobs; exhausted FAILED cleanup jobs are re-armed by the hourly sweep. Errors
remain visible in Job/operational health. The next sweep is scheduled even when
an individual purge fails.

FK inserts take KEY SHARE locks. Non-FK brand/CMS writers now lock their media
IDs within their writing transaction too. If a writer wins, purge waits and sees
the committed reference. If purge wins, the writer cannot attach the missing ID.
Locks are ordered by media ID for multi-image writes. These are integrity checks,
not per-usage metadata or a new rendering resolver. Out-of-band SQL/import scripts
must follow the same locking contract and must not reuse system-generated keys.

Existing replacement work is conservatively retained unless DONE. Private
financial/review objects are not generic garbage collection candidates.
No existing media is automatically reprocessed, purged or migrated by rollout.

## EXIF and renditions

Optimize and Replace share one Sharp pipeline. autoOrient dimensions select
non-upscaled widths; encoder OutputInfo supplies the actual width/height and the
manifest key. Tiny images use their actual width. The optional rendition
`width`/`height` JSON fields are backward-compatible with old manifests.
Blur uses the same oriented input. Metadata is stripped from encoded renditions.
Existing wrong historical renditions are not silently rewritten: an authorized
reprocessing operation can correct them later. No original object is changed.

## Runtime and developer setup

.gitattributes requires LF for shell scripts and container definitions. Docker
also normalizes copied scripts and sets executable bits, including entrypoint.sh;
this covers older checkouts/archives as well as fresh Windows clones. No backup
algorithm, provider, Docker socket access or restore boundary changes.
Dev startup no longer automatically migrates/seeds. Installation/generation,
reviewed migrations and first-time demo seed are explicit setup steps.

The reference runtime remains Docker/Node20/pnpm10.15.1. Optional Windows tooling
uses the frozen lockfile and regenerated Prisma client. test:unit never loads
.env and points DB access at a disabled endpoint. Integration tests require an
explicit dedicated database with a name ending in _test. The example is blank;
it no longer suggests the app database. The name guard is an additional guard,
not proof that a mistakenly named production database is safe to use.
CI tests use hoda_test, and a Windows job checks host tooling. Local/S3 runtime
proofs use separate Compose projects; shutdown preserves their volumes until
the disposable CI machine is discarded.

## Data, migration, backup and rollback

No schema migration, data backfill, new table, new enum, provider change or
reset. Existing Job JSON stores the outbox; full pg_dump already backs it up.
No main-preview DB, media volume or private .env is used for test writes.
All destructive fixtures belong to an isolated test database/container.

On rollback, stop cron first: the older application does not know the new cleanup
job type. Keep cleanup Job rows and their payloads, and resume with the fixed
handler; do not delete the outbox or run old unsafe purge. Never restore a Media
row without its corresponding backed-up objects. Full DB+media restore remains
an ops-only operation under the existing maintenance/drain protocol.

## Verification and remaining acceptance

Regression tests exercise references, soft deletion, rollback on outbox failure,
partial storage failure/retry, both race orderings, private kinds and maintenance.
Real JPEG fixtures cover absent EXIF and orientations 1/3/6/8 across landscape,
portrait, square, sub-minimum and above-maximum dimensions, plus both DB workers.
Encoded WebP/AVIF dimensions, srcset descriptors and blur dimensions are asserted.

Final PR checks and merge evidence are authoritative; implementation alone is
not acceptance. CP1/CP2 manual execution, production SMTP/FX/configuration,
offsite backup and staging restore, Android/iPhone and HTTPS remain separate.
No hosting, staging, deployment, broad media architecture or new feature is
included. Review is self-review plus automated tests, not independent human review.

## Fresh CI dependency recovery

The first run passed Windows tooling but exposed two upstream acquisition/security
failures: Nodemailer 10.0.3 has high advisories, and the pinned mc Quay image
returns unauthorized. Nodemailer is patched to 10.0.6 with a regenerated lockfile
(no high production audit findings). D68 records building the identical mc
release from its official, checksum-verified source commit for ops/minio-init.
This adds no service/provider or business feature and changes no backup format.
The existing Auth.js optional Nodemailer peer-range warning remains; application
SMTP is covered by the full CI email/browser tests.
