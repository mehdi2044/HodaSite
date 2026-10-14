# Prompt template for Codex (to be issued by Vee after review)

> Vee: adjust the phase number, ADR numbers and the PR you want first, then send. Issue **one PR at a time** (R1 → R7).

---

You are the Codex implementation agent for HodaSite. Follow `AGENTS.md` §0 (read index, decisions, architecture, database/backup, progress) before writing code.

**Task:** implement **<R1 | R2 | … | R7>** of the MODA4 storefront redesign.

**Inputs (binding order):**
1. `docs/02_DECISIONS.md` — including the new ADR rows Vee recorded for this redesign: <list ADR ids>.
2. `docs/phases/phase-<NN>.md` — phase spec created from `docs/design/moda4-redesign/IMPLEMENTATION_PLAN.md`.
3. `docs/design/moda4-redesign/SPEC.md` — visual and interaction specification.
4. `docs/design/moda4-redesign/prototype/source/template.html` — the readable reference implementation. Match its visuals and behaviour, but **do not copy its architecture**: it is vanilla JS with hard-coded demo data.
5. `docs/design/moda4-redesign/FITTING_ROOM_PLAN.md` (R7 only).

**Rules for this work:**
- Branch `phase/<NN>-<rX>-<short-name>`; Draft PR titled `Phase <NN> <RX>: <name>`; Persian summary for Mehdi first, English technical notes, then the verification split (verified locally / only in CI / not verified). State `Implemented against docs v1.2 / D-numbers touched: …`.
- D31: every visible string goes through `messages/{fa,tr,en}.json`; all content, including brand name, logo, colours, banners, block copy, Latin display titles, menus and featured tiles, is editable from the admin panel and stored in the DB. No hard-coded copy or colours outside tokens.
- D26 (as amended): self-host every font; no Google Fonts requests.
- Mobile-first (390 px), RTL with CSS logical properties, `prefers-reduced-motion` respected, 3D via CSS transforms only (no WebGL), animation loops paused off-screen/hidden tab.
- Model photos must never be cropped at the head: 3:4 frames or top-anchored `object-position`; hero height rule from SPEC §6.1.
- Accessibility: real buttons/links, labelled icon buttons, keyboard access to menus/carousels/overlays, contrast per SPEC §3 (ink text on the orange accent).
- Use existing modules (`content/homepage`, `catalog`, `cart`, `fitting`, `customers`, `crm/preferences`, media framing) instead of parallel implementations. Additive migrations only; never edit applied migrations.
- Tests: unit tests for new zod schemas and rules (block contracts, fitting slot exclusivity); Playwright for each user-facing flow in fa (RTL) and en at 390 px and desktop, including a no-head-crop screenshot check for the hero.
- Run `pnpm lint && pnpm typecheck && pnpm test`; update `docs/PROGRESS.md` (manual test steps in simple Persian).
- Never merge; never push to `main`; D70 gates and explicit Mehdi authorization apply.

Report blockers under **Questions for PM** and choose the safest default.
