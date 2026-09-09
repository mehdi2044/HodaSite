# Codex implementation brief — Phase 01c

Implement `docs/phases/phase-01c.md` completely on branch `phase/01c-cms-storefront`.

## Binding instructions

1. Read `AGENTS.md`, `CLAUDE.md`, and the mandatory sequence in `AGENTS.md` §0: `docs/00_INDEX.md`, `docs/02_DECISIONS.md`, `docs/03_ARCHITECTURE.md`, `docs/04_DATABASE_AND_BACKUP.md`, `docs/PROGRESS.md`, and the full Phase 01c specification. Also read `docs/06_ADMIN_AND_DESIGN.md` and `docs/08_TEST_CHECKPOINTS_FA.md` before editing.
2. Preserve every Phase 00/01a/01b behavior and test. Use additive migrations only.
3. Work in reviewable vertical slices. Run targeted tests after each slice and the complete local verification suite before pushing.
4. Treat all persisted JSON and rich content as untrusted at write and render time. Preserve authorization, least privilege, audit, maintenance, storage, and backup invariants.
5. Do not add personal data, real emails, credentials, domains, IPs, server names, or machine paths. Use placeholders.
6. If a requirement conflicts with a binding decision, stop and report the exact conflict; do not silently choose.
7. Update `docs/PROGRESS.md`: mark 01b merged with PR #5 and merge commit `61eb4f3`; document 01c implementation, raw test counts, manual Persian verification steps, limitations, and questions.
8. After local verification, push the branch and open PR `Phase 01c: CMS and Storefront Design`. Wait for all three CI jobs. Fix failures on the same branch without force-push.
9. Do not merge. Report the PR URL, exact head SHA, test output summary, CI links/status, and any residual risk to Vee for independent review.

The notification-template scope here is the authoring/provider foundation from the v1.2 roadmap. Real provider configuration and SMS delivery remain Phase 04 even though the templates are editable now.

RichText uses the dependency-free visual editor approved in D48. Do not add TipTap or another editor package; users must not edit raw JSON as the primary authoring flow.
