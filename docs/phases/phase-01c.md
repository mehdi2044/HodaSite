# Phase 01c — CMS, Translations, Notifications, and Storefront Design

> Final sub-phase of Phase 01 (roadmap v1.2, D45). Phase 01a and 01b are merged. This specification owns the remaining items from `docs/phases/phase-01.md` sections 5–10 plus the accepted media-replacement carry-over. Checkpoint 1 remains after Phase 02.

## Goal

Mahdi can manage the storefront navigation, content pages, homepage composition, UI translations, and notification copy without editing code. The public storefront becomes a polished, mobile-first fashion experience in fa/tr/en while catalog-dependent blocks remain ready for Phase 02.

## Scope

### 1. Menus

- Additive `Menu` / `MenuItem` persistence matching `docs/04_DATABASE_AND_BACKUP.md`.
- Admin `/admin/content/menus` for the fixed menu locations `header`, `mobile`, and `footer`; optional market override with a global fallback.
- Nested items, I18n labels, target, enabled state, market visibility, and drag/drop ordering. Reject cycles, invalid parents, unsafe URLs, and nesting deeper than two levels.
- Link types: URL and Page resolve now; Category and Collection are stored but display a clear Phase 02 placeholder until their targets exist.
- Storefront header, mobile navigation, and multi-column footer read only from the cached menu accessor.

### 2. Pages / CMS

- Additive `Page` model per the database document: stable internal id, localized slugs, `static | landing`, `draft | published`, SEO I18n, market visibility, ordered block JSON, soft delete.
- Admin list/editor at `/admin/content/pages` with preview at mobile and desktop widths, save draft, publish/unpublish, duplicate, and soft-delete/restore.
- Blocks: RichText, Image, Hero, TwoColumns, FAQ, CTA, Countdown, and Embed. Use the shared `MediaPicker` and `ResponsiveImage`.
- The dependency-free visual rich-text editor approved in D48 must support RTL and mixed Latin text without requiring JSON editing. Sanitize persisted/rendered HTML. Embed accepts only an allowlist of HTTPS providers/URLs; never arbitrary HTML or script.
- Public route `/[locale]/pages/[slug]` returns only published pages visible in the current market. Draft preview is admin-only and must not publish or mutate data.
- Seed about, contact, terms, privacy, returns, size-guide, and faq in fa/tr/en with neutral placeholder copy.

### 3. Homepage builder

- Admin `/admin/content/homepage` with global composition and optional per-market overrides.
- Ordered blocks: Hero, CategoryCards, ProductStrip, Banner, TrustBar, and RichText; drag/drop plus keyboard-accessible move controls.
- Hero/Banner images use `MediaPicker`; responsive rendering uses `ResponsiveImage`. Product/category/collection sources are stored now and show deliberate placeholders until Phase 02 supplies catalog data.
- Admin-only live preview at 390px and 1280px. Unsaved preview data is transferred without database writes; saved changes invalidate the homepage cache.

### 4. Translation editor

- Admin `/admin/content/translations`: searchable table of UI keys from `messages/fa.json`, `messages/tr.json`, and `messages/en.json`; inline edit, reset to file default, validated JSON import/export.
- Store overrides in `Translation(entityType='ui', entityId='global', field=key, locale, value)` with the documented unique key.
- Runtime messages are file defaults merged with cached DB overrides. A reset deletes only that override. Invalid namespaces, unknown locales, oversized values, prototype-pollution keys, and malformed imports are rejected.
- Show missing entity translations for Page/Menu/Homepage without silently inventing content.

### 5. Notification template authoring foundation

- Admin `/admin/settings/notifications` for seeded email templates: `auth.otp`, `order.placed`, `order.receipt_received`, `order.paid`, `order.rejected`, `order.shipped`, `order.delivered`, `order.cancelled`.
- Edit active state, subject and body in fa/tr/en, show the allowed variable list, validate unknown variables, and send a test through an `EmailProvider` abstraction.
- Providers: `noop` (default, safe local/CI logger), `smtp`, and `resend`; secrets remain in env and are never stored, logged, committed, or returned to the browser. Real provider configuration and SMS delivery remain Phase 04.

### 6. Final storefront design for Phase 01

- Fully data-driven announcement bar, premium responsive header/mobile drawer, homepage, and footer following `docs/06_ADMIN_AND_DESIGN.md` section B.
- Mobile-first at 390px; correct RTL/LTR, logical CSS properties, minimum 44px touch targets, visible focus, AA contrast, loading/empty/error states, and no dark patterns.
- Reuse theme tokens and self-hosted fonts. Above-the-fold media can be priority; other media is lazy with stable dimensions and blur placeholders.
- Use shared `<Iso>` / `<bdi dir="ltr">` for Latin/code fragments inside Persian text. Add a Playwright BiDi regression.

### 7. Media replacement carry-over from 01b

- Add “replace file” to media details. Preserve the existing Media id so all references remain valid.
- Upload/process the replacement separately; only after successful validation and optimization atomically swap the row’s storage metadata/variants, then remove old objects. A failure leaves the old ready asset untouched and retryable.
- Preserve alt text, tags, folder, and references; record an AuditLog entry. Cover local and S3/MinIO paths.

### 8. Authorization, audit, caching, and migrations

- Every mutation uses Zod, `auth()`, `assertCan()`, `withMutation`, and AuditLog. Add least-privilege permissions for content/translations/notifications without broadening existing roles unnecessarily.
- Every migration is additive; no rename/drop/destructive data rewrite.
- Cached accessors must be invalidated on save and reflect changes within one page load.

## Out of scope

Product/catalog CRUD and real category/product/collection feeds (Phase 02); checkout/payment and real notification integrations (Phase 04); SMS delivery; SEO analytics (Phase 07); AI features; CDN integration.

## Acceptance criteria

1. Admin adds a localized menu item linked to a published page; it appears in the correct header/mobile/footer and market within one page load.
2. Admin creates and publishes a mixed RTL/LTR page using RichText + Hero + FAQ; fa/tr/en routes render correctly, drafts remain private, unsafe HTML/embed content is rejected.
3. Homepage blocks reorder and preview at 390px without saving; after save, global and market-specific storefronts render the expected composition.
4. Editing a UI translation changes the storefront/admin runtime string; reset restores the file default; import/export round-trips with validation.
5. Notification templates reject unknown variables; the noop test send succeeds without exposing secrets.
6. Replacing a media file keeps its id/references, changes rendered variants only after processing succeeds, retains the old asset on failure, and works against MinIO in CI.
7. Playwright covers menu → page, homepage preview/save, translation override/reset, notification test, media replacement, 390px RTL navigation, and the required BiDi sentence.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass; `checks`, `docker`, and `docker-runtime` pass; backup → verify → restore remains green.
9. Fresh `docker compose down -v && up --build` seeds the menus, seven pages, homepage blocks, and notification templates in all three locales.

## Deliverables

Code, additive migrations, seed data, unit/integration/e2e tests, updated database/admin/roadmap/progress docs, simple Persian manual test steps, and one PR titled `Phase 01c: CMS and Storefront Design`. Do not merge the PR; Vee performs the final review and Mahdi gives the merge decision.
