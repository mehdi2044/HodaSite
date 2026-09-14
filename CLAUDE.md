# CLAUDE.md — Compatibility instructions for coding agents

The active implementing engineer is the **Codex implementation agent** (HodaSite — trilingual fashion e-commerce, IR/TR/CA). This file remains for compatibility with Claude-based tooling; `AGENTS.md` and the current-policy table in D50/D63 define the current workflow.

- **Product owner:** Mehdi (مهدی). Report clearly in Persian; separate owner permission for technical approval or merging is not required (D50/D63).
- **Technical management, implementation and quality review:** Vee / the implementation agent. Self-review is reported as self-review; no mandatory independent reviewer or Pixel collaboration is required.
- The `chatgpt-codex-connector` bot on GitHub is an *additional* automated reviewer, distinct from the Codex implementation agent.

## 1. Single source of truth

All binding engineering rules live in `AGENTS.md`, imported here so they apply to every session:

@AGENTS.md

Historical references to Pixel, Max, or Claude Code describe the earlier workflow and do not create a current approval dependency. If this file and `AGENTS.md` disagree, `AGENTS.md` wins and you report the conflict.

## 2. Start of every session

Follow `AGENTS.md` §0 exactly (index → decisions → architecture → database/backup → progress → your phase file). Document precedence is as stated there. Baseline: **docs v1.2**, ADRs up to the latest row in `docs/02_DECISIONS.md` are binding.

## 3. Hard rules that are easy to break from a terminal

- **Branch discipline (D44/D45/D50/D63):** never commit or push to `main`; use a branch + PR; the agent may merge its own PR after quality review and all three required CI jobs pass on its latest head; no force-push or bypassing protections.
- **Destructive actions:** before `docker compose down -v`, dropping/recreating a database, deleting files outside your branch's scope, editing `.env`, or rewriting history — **stop and ask Mehdi in Persian**.
- **No personal or secret data anywhere** (repo is public): never write `.env` values, passwords, API keys, real e-mail addresses, phone numbers, server names, IPs, or personal filesystem paths into commits, PR descriptions, issues or docs. Use placeholders (`owner@example.com`, `<project-dir>`).
- **i18n:** no hard-coded user-facing strings, including on admin pages — go through `messages/*.json` + `next-intl`.
- **Verification claims:** every PR keeps the three-way split (verified locally / verified only in CI / not verified). Never claim something passed that you did not run.

## 4. Local development notes

- Dev stack: `docker compose -f docker-compose.dev.yml up --build`. Postgres is published on host port **55432** (see the comment in `docker-compose.dev.yml`).
- Integration tests need `TEST_DATABASE_URL` (see `.env.example`). Without it only unit tests run; with it set but unreachable, the run must **fail**, not skip.
- Playwright e2e is flaky against `next dev` locally; trust the CI run (built standalone) for e2e results.

## 5. Reporting

- Update `docs/PROGRESS.md` at the end of every phase (status, what was built, **manual test steps in plain Persian**, known limitations, questions for PM).
- Open the PR as `Phase XX: <name>` with a Persian summary for Mehdi first, then English technical notes, then the verification split (`AGENTS.md` §3).
- If a phase spec is ambiguous or conflicts with a decision, do not guess: add it under **Questions for PM** and pick the safest default.
