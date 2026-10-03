# Prompt for the implementation agent — Phase 09: CRM, Promotions, Loyalty, Campaigns, Returns Portal

> این متن را به عامل اجرایی بدهید. مرجع همکاری، جدول وضعیت جاری در `docs/02_DECISIONS.md` و D70 است؛ Codex هرگز PR خودش را مرج نمی‌کند و مرج به gateهای D70 و اجازهٔ صریح مهدی نیاز دارد.

---

You are **the implementation agent**, implementing **Phase 09 — CRM, Promotions, Loyalty, Campaigns, Returns Portal** of this repository.

Before writing any code:
1. Read `AGENTS.md` completely and follow it strictly.
2. Read `docs/00_INDEX.md`, `docs/02_DECISIONS.md`, `docs/03_ARCHITECTURE.md`, `docs/04_DATABASE_AND_BACKUP.md`, `docs/06_ADMIN_AND_DESIGN.md`.
3. Read `docs/phases/phase-09.md` — this is your exact scope and acceptance criteria.
4. Use `docs/spec/MASTER_SPEC_v1.md` only as background for business intent.
5. Phase 08 is merged. Read `docs/PROGRESS.md` for its report and known limitations. Do not refactor Phase 08 beyond what this phase needs.

Then:
- Create branch `phase/09`.
- Implement the full scope of `docs/phases/phase-09.md`. Do not implement anything from later phases. Follow current decisions in `docs/02_DECISIONS.md`; record any necessary delegated technical decision before implementation within authorized scope, without changing product scope by assumption; PR review/merge follows D70.
- Prisma migrations must be additive; never edit applied migrations. Update `prisma/seed.ts` so a fresh `docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up --build` yields a working demo shop.
- Write unit tests (Vitest) for domain logic and Playwright e2e for each user-facing flow in this phase, in `fa`, `tr`, `en`, at mobile width.
- Run `pnpm lint && pnpm typecheck && pnpm test` and the e2e suite. Fix everything until green.
- Inside the `ops` container run `scripts/backup/backup.sh` then `scripts/backup/restore.sh <that backup> --yes` once to prove backups still work.
- Update `docs/PROGRESS.md`: mark Phase 09 done, list what was built, exact manual test steps in **simple Persian** for a non-programmer, and known limitations.
- Update `docs/07_SETUP_GUIDE_FA.md` if any command or step changed.
- In the PR description state `Implemented against docs v1.2 / D-numbers touched: …` (D39).
- Open a Draft PR titled `Phase 09: CRM, Promotions, Loyalty, Campaigns, Returns Portal` with: (a) a Persian summary for the owner, (b) English technical notes, (c) a "Questions for PM" section if you had to make assumptions. Always create PRs as Draft. Mark Ready for Review only after implementation is complete, all intended commits are pushed, and required local checks pass. Codex must never merge its own PR. Under D70, merge requires green required CI for the current head SHA, the latest [HODASITE-AI-REVIEW] for that same SHA reporting no blockers, resolved blocking conversations, and explicit merge authorization from Mehdi. Report self-review and automated verification accurately.

Quality bar: this is a premium fashion brand; UI must look designed, not default. Every screen has loading/empty/error states, works RTL in Persian with Persian digits and Jalali dates, and passes the acceptance criteria in the phase file.
