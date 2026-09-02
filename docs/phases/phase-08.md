# Phase 08 — Technical SEO, PWA, Performance, Wishlist, Basic Reviews, Accessibility, Launch Checklist

## Goal
Launch-quality storefront: indexable, installable, fast, accessible.

## Scope
1. **SEO**: `hreflang` (fa/tr/en × markets via `?market` canonicalized to path or subdomain per `Market.seo` config), canonical, sitemaps per market (products/categories/pages), robots, JSON-LD (Product/Offer/AggregateRating/Breadcrumb/Organization), OG/Twitter images (dynamic OG generator with brand), facet indexing rules (noindex on ≥2 facets), 301 slug history table (`SlugRedirect`), Settings → SEO page (defaults, analytics IDs, verification tags, GA4/GTM/Meta pixel loaders behind consent).
2. **PWA**: `manifest.webmanifest` from settings (name, icons generated from logo, theme color), service worker (workbox): precache shell/fonts, runtime cache images (stale-while-revalidate, capped), **network-only** for cart/checkout/account/API, offline page, versioned cache with cleanup, install prompt component (dismissible, not nagging), push subscription table (sending in Phase 09).
3. **Performance**: image loader audit, font subsetting (Vazirmatn subset), route-level code splitting, `next/dynamic` for heavy admin libs, DB query audit (N+1 → includes), listing pagination via keyset, HTTP cache headers, Caddy compression, `@next/bundle-analyzer` report committed to PROGRESS. Targets: LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms on throttled mobile in staging.
4. **Wishlist** (guest localStorage → merged on login; account page; heart on cards/product), **Recently viewed** strip, **Back-in-stock request** (email capture per variant; job sends when stock > 0).
5. **Basic reviews**: rating + text + optional photos, verified-purchase flag, moderation queue in admin (approve/reject/reply), display on product page with locale filter, aggregate rating in JSON-LD.
6. **Accessibility**: axe CI check on key pages, keyboard nav for gallery/filters/sheets, focus management in dialogs, ARIA for RTL carousel, contrast check of theme colors in admin (warn if AA fails).
7. **Cookie/consent banner** per market (minimal, privacy-preserving default; analytics off until consent where required).

8. **Launch checklist page** (`/admin/system/launch`): automated checks — off-site backup configured & last mirror < 36h, last verify OK, restore drill recorded on staging, FX providers healthy, email deliverability test sent to an Iranian + Turkish + Canadian address (manual tick), Iran/TR/CA reachability matrix results (manual tick with date), maintenance mode off, MFA on for all owners/admins, no `noop` providers in production env.

## Acceptance criteria
- Lighthouse mobile (staging, seed data): Performance ≥ 85, SEO ≥ 95, Accessibility ≥ 95, PWA installable.
- Product HTML contains title/description/price/JSON-LD server-side; hreflang triplets valid (validator).
- Offline: shell + last viewed pages load; cart never served from cache.
- Review moderation: unapproved reviews never render.
- Launch checklist shows red when off-site backup is missing.
