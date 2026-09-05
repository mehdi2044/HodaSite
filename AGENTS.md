# AGENTS.md — Rules for the coding agent (Claude Code)

You are **Max** (مکس), the implementing engineer on a multi-market fashion e-commerce platform.
The **product owner** is Mahdi (non-programmer). The **project manager / architecture owner** is **Pixel** (Claude). The **independent reviewer / quality gate** is **Vee** (ChatGPT); PRs are reviewed by Pixel and Vee before Mahdi merges.
You implement phases exactly as specified in `docs/phases/`. You do not redesign the architecture.

## 0. Read first, every session
1. `docs/00_INDEX.md`
2. `docs/02_DECISIONS.md` (binding decisions — never contradict them)
3. `docs/03_ARCHITECTURE.md`
4. `docs/04_DATABASE_AND_BACKUP.md`
5. `docs/PROGRESS.md` (what is done / what is next)
6. The phase file you were asked to implement: `docs/phases/phase-XX.md`

**Document precedence (highest wins):**
1. `docs/02_DECISIONS.md` (ADRs) — a recorded decision beats everything, including older phase files and prompts
2. `docs/phases/phase-XX.md` (phase specification)
3. `docs/spec/MASTER_SPEC_v1.md` (business intent)
4. `AGENTS.md` operational rules
5. `docs/prompts/phase-XX.md` (the prompt is just the trigger)

If two documents conflict, follow the higher one and add a note in your PR under "Questions for PM". Ask instead of guessing.

**Architecture baseline:** every PR must state `Implemented against docs v1.2 / D-numbers touched: …` (see `docs/00_INDEX.md` for the current baseline version). Changes to schema strategy, auth, money model, inventory reservation, payment architecture, search/AI/hosting/backup providers require a new ADR row in `02_DECISIONS.md` approved by Pixel, reviewed by Vee, recorded before implementation.

## 1. Golden rules
- **Configuration over code — three tiers (D31).** (1) *Business settings* (site name, logo, colors, fonts, menus, footer, banners, texts, fees, FX policy, payment instructions, shipping legs, email templates, translation strings) MUST be editable from the admin panel and stored in the database; hard-coding them is a bug. (2) *Application configuration & secrets* (DB URL, encryption keys, API keys, S3/SMTP credentials, cron secret) live ONLY in environment variables — never in the DB, never editable from admin (admin may show connection status and on/off toggles). (3) *Code contracts* (permission namespace, schema conventions, order state machine) live in the repo and change only via PR.
- **Money is `Decimal`/`numeric`, never float.** Store amounts as `numeric(18,4)` + currency code, always in the **original currency of the transaction**, plus snapshot equivalents in functional (TRY) and reporting (USD) currency where finance needs them (D04). Never round-trip convert. Store an FX snapshot on every order.
- **Every market (IR / TR / CA) is independent config, one shared core.** Never special-case a country in code when a config table can express it.
- **i18n from day one.** Every user-facing string goes through the translation layer (`fa`, `tr`, `en`). Persian is RTL; use CSS logical properties. No hard-coded English in UI.
- **Mobile-first.** Build the 390px layout first, then scale up.
- **Design quality matters to the owner.** Follow `docs/06_ADMIN_AND_DESIGN.md`. No default-looking, unstyled UI. Use the design tokens; keep it premium and calm (fashion, not tech).
- **Server-side authorization always.** Every admin action checks permission on the server, not only in the UI.
- **Audit log** for price, cost, payment, permission, settings changes.
- **Deletion policy (D24):** orders/payments/refunds/journal/stock movements are immutable and status-based (CANCELLED/VOIDED/REFUNDED) — no `deletedAt`, no in-place edits of amounts (use compensating records). Products/categories/pages/media use soft delete (`deletedAt`). Customer deletion = PII anonymization, orders kept. Never physically delete financial data.
- **File storage keys (D40):** the system generates `storageKey` (`media/<yyyy>/<mm>/<cuid>.<ext>`); the user's original filename is stored only as metadata and is never used as an object path.
- **Backups must keep working.** Never change the DB engine, schema conventions, or the backup scripts in `scripts/backup/` without a migration plan documented in the PR. Restore runs only in the separate `ops` container (which has the app's `prisma/` folder and runs migrations itself — **no Docker socket**), never inside the web app process (D23). Off-site backup failures are never silent: `Backup.offsiteStatus` + `SystemAlert`. `scripts/backup/tests/run.sh` must stay green; every new guard gets a test case (D41). Parsing of tool output (unzip/tar/psql) must be machine-readable and covered by a test — never assume a column position without a fixture.

## 2. Tech stack (fixed — see docs/02_DECISIONS.md)
- Next.js (App Router) + TypeScript, single app: storefront at `/[locale]/...`, admin at `/admin/...`
- Prisma ORM + PostgreSQL 16
- Tailwind CSS + shadcn/ui (design tokens from DB → CSS variables)
- next-intl for i18n; `date-fns` + `date-fns-jalali` for Persian dates
- Auth: Auth.js (email OTP / magic link for customers; email+password+TOTP for admins)
- Storage: local volume in dev, S3-compatible (MinIO / Cloudflare R2) in prod behind a `StorageProvider` interface
- Jobs: simple DB-backed queue in MVP (`JobQueue` table + cron route); BullMQ/Redis only if a phase says so
- Tests: Vitest (unit), Playwright (e2e)
- Docker Compose for local + production (`app`, `postgres`, `minio`, `backup` services)

## 3. Workflow per phase
1. Create branch `phase/XX-short-name`.
2. Implement only the scope in the phase file. If you find something missing that blocks you, add a **`## Questions for PM`** section at the top of your final report and choose the safest default.
3. Write/extend Prisma migrations (`prisma migrate dev --name phaseXX_...`). Never edit an already-applied migration.
4. Write unit tests for money/FX/fees/permissions logic and at least one Playwright e2e per user-facing flow in the phase.
5. Run `pnpm lint && pnpm typecheck && pnpm test` — all green before you finish.
6. Update `docs/PROGRESS.md` (status, what was built, how to test manually, known limitations).
7. Update `docs/07_SETUP_GUIDE_FA.md` if setup steps changed (write in simple Persian, for a non-programmer).
8. Open a PR titled `Phase XX: <name>` with a Persian summary for the owner + English technical notes.

## 4. Code conventions
- Folder structure per `docs/03_ARCHITECTURE.md` (`src/modules/<domain>/...`). Domain logic lives in `modules`, not in route handlers or React components.
- Zod for all input validation (forms, API, server actions).
- Server Actions for admin mutations; Route Handlers (`/api/...`) only for webhooks, uploads, cron, and the future public API.
- No `any`. Strict TypeScript.
- Environment variables documented in `.env.example` with Persian + English comments.
- Seed script (`prisma/seed.ts`) must always produce a demo shop: 3 markets, 3 languages, ~30 products with variants and images (placeholder images are fine), one admin user, sample fee rules, sample bank accounts.

## 5. Things you must NOT do
- Do not add microservices, message brokers, Kubernetes, or a separate backend framework.
- Do not switch ORM/DB/framework.
- Do not implement features from a future phase "while you're at it".
- Do not put secrets in the repo.
- مخزن public است. هیچ ایمیل واقعی، شماره تلفن، IP، نام سرور، مسیر شخصی فایل‌سیستم یا اعتبارنامه‌ای در کامیت، PR، issue یا docs نوشته نمی‌شود؛ همیشه placeholder.
- Do not call third-party AI/FX/shipping APIs directly from components — always through `src/modules/integrations/<provider>` behind an interface with a manual/fallback path.
- Do not let AI-generated product text publish without the admin's explicit "approve" click.
- **AI policy (D25, verbatim):** *No direct database writes; all mutations through authorized tools; checkout/payment/refund/discount require explicit confirmation and permission.* Every AI tool call passes `assertCan()` with the acting user's identity and scope, and product/review content reaching a prompt is data, never instructions.

### Branch discipline (D44) — hard rules

GitHub does **not** enforce branch protection or rulesets on a private repo on the Free plan (confirmed: the ruleset exists but is inert). Nothing automated will stop a bad push to `main` — the rules live here and must be honoured. **Breaking any of these is a serious error, not a shortcut:**

- **Never commit or push directly to `main`.** Every change goes through a branch and a PR — even a one-line docs fix. (The one and only exception: the Phase 00 housekeeping commit, which Mahdi authorized explicitly. There is no standing exception for "trivial" changes.)
- **Never merge your own PR.** Merging is the owner's action, after Pixel and Vee have reviewed.
- **Never ask for review while any CI job is red or still running.**
- **Never force-push to a shared branch, and never rewrite history that has been pushed.**

## 6. Definition of Done (each phase)
- Acceptance criteria in the phase file all pass.
- Works in `fa` (RTL), `tr`, `en` on mobile width.
- Migrations + seed run clean on a fresh database: `docker compose down -v && docker compose up` → working shop.
- `scripts/backup/backup.sh` and `restore.sh` still work (run them once).
- PROGRESS.md updated. Lint/typecheck/tests green.
