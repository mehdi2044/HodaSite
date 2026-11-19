# M4-02 final acceptance, early interaction and journal navigation

Implemented against docs v1.2 / D-numbers touched: D23, D31, D64, D70, D77, D81, D82.

Owner-authorized local work above `0385ab6011cc0a089da5aecb303c52d570bbc0aa`.
Keep the reference preview and its published v32 homepage/media read-only. Work
in a new checkout, PostgreSQL destination and media directory. Do not push,
create a PR, merge, publish or change main. Human visual acceptance is pending.

- Preserve four final photos, fingerprints, profile versions, geometry, fitting
  engine, framework pins and five-item dock.
- Reproduce early pointer/click interaction with held bundles. Match server and
  first-client markup; genuinely disable JS-only controls with visible loading
  feedback until commit. No fixed timer or suppressed hydration warnings.
  Preserve native links and the existing parser/Flight navigation protection.
- Configure the journal through the existing permission-checked, audited menu
  writer, including market overrides. `/magazine` is the market-neutral menu
  URL. Preserve the logo and highlight current journal/article links without
  introducing a rewrite hydration mismatch. Reuse the existing CMS; no migration.
- Verify four looks × three locales × 390/1440: movement, landing, scan, final,
  Replay, pause, resize and reduced motion. Check header, hamburger, market and
  locale navigation, fitting, product/cart/checkout at 320/390/768/1024/1440.
  Do not place an order or payment.
- Build production; run lint, typecheck, Vitest on separate test databases and
  Playwright. Preserve failed runs, source/build identity, paired v32 images and
  file inventory. Post nonconfidential results to Issue #41; stop for visual review.

The opt-in `scripts/prepare-m402-acceptance.ts` fixture accepts only the exact
disposable acceptance database. It adds sample Editorial entries referencing
existing products and real market prices, plus audited menu entries. It never
seeds or restores a live shop. For a future authorized rollout use Content →
Menus for header/mobile and market overrides. Roll back the application artifact
and disable those menu entries; retain content/media. No DB downgrade is needed.
