# Codex task — MODA4 M4-01 (Hero) + M4-02 (From the rail to you)

> **فارسی برای مهدی:** این فایل را در `docs/prompts/` قرار بده و به Codex بگو «این فایل را بخوان و اجرا کن». Codex هیچ چیزی را merge نمی‌کند. خروجی کارش یک PR پیش‌نویس (Draft) است با تصاویر مقایسه‌ای، تا من دوباره در مرورگر بررسی کنم.

You are implementing two owner-approved P0 fixes from `CLAUDE_MODA4_VISUAL_AUDIT.md`. Claude is the design-quality reviewer for this work. Follow `AGENTS.md` and D70: Draft PR, no self-merge, Persian summary first.

## Inputs (read all before coding)
1. `docs/design/moda4-redesign/m4-01-02/SPEC_M4-01_HERO.md`
2. `docs/design/moda4-redesign/m4-01-02/SPEC_M4-02_FITTING_AD.md`
3. Reference implementation (open in Chromium, no server needed):
   - `docs/design/moda4-redesign/m4-01-02/reference/hero-reference.html?lang=fa|tr|en&slide=0..3`
   - `docs/design/moda4-redesign/m4-01-02/reference/fitting-ad-reference.html?lang=…&state=ok|partial|static|copy`
4. `M4-01-02-proposal.patch` (base `c0781c31adfa1db6938ddf77704bc72bf30a8854`, `git apply --check` clean). Treat it as a **proposal**: verify every line, keep what is right, fix what is not, and explain any deviation in the PR.
5. `docs/design/moda4-redesign/FIDELITY_SPEC.md`, D77, D81, `SHOPPABLE_SCENES_AND_PREVIEW.md` §3 (all still binding).

## Branch and scope
- Branch: `design/m4-01-02-hero-fitting` from the current FID head. Rebase the patch onto it if the head moved past `c0781c3`.
- Scope: hero composition, hero float, hero pins/strip, the D81 purchase sheet placement, FittingAd scene/timeline/fallbacks, seed fixes, admin fields, messages, tests. **Do not** change other homepage sections, checkout, money, auth or schema strategy.
- Database: no migration. `layout` and `float` are optional JSON fields inside the existing block JSON, and legacy `textSide` is read through `normalizeHeroLayout()`.

## Must-do beyond the patch
1. Admin preview: run `heroViolations()` for 4 sizes × 3 languages and list warnings (`modaAdmin.heroLayoutWarning`). Add drag handles for `subject.x0/x1` on the preview if feasible (number fields are the minimum).
2. Remove the dead `.moda-hero-*`, `.moda-hero-float` and `.moda-hero-slide .shoppable-scene` rules from `moda-fidelity-home.css` after the visual check.
3. Confirm the M4-02 root cause with the new diagnostics **before** relying on the seed fingerprint. Report the actual `reason` you saw.
4. Run on a fresh seeded DB:
   - `pnpm lint && pnpm typecheck && pnpm test`
   - integration `tests/integration/moda4-fresh-demo.spec.ts`
   - e2e `moda4-scenes.spec.ts` and `homepage-header.spec.ts`
   - `pnpm test:fidelity` (existing rules must not drop)
   - `MODA4_FIDELITY_TARGET=prototype` **and** app runs of `tests/fidelity/moda4-m4-01-02.spec.ts`

## Evidence to attach (PR body + `docs/design/moda4-redesign/m4-01-02/evidence/`)
- `test-results/moda4-m4-01-02/app/*.jpg`: hero 3 languages × 4 sizes × all slides, plus fitting 390/1440 final frames.
- Side-by-side images: reference left, app right, the same set as `images/10–13` and `20–25` of the package.
- 8 timeline frames (or a short video) of the app FittingAd at 1440 and 390.
- Three-way verification split (verified locally / only in CI / not verified), as AGENTS.md requires.

## Stop and ask Mehdi (in Persian) if
- the seeded photos need different `copySide`/`subject` values than the spec,
- a D81 or SHOPPABLE rule conflicts with the spec,
- any acceptance criterion cannot be met without changing scope.

Claude will re-check every stage in the browser against the reference and report remaining issues as `R-xx` with images. "Tests green" is necessary, not sufficient.
