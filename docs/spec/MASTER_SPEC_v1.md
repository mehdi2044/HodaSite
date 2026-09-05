# Fashion Commerce Master Spec — v1.0 (structured summary)

> This is a clean, machine-readable summary of the owner's original master spec (Word/PDF, September 2026). The original files are kept outside this public repository, with the owner only. Where this file and `docs/02_DECISIONS.md` or a phase file differ, **the decisions/phase files win** (they are the reviewed, newer version).

Owner: Mahdi · Markets: Türkiye (origin of operations), Canada, Iran · Languages: fa-IR (RTL), tr-TR, en-CA

## 0. Executive summary
Trilingual, multi-market fashion commerce platform covering sales, inventory, pricing, payment, logistics, management accounting, CRM, loyalty, marketing and AI in one system. Mobile-first. Configuration-driven: the admin changes business policies, rates, shipping methods, fees, roles, campaigns and texts without code. AI evolves from data-entry helper to a real shopping agent.

## 1. Business & catalog scope
- Women / Men / Kids → Category → Subcategory → Collection → Brand.
- Central catalog; per-market content, availability, price list, shipping rules, tax rules, campaigns.
- Product visibility per market. Market may get its own subpath/domain later.
- Collections: seasonal, new arrivals, best sellers, sale, limited edition, curated looks.

## 2. Multi-currency pricing
- Display: Iran → Toman, Türkiye → TRY, Canada → CAD.
- Base price stored once (USD accounting base; purchase currency may be TRY). Money as exact decimal.
- FX provider abstraction, fallback and daily cache; Iranian APIs return IRR while UI shows Toman → explicit conversion layer.
- Manual FX override with dates and audit. Market markup, rounding, price endings after FX.
- FX snapshot stored on the order; old orders never change.

## 3. Fees engine (shipping, tax, customs, service)
- Each fee: type, scope (country → province → city/postal → shipping method → category), method (fixed, percent, per kg, weight bracket, value bracket, per item, composite), priority, min/max, effective dates, on/off, absorb-by-seller.
- Tax inclusive/exclusive option. Transparent breakdown at checkout. Rule simulator in admin.
- Examples: CA shipping 20 CAD up to 2 kg + 6 CAD/kg; CA customs 8%; TR min shipping 150 TRY; service fee 2% optional.

## 4. Product, customer, checkout, payment
- Product: title, brand, category, collection, gender/age, material, fit, season, care, origin, SEO. Variant: color + size + SKU + barcode + stock + weight + dimensions + cost + optional price. Media: multiple images/video, alt text ×3. Size guide at brand/category/product with EU/TR/US/CA. Inventory statuses incl. pre-order/backorder.
- AI data-entry assistant for title/description/SEO/translation/alt text with human approval.
- Checkout required: first name, last name, email, phone, address. Optional: birth date, gender. Guest checkout / account during checkout.
- Payment v1 offline per market (IR card/Sheba; TR IBAN; CA Interac/bank transfer): order number + bank details + receipt upload inside the order; statuses Pending Payment → Awaiting Verification → Paid → Processing → Shipped → Delivered (+ Cancelled/Refunded/Partially refunded). WhatsApp secondary only. Payment provider interface for Stripe/TR/IR gateways later.

## 5. Logistics
- Per-market configurable shipping workflow with 1..n legs (TR domestic; IR international + domestic; CA international + domestic or door-to-door).
- Leg: carrier, service, tracking, cost, currency, status, ETA, delivered date. Carrier abstraction; labels/manifests later; split/partial shipments; notifications; return/exchange logistics in data model.

## 6. Admin, accounting, partners, localization
- Admin: dashboard, catalog/media, inventory & stock movements, orders/payments/receipts/shipping, CRM/marketing/loyalty, accounting/expenses/partners, users/roles/permissions/audit, settings (market, language, FX, fees, payment, shipping, AI, integrations).
- Management accounting: ledger (double-entry-ready), purchase & landed cost, COGS/gross/contribution/net, alerts below cost/margin, expenses, partner capital ledger, multi-currency, refunds/credit notes/write-offs, AI financial analyst. Statutory rules validated with local accountants.
- Localization: fa RTL/Toman/Jalali, en-CA, tr-TR; DB in UTC/Gregorian; BiDi-safe mixed text; all templates/URLs/emails localizable.

## 7. UI/UX, mobile-first, PWA, app, SEO
- Thumb-friendly navigation, bottom nav, sticky add-to-cart, lazy media, clear size/color/stock, fast search with typo tolerance and facets, wishlist, recently viewed, short checkout with progress, accessibility.
- PWA: manifest, service worker, offline shell, push, safe versioned cache (no stale cart/price); Capacitor wrapper later; native features only where valuable.
- SEO-first: SSR/SSG, hreflang/canonical, structured data, sitemaps per market, facet indexing strategy, Core Web Vitals, editorial content hub.

## 8. CRM, loyalty, marketing, personalization
- Customer 360, consent-based preferences, RFM/CLV/churn, no-code segment builder.
- Loyalty: points, tiers, coupons, referral, birthday/anniversary, early access; promotions (BXGY, spend-get, bundle, free shipping, double points, member-only); occasion campaigns (Black Friday, Nowruz, Republic Day, …); value beyond discounts.
- Automation: email/SMS/WhatsApp/Telegram/push provider-based; per-channel consent; flows (welcome, abandoned cart, browse abandonment, back in stock, price drop, post-purchase, review request, win-back); UTM/attribution/ROI; multiple social accounts per market.
- Recommendations: for you, similar, also bought, complete the look; rule-based fallback; business rules on stock/margin.

## 9. Roles, permissions, security
- RBAC + scope (section/market/category) + per-user overrides. Roles: owner, admin, category manager, data entry, accountant, support, warehouse/shipping, marketing.
- Fine-grained permissions (view/create/edit/delete/publish/approve/export); sensitive ones separate (view_cost, edit_price, refund, approve_receipt, manage_roles, export_customer_data); MFA for sensitive admins; immutable audit for price/cost/payment/permission/refund/settings; session/device management; least privilege, default deny.

## 10. AI-native differentiation
- Trilingual shopping agent (text + voice) through limited safe tools (catalog, price, inventory, cart, shipping quote, order flow); no free DB access; grounded answers, no fabricated numbers; step-by-step to checkout with user confirmation; voice output on user choice only.
- Visual intelligence: photo → similar products, style match, outfit builder, style DNA, smart size assistant.
- Virtual try-on (later): privacy-first, opt-in, credits, queue/rate limit, no raw image retention without consent, provider abstraction, A/B tested.
- Smart gamification: style missions, early access, occasional boosters, premium tiers/badges; AI suggests rewards, admin approves.

## 11. Consultant additions
Returns/exchange portal & analytics; inventory & supply (PO, supplier, lead time, stock ledger, reservation, reorder point, lots, multi-warehouse readiness); independent promotion rules engine; CMS & landing builder with scheduling and trilingual preview; reviews/Q&A/social proof with moderation; professional search (facets, typo tolerance, Persian/Arabic normalization, synonyms, semantic layer, zero-result analytics); privacy & compliance by design (consent registry, retention, export/delete, cookie consent per market, local legal validation); observability & business monitoring (errors, logs, alerts for payment backlog/stock/FX/shipping, integration health, backup status).

## 12–17. Technical architecture (original proposal)
Modular monolith; Next.js + TypeScript storefront and admin; NestJS/modular TS API; PostgreSQL (+pgvector); Prisma/Drizzle; Redis + BullMQ; Meilisearch/Typesense; S3-compatible storage; CDN; passwordless + MFA; PWA; Capacitor; AI gateway with provider abstraction/routing/cost caps; analytics event schema; Docker + CI/CD. Provider abstraction for FX, payment, shipping, email, SMS, WhatsApp, AI, storage, search. High-level entities per domain (catalog, inventory, pricing, customer, commerce, shipping, finance, CRM, security, AI). Financial/order data immutable or fully audited; soft delete. Security: OWASP, TLS, secrets management, rate limits, upload validation, PII masking, CSRF/CORS, encrypted backups, AI tool permissions, prompt-injection defense. Performance budgets: LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms, search < 300 ms, streaming AI.
**→ Simplified for this project in `docs/02_DECISIONS.md` (single Next.js app, Postgres FTS, DB-backed jobs).**

## 18–19. Roadmap & MVP (original)
Phases 0–9: discovery → commerce core → checkout & ops → finance & inventory → PWA/SEO/perf → CRM & loyalty → AI agent → visual AI → try-on → native. MVP: 3 languages/markets, catalog/variants/media/size guide, admin + RBAC, multi-currency + FX + override, basic fees, cart/checkout/address, offline payment + receipt verification, order/shipment tracking, basic inventory & purchase cost, basic margin/expense dashboard, PWA/responsive/technical SEO, wishlist + basic reviews, AI data-entry assistant (agent in limited beta if time allows). Out of MVP: advanced try-on, full statutory accounting, full multichannel automation, complex ML, complete native apps.
**→ Re-sequenced into 12 phases / 5 checkpoints in `docs/05_ROADMAP.md`.**

## 20. Acceptance criteria (original, still valid)
1. Language/market switch changes text, direction, currency, date format and market content. 2. Order price independent of later FX changes. 3. Admin toggles/configures shipping/tax/customs/service fees without code. 4. Each color/size variant has own stock and SKU. 5. Receipt attached to order, approve/reject with audit. 6. No admin acts outside scope/permission, even via direct API. 7. Price/cost/payment/permission changes audited. 8. Mixed fa/en text doesn't break BiDi. 9. Category/product pages carry SEO content without client-only JS. 10. PWA installable; cache never creates stale cart/price. 11. AI agent only surfaces real product/price/stock from tools. 12. No AI purchase without explicit user confirmation. 13. Marketing preferences/opt-out respected everywhere. 14. Refund/return history kept; margin reports corrected. 15. Restorable backups; deployments with rollback.

## 21–26. QA, CI/CD, KPIs, principles, multi-agent collaboration, DoD
Unit tests for money/FX/fees/promotion/permission; integration tests for provider adapters; e2e browse→variant→cart→checkout→receipt→approve→shipment per locale/RTL; permission matrix negative tests; visual regression mobile; accessibility; load tests; security & dependency scanning; migration/restore tests. Git PR workflow, environments (local/preview/staging/prod), automated checks, migration rollback strategy, feature flags, canary for checkout. KPI dashboard (sales, profit, customer, product, marketing, operations, AI, quality). Principles: transparent prices before payment; no dark patterns; AI never applies refunds/discounts/price changes on its own; features never hurt core performance; every feature mobile; every integration has manual fallback; every business rule visible/testable in admin; discounts are a tool, not brand identity. Single architecture owner; agents work within scope; no silent schema/API changes. Definition of Done per feature (requirements, migrations/rollback, server-side auth, i18n/RTL tested, mobile, states, audit, tests, accessibility, docs/admin config, performance, feature flag).

## Appendix A — Admin modules
Dashboard · Catalog (Products, Variants, Categories, Collections, Brands, Media Library, Size Guides) · Inventory (Warehouses, Suppliers, Purchase Orders) · Pricing (FX, Fees, Promotions, Coupons) · Orders (Payments, Receipts, Refunds, Shipments, Returns) · Customers · CRM (Segments, Loyalty, Campaigns, Reviews) · Content/CMS · SEO · Finance (Expenses, Partners/Capital, Reports, AI Analytics) · Users (Roles, Permissions, Audit Logs) · Integrations · Market Settings · Localization · Notifications · System Health.

## Appendix B — Permission namespace (sample)
`catalog.product.view | catalog.product.create | catalog.product.edit | catalog.product.publish | pricing.sale_price.edit | pricing.cost.view | inventory.stock.adjust | order.view | order.cancel | payment.receipt.approve | payment.refund | finance.expense.create | finance.report.view | crm.customer.export | marketing.campaign.publish | security.role.manage`

## Appendix C — Analytics events (sample)
`product_viewed, variant_selected, size_guide_opened, search_performed, visual_search_used, ai_chat_started, ai_product_recommended, add_to_cart, checkout_started, payment_instruction_viewed, receipt_uploaded, order_paid, order_shipped, order_delivered, return_requested, review_submitted, campaign_clicked`

## Appendix D — Project start checklist (original)
Name & repo · initial ADRs · first-level ERD & permission matrix · design system & 5 core mobile flows · trilingual/BiDi POC · money/FX/fees POC with unit tests · product/variant/inventory POC · checkout + offline payment POC · CI/CD, staging, observability, backups · then SEO/PWA → CRM/loyalty → AI.
