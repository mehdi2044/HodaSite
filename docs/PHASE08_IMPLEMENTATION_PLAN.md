# Phase 08 — implementation before hosting

Implemented against docs v1.2 / D09, D22, D23, D25, D31, D36, D46, D50, D51, D54, D63.

The owner requested continued development before going online. Implement the existing Phase 08 scope in coherent increments; keep fa/tr/en and IR/TR/CA. No deployment, DNS change, hosting purchase or live provider spending is authorized by this development step.

## 08a — read-only launch readiness

First deliverable: `/admin/system/launch`, protected by the existing `system.health.view` permission. Read current settings and database evidence for full backup freshness, off-site mirror configuration and freshness, the latest verification result, live email configuration, active-market FX freshness, privileged-user MFA and maintenance. Show configuration evidence separately from successful delivery/operation. Never expose credentials or provider endpoints.

Display the remaining real-environment acceptance work explicitly as unverified: HTTPS, CP1/CP2, external restore drill/provider independence, email delivery and regional access for IR/TR/CA, real PWA installation, payment/refund/shipping, commercial tax/fee settings and performance. No manual checkbox can turn this first increment into a launch approval. The later evidence-recording interface remains in the original Phase 08 scope.

This increment is read-only: no migrations, new permissions, data reset, provider requests or changes to backup/auth policies. Reuse the existing MFA eligibility policy. Automated green checks are not a claim of launch readiness; real evidence is still required under D51.

Verify absent, failed, future-dated and stale backup evidence; no-op/misconfigured email; empty or stale markets; missing privileged-user MFA; maintenance; denied access before database lookup. Browser acceptance covers fa/tr/en at 390px, private access, navigation and visible unverified gates. Existing required CI remains mandatory before merge.

## 08b — crawlable URLs, metadata and SEO settings

D64 introduces canonical `/{locale}/m/{marketCode}/...` URLs for home/product/category/CMS pages. The explicit route market wins over cookies; invalid/inactive markets or disabled locales are rejected. Existing URLs remain usable; an explicit valid `?market` on a public GET redirects to the stable path. Canonical/hreflang uses the configured HTTPS origin and exact available slugs, excludes inactive markets/disabled languages, and preserves category pagination without inventing alternate paginated results.

SEO settings reuse `SiteSettings.seo`, the existing `settings.brand.edit` permission and audit trail. Indexing is off by default; robots and sitemap respect it. The sitemap index splits active markets and public entity types into 1,000-row chunks. No admin/account/order/preview URL is listed. Private paths receive X-Robots-Tag; preview and multi-facet listings remain noindex. All three admin languages are supported. No schema/data migration, reset, hosting or DNS operation occurs.

Testing includes URL/metadata invariants, real database visibility and save authorization/audit, and browser acceptance for language/market routes, private headers, robots/sitemap and the mobile settings form. Real search engine indexing and real-host acceptance are not claimed.

## Remaining increments (not completed by 08b)

1. Remaining SEO: complete structured data (including currency/offer and moderated-rating rules), slug history/redirects, dynamic branded social previews and verification of real search-engine behavior. Analytics IDs/loaders remain coupled to consent in the next increment. Existing product social-image overrides are preserved.
2. Consent and privacy controls for analytics, guest/customer wishlist, recently viewed, back-in-stock subscriptions and moderated reviews with permission/privacy tests.
3. Accessibility and performance measurements/fixes; PWA regression checks. Record bundle and local/CI results separately from staging measurements.
4. Audited, dated, environment-specific acceptance evidence in the launch checklist. Complete the real HTTPS/device/email/off-site/payment/reachability gates when infrastructure is available; do not treat mocks or the first dashboard as evidence.

The exact requirements and acceptance criteria remain in `phases/phase-08.md`. This execution order neither deletes those requirements nor marks the full phase complete.
