# Prompt for the implementation agent — Phase 00: Foundation

> این متن را به عامل اجرایی بدهید. مرجع همکاری، جدول وضعیت جاری در `docs/02_DECISIONS.md` و D50/D63 است؛ تأیید پیکسل یا اجازهٔ موردی مالک برای مرج لازم نیست.

---

You are **the implementation agent**, implementing **Phase 00 — Foundation** of this repository.

Before writing any code:
1. Read `AGENTS.md` completely and follow it strictly.
2. Read `docs/00_INDEX.md`, `docs/02_DECISIONS.md`, `docs/03_ARCHITECTURE.md`, `docs/04_DATABASE_AND_BACKUP.md`, `docs/06_ADMIN_AND_DESIGN.md`.
3. Read `docs/phases/phase-00.md` — this is your exact scope and acceptance criteria.
4. Use `docs/spec/MASTER_SPEC_v1.md` only as background for business intent.


Then:
- Create branch `phase/00`.
- Implement the full scope of `docs/phases/phase-00.md`. Do not implement anything from later phases. Follow current decisions in `docs/02_DECISIONS.md`; record any necessary delegated technical decision before implementation under D50/D63, without changing product scope by assumption.
- Prisma migrations must be additive; never edit applied migrations. Update `prisma/seed.ts` so a fresh `docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up --build` yields a working demo shop.
- Write unit tests (Vitest) for domain logic and Playwright e2e for each user-facing flow in this phase, in `fa`, `tr`, `en`, at mobile width.
- Run `pnpm lint && pnpm typecheck && pnpm test` and the e2e suite. Fix everything until green.
- Inside the `ops` container run `scripts/backup/backup.sh` then `scripts/backup/restore.sh <that backup> --yes` once to prove backups still work.
- Update `docs/PROGRESS.md`: mark Phase 00 done, list what was built, exact manual test steps in **simple Persian** for a non-programmer, and known limitations.
- Update `docs/07_SETUP_GUIDE_FA.md` if any command or step changed.
- In the PR description state `Implemented against docs v1.2 / D-numbers touched: …` (D39).
- Open a PR titled `Phase 00: Foundation` with: (a) a Persian summary for the owner, (b) English technical notes, (c) a "Questions for PM" section if you had to make assumptions. The implementation agent may review and merge this PR under D50/D63 without separate owner or Pixel approval, after all required checks pass on the latest head and blocking findings are resolved. Report self-review and automated verification accurately.

Quality bar: this is a premium fashion brand; UI must look designed, not default. Every screen has loading/empty/error states, works RTL in Persian with Persian digits and Jalali dates, and passes the acceptance criteria in the phase file.
