# Phase 00 — Fix Order (Review Round 1)

**PR:** #1 · **Branch:** `codex/implement-phase-00-foundation` · **Status:** ❌ NO MERGE
**Reviewed by:** Pixel (architecture owner) and Vee (independent quality gate). Both agree on every item below.
**Rules:** fix only what is listed. Do not add scope from later phases. Do not modify `docs/02_DECISIONS.md`. Implement against docs v1.2.
**If you think an instruction is wrong, say so before implementing something different.**

---

## A. Blockers — nothing merges until every one of these passes

### A0. CI is red because `prisma/schema.prisma` is invalid 🔴
The schema puts every `model` and `enum` on a single line and Prisma 6.19.3 rejects it with **P1012**. Because of that, migrate, seed, typecheck, build, the backup tests and the e2e suite never ran in CI. The PR description blames a 403 while downloading the Prisma engine — that is not the cause; dependencies installed fine.
**Fix:** rewrite the schema in standard multi-line format (`pnpm prisma format`), verify locally with `pnpm prisma validate`, and confirm the GitHub Actions run for this PR goes green end to end. Do not claim anything is fixed until you have seen a green run.

### A1. `/admin/*` has no authentication guard 🔴
There is no `src/middleware.ts`, and `src/app/admin/layout.tsx` only renders `<AdminShell>`. Anyone on the internet can open `/admin`, `/admin/users` (which lists every user's email) and the settings pages.
**Fix:** add `src/middleware.ts` that protects every `/admin/*` path except `/admin/login`, redirecting unauthenticated requests to `/admin/login?next=…`. Also check the session inside `admin/layout.tsx` as defence in depth and pass the user into the shell.

### A2. Admin Server Actions have no authorization 🔴
`saveBrand` and `saveTheme` write to the database with no `auth()` and no `assertCan()`. A Server Action is a public POST endpoint; a hidden button is not authorization. This directly violates AGENTS §1.
**Fix:** every admin server action and admin route handler starts with:
```ts
const session = await auth();
if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
await assertCan(session.user.id, "settings.theme.edit");
```
Define and seed the permissions you need (`settings.brand.edit`, `settings.theme.edit`, `users.view`, `users.manage`, `media.upload`, `system.health.view`) for `owner` and `admin`.
Add a unit test that globs `src/app/admin/**/actions.ts`, **fails if the glob returns zero files**, and fails if any of them does not reference `assertCan`.

### A3. `/api/uploads` is public and trusts the client 🔴
No authentication, no permission check. Worse, it trusts `file.type` from the client and derives the stored extension from the user's filename.
**Fix:**
- require an authenticated session with `media.upload` (401 without session, 403 without permission);
- validate the real content with magic bytes (e.g. `file-type`) and reject when the sniffed type is not in the allow-list;
- derive the extension **from the validated MIME**, never from the filename; keep the user's filename only in `Media.originalName` (D40);
- keep the 5 MB cap and the MIME allow-list.

### A4. The admin login form does nothing 🔴
`src/app/admin/login/page.tsx` is a plain `<form>` with no action and no `signIn` call, so the Phase 00 acceptance criterion "admin login works with the seeded owner" fails.
**Fix:** make it a client component calling `signIn("credentials", { email, password, redirectTo })`, with a loading state and a visible error on failure.
**Tests:** a Playwright test that logs in as the seeded owner and reaches the dashboard, and one that requests `/admin` unauthenticated and expects a redirect.

### A5. `docker-compose.yml` (production) is a copy of the dev file 🔴
It runs `pnpm dev`, mounts the source tree, builds `target: deps` instead of `runner`, includes `mailpit`, hard-codes `hoda:hoda` as the DB password and publishes port 3000 on the host. Production effectively does not exist and `entrypoint.sh` never runs.
**Fix:** rewrite it as a real production compose: `target: runner`, no source mounts, no dev server, no mailpit, credentials from `.env` only, the app reachable only through Caddy, plus `postgres`, `minio`, `cron`, `ops`, `caddy`. Leave `docker-compose.dev.yml` as it is.

### A6. `docker build` fails 🔴
The runner stage runs `COPY --from=build /app/public ./public` but the repository has no `public/` directory. The CSS also references `/fonts/vazirmatn/Vazirmatn.woff2` and `/fonts/inter/Inter.woff2`, which do not exist, so both fonts silently fall back — PROGRESS calls them "placeholders", which is not accurate because there are no files at all.
**Fix:** create `public/fonts/` with the real self-hosted Vazirmatn and Inter woff2 files plus their licences (both are open-licensed), and prove `docker build .` completes.

### A7. The `ops` container cannot run migrations 🔴
`COPY package.json prisma scripts /app/` with multiple sources copies the *contents* of those directories into `/app/`, so `schema.prisma` lands at `/app/schema.prisma`. `restore.sh` step 6 (`cd $APP_SRC && npx prisma migrate deploy`) therefore breaks — the exact step the backup design depends on.
**Fix:** separate `COPY prisma ./prisma` and `COPY scripts ./scripts` lines. Verify `docker compose run --rm ops npx prisma migrate deploy` works and that `scripts/deploy.sh` uses `/app/scripts/backup/backup.sh`.

### A8. `inFlight` is hard-coded to 0 🔴
`/api/system/maintenance` always returns `inFlight: 0` and no request-counting middleware exists, so the drain step in `restore.sh` is a no-op and a restore can start while requests are still being served.
**Fix:** maintain a real in-flight counter (increment/decrement around request handling in middleware), return it from GET, and document in the file that the counter is per-instance (single-container assumption). While maintenance is on, reject write requests with 503; `/admin` and this endpoint stay reachable.

---

## B. Required — also in this PR

- **B1. Money gate is fail-open.** The test regexes only `parseFloat(` and `toNumber(`, iterates directories that do not exist yet, and swallows the error in `catch {}`, so it always passes and would never catch `price * rate`.
  **Fix structurally, not with regex:** make `Money.amount` private and expose only `add`, `sub`, `mul(factor: string|Decimal)`, `percent`, `round`, `compare`, `toString`, `format`. With no public `Decimal` there is nothing to multiply by hand. Keep an ESLint `no-restricted-syntax` rule blocking `Number(`, `parseFloat(`, `.toNumber(` under `src/modules/{pricing,fees,orders,finance}`, plus one unit test asserting the rule exists in the ESLint config. Delete the directory-scanning test.
- **B2. `can()` ignores scope.** `UserRole.scope` and `UserPermissionOverride.scope` exist in the schema but `can()` only compares permission strings, so `catalog.product.edit` in TR and in CA are identical today. Later phases must not be built on a half-finished helper.
  **Fix:** finalise the API now — `can(userId, permission, scope?: { marketId?: string; categoryId?: string; section?: string })` — and implement matching: a role/override with no scope means "all scopes"; a scoped grant matches only when every key present in the grant equals the requested value. Add unit tests for grant-with-scope vs request-out-of-scope. Enforcement across queries stays Phase 05, but the semantics are fixed here.
- **B3. Users page is read-only.** Phase 00 §6 requires create / edit / deactivate; the "کاربر جدید" button does nothing.
  **Fix:** implement the three actions with `assertCan(..., "users.manage")`, Zod validation, audit log entries, and an e2e test that creates a user and deactivates them. Deactivated users must not be able to sign in.
- **B4. Base components are missing.** Phase 00 §3 asks for Button, Input, Select, Sheet, Dialog, Table, Toast, Badge, Card under `src/components/ui`, shown on `/admin/design`. There is no `components/ui` directory; the pages use ad-hoc CSS classes.
  **Fix:** create the component set (shadcn/ui or hand-rolled on the design tokens — your choice, but it must be a real reusable set), use it in the admin pages you touch, and render all of them on `/admin/design`.
- **B5. Tailwind is half-installed.** `tokens.css` starts with `@import "tailwindcss"` but there is no `postcss.config.*`, no `@tailwindcss/postcss`, and no Tailwind class anywhere. Either complete the setup and use it (preferred, it pairs with B4) or remove Tailwind from `package.json`. No half-installed tooling.
- **B6. `next-intl` is installed but unused.** Messages are loaded with a manual dynamic `import()`, there is no locale middleware, and the root layout renders a bare `<html>` with no `lang`/`dir`. Wire `next-intl` properly (provider, locale-aware `<html lang dir>`, middleware) as Phase 00 §2 requires, or remove the dependency and explain in PROGRESS. Wiring is preferred.
- **B7. Empty `catch {}` hides failures.** `src/modules/settings/index.ts`, `src/app/admin/users/page.tsx` and `/api/health` all swallow database errors, so a dead database renders as a normal page. Log the error, show an error state, and make `/api/health` return a non-ok status with the reason.
- **B8. Job claiming has no lock.** `runJobs` does `findMany` then `update`, so two workers run the same job. Claim inside a transaction with `SELECT … FOR UPDATE SKIP LOCKED`. Add a test with two concurrent runners on one pending job asserting the handler runs exactly once.
- **B9. Env var mismatch.** Code reads `STORAGE_DRIVER`; `.env.example` has both `STORAGE_PROVIDER` and `STORAGE_DRIVER`. Standardise on `STORAGE_PROVIDER` in code, `.env.example`, both compose files and `docs/07_SETUP_GUIDE_FA.md`.
- **B10. `/media/*` is never served.** `LocalStorage.put` returns `/media/{key}` but nothing serves that path, so every uploaded image 404s. Add a route handler (or a Caddy rule in production). Private kinds (receipts, backups) must not be publicly readable.
- **B11. Audit log.** `saveTheme` writes an `AuditLog` row with no `userId`. Pass the acting user everywhere. Add a migration with a Postgres rule/trigger forbidding `UPDATE` and `DELETE` on `AuditLog`, and drop `updatedAt` from that model (D24: append-only).
- **B12. `deploy.sh --rollback` is not a rollback.** It only pulls and restarts. Either implement it properly (tag images per deploy, keep the previous tag, restore from the pre-deploy safety backup on failure) or remove the flag and record it as Phase 05 scope in PROGRESS.

---

## C. Quality — cheap, do them too

- **C1.** `Money.round` with `ending` lowers the price (13.2 → 12.99) and its `sub(1)` assumes `increment === 1`. Document the intended semantics and add tests for `increment: "1000"` with an ending and for a value already below the ending.
- **C2.** Roles other than `owner` are seeded with no permissions at all. Give `admin`, `data_entry`, `warehouse`, `accountant`, `support`, `marketing` a minimal starting set so the model is exercised.
- **C3.** Playwright boots the app with `pnpm dev`; in CI run against `pnpm build && pnpm start` so the tested artifact is the built one.
- **C4.** Keep PR descriptions factual. If a CI step fails, read the Actions log and report the real cause; do not attribute a code error to the network.

---

## D. Definition of done — paste the real output of each into the PR

```
pnpm prisma validate
pnpm prisma format --check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
bash scripts/backup/tests/run.sh
docker build .
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build
```
Then confirm by hand: `/fa` is RTL, `/tr` and `/en` are LTR, `/admin` redirects when logged out, login with the seeded owner works, changing brand name and primary colour is reflected on the storefront, and `/api/health` reports the database state.

Finally, update `docs/PROGRESS.md` with what changed per item (A0…C4), anything you disagreed with and why, and the manual test steps in simple Persian. Commit on the same branch and push. **Do not merge.** The GitHub Actions run for this PR must be green before you ask for re-review.
