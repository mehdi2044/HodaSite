# Phase 05b — Mobile storefront design and installable web app

## Placement and purpose
After Phase 05 acceptance and before Phase 06 implementation (D54). Finish the fashion storefront/customer account design obligations and deliver a practical trilingual PWA for the predominantly mobile audience.

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
