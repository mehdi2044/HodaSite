# Phase 00 — Foundation

## Goal
A running, deployable skeleton: Next.js app + Postgres + storage + jobs + admin login + design tokens + i18n routing + backup scripts + CI. Nothing shop-specific yet, but everything that every later phase depends on.

## Scope
1. **Repo & tooling**: pnpm, TypeScript strict, ESLint, Prettier, Vitest, Playwright, Husky pre-commit (lint-staged). `pnpm lint|typecheck|test|e2e|dev|build`.
2. **Next.js 15 App Router** with `next-intl`; locales `fa`, `tr`, `en`; default `fa`; `/[locale]/` storefront layout with `dir` attribute; `/admin` layout with its own locale switch (fa/en).
3. **Design system**: Tailwind + shadcn/ui installed; `src/styles/tokens.css` with CSS variables per `docs/06_ADMIN_AND_DESIGN.md`; self-hosted fonts Vazirmatn + Inter; base components (Button, Input, Select, Sheet, Dialog, Table, Toast, Badge, Card). Storybook not required; a `/admin/design` page showing the components is enough.
4. **Database**: Prisma + Postgres 16; initial schema with `User`, `Role`, `RolePermission`, `UserRole`, `UserPermissionOverride`, `AuditLog`, `Job`, `Backup`, `RestoreRequest`, `SystemAlert`, `SiteSettings` (incl. `finance` currencies — D04), `ThemeSettings`, `Market` (3 rows seeded, incl. `holdHours`, `paymentDeadlineHours`, `fxMode`), `Integration`. Deletion policy per D24 (`deletedAt` only on content tables).
5. **Auth (admin)**: Auth.js credentials provider (email+password, bcrypt), sessions in DB, `assertCan()` helper with permission strings (see `docs/spec/MASTER_SPEC_v1.md` appendix B). Roles seeded: `owner`, `admin`, `warehouse`, `accountant`, `support`, `data_entry`, `marketing`. Owner created from `ADMIN_EMAIL/ADMIN_PASSWORD` env on first seed. TOTP MFA: schema + optional enable flow (enforcement comes in Phase 05).
6. **Admin shell**: sidebar, topbar, KPI placeholder dashboard, Users list (create/edit/deactivate), Settings → Brand (site name I18n, logo upload placeholder), Settings → Theme (colors/fonts/radius with live preview) — these two settings pages are already functional and drive the storefront root layout.
7. **Storage**: `StorageProvider` with `local` (dev, `/data/media`) and `s3` (MinIO in compose) implementations; upload route with MIME/size validation; `Media` table.
8. **Jobs**: `Job` table, `/api/cron/tick` (CRON_SECRET), handler registry, one demo handler (`heartbeat`). `cron` service in compose curls every minute.
9. **Health**: `/api/health` JSON; `/admin/system/health` page.
10. **Docker**: `Dockerfile` (multi-stage, standalone output), `docker-compose.dev.yml` (app with hot reload, postgres, minio, mailpit, cron, ops), `docker-compose.yml` (prod: caddy, app, postgres, minio, cron, **ops**), `Caddyfile`, `entrypoint.sh` (`prisma migrate deploy` → start; the pre-migration backup is taken by `ops` in `deploy.sh`). The `ops` image is a stage of the same `Dockerfile`: node 20 + the app's `prisma/` folder and Prisma CLI (so it runs `prisma migrate deploy` itself) + postgres-client 16, `mc`, `zstd`, `jq`, `unzip`, `file`. **No Docker socket is mounted anywhere.** `/api/system/maintenance` (GET/POST, protected by `MAINTENANCE_SECRET`) toggles maintenance, returns `{state, inFlight}` (in-flight request counter maintained by middleware) and is the only control path from ops to app. `deploy.sh` runs on the host: `ops backup.sh --kind safety` → pull → build → `up -d` (app entrypoint runs `migrate deploy`). `scripts/server-setup.sh`, `scripts/deploy.sh` (with `--rollback` using previous image tag + pre-deploy backup).
11. **Backups v1 (D23/D36)**: make `scripts/backup/{backup.sh,restore.sh,prune.sh,verify.sh}` work end-to-end inside `ops` exactly per `docs/04_DATABASE_AND_BACKUP.md` §3.3 (keep the hardened contract: zip validation, safety backup, mandatory maintenance handshake, atomic media swap, trap, verify). `ops` runs `backup.sh --kind scheduled` daily, `prune.sh` after it, `verify.sh` weekly on the latest backup. Off-site mirror when env is set; `SystemAlert` when missing in production.
12. **CI**: GitHub Actions on PR: install, lint, typecheck, unit tests, build; `bash scripts/backup/tests/run.sh` (needs `zstd`, `unzip`, `file`, `shuf`, `python3` on the runner); e2e smoke (login to admin) with Postgres service.
13. **Money & FX Test Gate (V-1, blocking)**: even before pricing exists, ship `src/lib/money.ts` + `tests/unit/money.spec.ts` as a gate that later phases extend:
    - `Money` accepts only `Decimal`/string input; a lint rule (`no-restricted-syntax`) + a test forbid `number` arithmetic on monetary values anywhere in `src/modules/pricing|fees|orders|finance`.
    - Rounding policy is data-driven (`RoundingRule {mode, increment, ending}`) and tested per currency: IRT → nearest 1000, TRY/CAD → 2 decimals, optional `.99` ending; half-up vs half-even documented and tested.
    - Currency mixing throws (`add(USD, TRY)` must fail).
    - FX snapshot immutability: a test asserts that changing an `FxQuote` after an order exists never changes any stored order total (enforced by snapshot columns, no recomputation on read).
    CI fails if any of these tests are missing or skipped. Phase 03 extends the same file; no phase may delete a case.
14. **Seed**: markets, roles, owner user, default settings/theme.
15. `.env.example` fully documented (fa + en comments).

## Out of scope
Products, prices, storefront pages beyond a styled placeholder home, customer auth.

## Acceptance criteria
- `docker compose -f docker-compose.dev.yml up --build` on a clean machine → `/fa` shows a styled placeholder home (RTL), `/en` LTR, `/admin` login works with seeded owner.
- Changing site name and primary color in admin updates storefront on next load (no rebuild).
- `scripts/backup/tests/run.sh` is green in CI and inside the `ops` image.
- Inside `ops`: `backup.sh` produces `db.dump`, `media.tar.zst`, `manifest.json` (with the migration list), `checksums.sha256`; `restore.sh <dir> --yes` restores it with maintenance handshake and drain; `verify.sh <dir>` passes; a zip containing `../evil` is rejected; a media tar containing a symlink is rejected; a manifest listing an unknown migration is rejected; editing `manifest.json` after backup makes restore fail at checksum; a media archive whose sampled file is corrupted makes restore fail **before** the swap (old media intact); with `BACKUP_OFFSITE_ENDPOINT` pointing to an unreachable host in `NODE_ENV=production`, `Backup.offsiteStatus=FAILED` and a `SystemAlert` row appears.
- `/api/health` returns db/storage/lastBackup/lastFx fields.
- CI green.
- `docs/PROGRESS.md` and `docs/07_SETUP_GUIDE_FA.md` updated with any real commands that differ.
