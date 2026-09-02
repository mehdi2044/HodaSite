# Phase 09 — CRM 360, Segments, Promotion/Coupon Engine, Loyalty, Campaigns, Consent, Return Portal

## Goal
Retention & growth engine, compliant with per-market consent laws (CASL/KVKK/…), without dark patterns.

## Scope
1. **Customer 360** in admin: profile, orders, returns, wishlist, carts, reviews, sessions summary, tags, notes, RFM score, CLV, churn risk (rule-based), timeline.
2. **Consent & preferences**: per-channel opt-in (email/SMS/WhatsApp/Telegram/push) with timestamp/source/IP; preference center page; unsubscribe links; export/delete requests workflow (GDPR/KVKK/PIPEDA style).
3. **Promotion engine** (rules, not hard-code): `Promotion` (type: percent/fixed/free-shipping/buy-x-get-y/spend-x-get-y/bundle; conditions: market, dates, customer segment, categories/products, min basket, first order, coupon required, usage limits per customer/total; stacking rules & priority; exclusions) → applied in `quoteCart` with a `DiscountLine`. `Coupon` codes (single/bulk generated). Admin simulator. Clear display in cart/checkout/invoice.
4. **Segment builder** (no-code): conditions on market, orders count/value, last order date, categories bought, AOV, tags, consent, locale → saved segments with live count; used by promotions and campaigns.
5. **Loyalty**: `LoyaltyAccount`, `PointsTransaction` (earn on DELIVERED, expiry, adjustments), tiers (config), redeem as discount at checkout (rule), referral codes, birthday reward (uses optional birth date), early access to collections (segment-gated visibility), member-only prices. Display in account area, styled premium (per §B).
6. **Campaigns & automation**: `Campaign` (channel, segment, template, schedule, market), `Journey` flows: welcome, abandoned cart (1h/24h), browse abandonment, back-in-stock, price drop, post-purchase review request, win-back — each toggleable with delays; providers: email (existing), SMS (`twilio`/`kavenegar`/`netgsm` adapters + noop), WhatsApp/Telegram (link-based first; API adapters optional), push (from Phase 08 subscriptions). UTM tagging, campaign revenue attribution (last-touch), ROI report. Frequency cap per customer. Multi-account social/messaging per market in settings.
7. **Return/Exchange portal** (full): eligibility rules per market (days, categories), reason codes, photo upload, exchange size/color creates linked order without payment when same price, refund to store credit or original method (manual), restock/quarantine/damaged workflow, return-rate analytics per product/size + alert.
8. **Reviews**: Q&A with moderation; review request email; AI summary of reviews (read-only, flagged) — optional.

## Acceptance criteria
- Coupon valid only in CA with min basket; stacking conflict resolved by priority; invoice shows discount lines.
- Segment count matches SQL ground truth in tests.
- Opted-out customer never receives campaign/journey messages (test).
- Points earned only after DELIVERED and reversed on refund.
- Exchange flow creates linked order and adjusts stock correctly.
