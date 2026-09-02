# Phase 11 — Visual Search, Smart Size Assistant, Voice, Virtual Try-On POC, Native App Wrapper

## Goal
Differentiators, each behind a feature flag, budgeted and privacy-first.

## Scope
1. **Visual search**: upload/take photo → image embedding (provider via gateway, e.g., CLIP-like) → similar products (color/silhouette); crop UI; results as normal listing; nothing stored unless user consents.
2. **Smart size assistant**: inputs (height/weight/fit preference, optional past purchases/returns) → size recommendation per product using size guide + return data; confidence display; never medical claims.
3. **Voice**: speech-to-text/text-to-speech via gateway providers (fa/tr/en), voice button in chat and search; TTS only on user opt-in; cost-capped.
4. **Virtual Try-On POC**: `TryOnProvider` interface, one provider, credits (guest 1 / member 5 / VIP more, admin-configurable), queue + rate limit, image downscale, short retention (default delete after 24h, or immediately if not consented), disclaimer, A/B test flag with conversion metric.
5. **Outfit builder**: curated looks (admin) + "complete the look" → add whole look to cart.
6. **Native wrapper**: Capacitor project (`apps/mobile` folder or `/mobile`), deep links, push (FCM/APNs), camera bridge for visual search/try-on, biometric login optional, store assets & compliance checklist; CI builds Android APK/AAB; iOS build documented.
7. **Gamification (light, premium)**: style missions, badges, early access — no childish UI.

## Acceptance criteria
- Visual search returns sensible similar items for 10 seeded test images (manual eval doc).
- Try-on: credits enforced, image deleted per retention, feature off switch works instantly.
- Android APK installs and opens the storefront with deep link to a product.
