# Phase 05b — Mobile storefront design and installable web app

## Placement and purpose
After Phase 05 acceptance and before Phase 06 dashboard/workflow delivery (D54/D57). Independent financial calculation preparation may start earlier; it does not bypass Phase 05 acceptance. Finish the fashion storefront/customer account design obligations and deliver a practical trilingual PWA for the predominantly mobile audience.

## Scope
- Design from 390px; verify 360/390/430px, tablet and desktop. No horizontal overflow; content works with large text, safe-area insets, software keyboard and portrait/landscape. Persian RTL and mixed-code isolation; Turkish/English LTR. DB theme/content controls remain authoritative.
- Homepage with real approved imagery, useful category/collection/product navigation; clear search/filter/gallery/size/colour/stock and sticky cart actions; coherent cart/checkout, account/orders/tracking/returns. Loading, empty, error, success and offline states. No fake trust/discount/review claims.
- Accessible readable type, AA contrast, 44px touch targets, visible keyboard focus and labelled controls. Product photos dominate, warm neutral palette and configurable orange accent per D26. No hardcoded business copy or credential displays.
- Manifest/icons including maskable and Apple touch icon, standalone display, locale/market-safe navigation, context-appropriate Android and iPhone installation help with translated dismissible UI. Do not promise identical installation prompts across browsers.
- Versioned service worker with bounded cache for public static assets and offline fallback. Cart, checkout, account, order/invoice/return/payment, admin, APIs, authenticated and private responses MUST NOT be persisted by the service worker. No offline transactional submissions; clear online-required states. Logout, updates and old-cache cleanup have regression tests.
- Record baseline mobile measurements; optimize images/fonts/layout. Phase 08 retains final staging performance targets and release verification.

## Acceptance
- Complete browse → select variant → cart → checkout → order/tracking/return flow in fa/tr/en at mobile widths; preserve financial/security test gates.
- Inspect screenshots from actual routes with representative data, including loading/empty/error forms. Owner visual review tracked separately; automated CI is not owner approval.
- Android Chrome and iPhone Safari physical-device installation, standalone launch, relaunch, navigation, offline fallback and update tested on HTTPS; each result records browser/device/version/date. Localhost desktop and emulated devices do not satisfy physical-device installation.
- 449-test invoice baseline remains a historical baseline, not a fixed test-count target. All latest-head checks/docker/docker-runtime must pass for each PR. No production deployment or infrastructure purchase in this stage without a corresponding task.

## Remaining in Phase 08 / 11
SEO, reviews/wishlist, final launch performance and operational launch checks stay in 08. Native app wrapper and optional camera/voice/try-on integrations stay in 11.

## Delivery slices
1. Mobile homepage, header/search and bottom navigation; approve representative 390px screenshots first.
2. Product listing/filtering and product gallery/variant selection with clear stock and sizing.
3. Cart, checkout/payment instructions, customer account and order/tracking/return states.
4. Install help, manifest/icons, safe-area/standalone behavior and safe offline/update flow.
5. Cross-language/width checks and physical Android/iPhone HTTPS acceptance; measure performance against the recorded baseline.


## First navigation slice
The first implementation provides a compact header/search, language and market disclosure, and a four-item bottom navigation below 1024px. It preserves DB-controlled branding/theme/menus, adds safe-area/content spacing and offsets sticky purchase controls. Keyboard closing and a skip-content target are included. `tests/e2e/mobile-navigation.spec.ts` records actual 390px screenshots and navigation timing in fa/tr/en and checks 360/390/430px, large text and desktop. CI preserves `storefront-mobile-proof` for visual review. This is not PWA installation acceptance: manifest, offline/update policies, phone installation and the remaining shopping-flow design slices still follow.


## Shopping / installation implementation
The next delivery implements the remaining shopping surfaces and install/offline/update foundation. Installation branding is derived from the existing Brand/Theme panel, with translated UI overrides. `pwa/[locale]` documents are intentionally public and outside session middleware. The worker caches only bounded public static code and generic offline HTML, not product images or personalized server output. Build-specific cache cleanup and safe waiting-worker activation are covered by regression tests. Physical-device acceptance is recorded separately in [device acceptance](phase-05b-device-acceptance.md); do not close the full phase based on emulation alone.
