# DESIGN-01.1 — interactive visual proposal

Status: **AWAITING_VISUAL_APPROVAL** after the recorded checks. This React/TypeScript prototype runs separately from Next.js and has no database connection, authentication, payment, order writes, provider calls or production route. All data and artwork are fictional existing seed fixtures. USD amounts are demonstration base prices, not an IR/TR/CA quote. The market control illustrates independent scope only; it does not claim a live pricing engine.

```bash
git clone --branch phase/design-01-visual-preview https://github.com/mehdi2044/HodaSite.git HodaDesignPreview
cd HodaDesignPreview
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsx scripts/design-preview.mts
```

Use a new empty directory for the clone; leave the existing store checkout and Docker preview alone. Node20 and Corepack/pnpm10.15.1 are the repository reference tools. The cloud verification used Node24 and installed system Chromium; it does not claim execution on the owner's Windows machine.

Then open `http://127.0.0.1:4310` **on the machine running that command**. A cloud localhost is not a public or owner-laptop link. `DESIGN_PREVIEW_PORT` selects a different local port. No `.env`, DB migration or seed is needed for this prototype. Runner uses the esbuild dependency already shipped by the locked tsx toolchain, binds only loopback and serves only the prototype, approved public fixture assets/fonts and evidence. Build output is ignored in `.design-preview/`.

## What to inspect in five minutes

1. Select FA/TR/EN and IR/TR/CA independently. Home shows preserved approved Hero content/geometry, distinct category imagery, two collection banners, five new arrivals, campaign poster, weekly editorial selection, ShopLook, services and footer.
2. Switch each new-arrivals tab: five fixture products per Women/Men/Kids/Accessories. Scroll the mobile rail to the fifth product. No fixed four-category business limit is proposed; these are the four requested starter groups.
3. Open a category, filter to the empty state, clear it, try loading/error/recovery. Open a product, zoom/Escape, select color and size. An unselected size cannot add an item. Add one unit and inspect its chosen size/color in the bag; change quantity/remove. “Continue demo” explicitly creates no order/payment.
4. Open the banner editor. Edit title/body/CTA/destination/count/visibility and observe the adjacent preview. Save a local draft, edit again and restore the saved draft. This is browser-only demonstration, not server publishing/history/permissions.
5. Use “Current baseline” to view actual matched FA/TR/EN PR60 fixture captures. It is explicitly a screenshot reference, not an interactive backend. Select “Proposed design” to return. Pause campaign motion; OS reduced-motion stops animations.

`hero-*.html` are sanitized public Hero snapshots from PR60's production build on an isolated seeded DB. Their asset destinations are rewritten to repository fixtures/hash routes. They preserve the already accepted upper composition and translated merchant copy; they do not export a private account or make a new renderer available in production. The header here is a prototype navigation frame, not an approved replacement for the actual storefront header. Real header design remains unchanged and should be reused during implementation.

## Real versus simulated

Real in this deliverable: React rendering, responsive layout, hash navigation, category recovery controls, local variant selection/bag, localized banner editing, local draft persistence, zoom modal, pause/reduced-motion and real captured evidence. Existing seed assets are used without copying reference brands.

Simulated: catalog/stock availability, prices/quotes, checkout, promotions, campaign delivery, draft/history and permissions. Server content scheduling, independent mobile assets, publication/rollback, actual targeting and all new admin controls remain DESIGN-01.2–01.6. No mock claims those contracts are delivered.

Owner selection: accept/refine the category collage (tall Women + compact Men/Kids + wide Accessories on mobile; staggered four departments on desktop), two collection banners before new arrivals, one static campaign poster placement, five-product editorial rows, green/cream lower-page palette and restrained movement. No popup or heavy 3D/video is activated. See [blueprint and acceptance map](../../docs/reviews/DESIGN01_VISUAL_BLUEPRINT.md).
