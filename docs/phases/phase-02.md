# Phase 02 — Catalog & Storefront

## Goal
Admin can create fashion products with color/size variants, images, size guides; storefront shows home, category listing with filters, product page, search — in 3 languages, mobile-first. Prices shown as `basePriceUsd × test rate` (real FX comes in Phase 03) using the pricing pipeline interface already stubbed.

## Scope (admin)
1. **Taxonomy**: `Category` tree (WOMEN/MEN/KIDS roots seeded + common subcategories), `Brand`, `Collection`, `Color` (name I18n + hex + optional swatch image), `Size` (scales EU/TR/US/CA/INTL, groups: tops, bottoms, shoes, kids-age), `ProductAttribute` keys.
2. **Product editor** (tabs): General (title/desc I18n, brand, category, collections, gender, material, fit, season, care I18n, origin, tags), Media (pick from library, order, per-variant assignment), Variants (matrix generator: choose colors × sizes → variants with SKU auto `<PREFIX>-<COLOR>-<SIZE>`, weight default, price override, active), Pricing (basePriceUsd, compareAt, purchaseCost + currency — stored now, used in Phase 08), Size guide (inherit brand/category or custom table I18n), SEO (title/desc I18n, slug per locale, OG image), Markets (visibility checkboxes), Status (draft/active/archived) + preview link. Duplicate product. Bulk status change.
3. **Size guide editor** with unit toggle cm/in and scale conversion table.
4. Product list with filters (status, category, brand, market, stock later) and quick edit of price/status.
5. `searchVector` maintained via Prisma middleware/trigger; Persian/Arabic normalization function (ی/ي, ک/ك, remove ZWNJ variants, digits) applied both on index and on query; `pg_trgm` for typo tolerance.

## Scope (storefront) — design per `06_ADMIN_AND_DESIGN.md` §B
6. Home (blocks from Phase 01 now render real products/categories).
7. Category page `/[locale]/c/[slug]`: filters (size, color, price range in market currency, brand, availability, material), sort, 2-col mobile / 4-col desktop grid, load more, empty state, SEO title/desc from category. Filter URLs `?size=…` with `noindex` on multi-filter combos.
8. Product page `/[locale]/p/[slug]`: gallery swipe + thumbnails, color swatches switch images, size chips (disabled when variant inactive/out of stock — stock from Phase 03; until then use `isActive`), price + compareAt, badges (new/sale), sticky add-to-cart (button wired to a `cart` stub that only toasts — real cart in Phase 04), size guide sheet, tabs (description, specs/attributes, care, shipping & returns page content from CMS), related products (same category), JSON-LD Product/Offer/Breadcrumb, hreflang.
9. Search page `/[locale]/search?q=` with instant suggestions (debounced), zero-results content.
10. Recently viewed (localStorage), breadcrumbs, 404 designed page.
11. Locale-specific formatting utilities: Persian digits, Jalali dates, currency formatting (`۱,۸۹۰,۰۰۰ تومان`, `₺1.250,00`, `CA$79.99`).

## Acceptance criteria
- Seed: ≥30 realistic products across 3 genders with variants and placeholder images (use a generated SVG/photo placeholder service stored locally — no external hotlinks).
- Product with markets `[TR]` only is 404 in IR market.
- Filters + sort + pagination work without full reload; URLs shareable.
- Lighthouse mobile on product page ≥ 85 performance with seed data (local).
- e2e in fa/tr/en: browse category → open product → switch color → open size guide.
- Unit tests: search normalization, SKU generation, slug uniqueness per locale, currency formatting.
