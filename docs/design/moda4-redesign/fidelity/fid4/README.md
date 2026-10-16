# FID-4 — real product gallery and buy box

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D81.

Native Chromium, production application snapshot b27e4e6 (same presentation as this docs/base/test follow-up), isolated fresh PostgreSQL16;1440×900 and390×844. App **136→140/146**, cumulative **140/140**. All P1/P2 and earlier rows pass; six later fitting/account rows remain honestly red. Prototype146/146 unchanged. Native side-by-side images converted to JPEG quality88 only, reference left/application right.

Ports the1.35:1 side-by-side gallery/buy box,72px thumbnails,14px shot gaps,8px shot corners, sticky buy-box top20px below header,36px title,50px actual size controls and real crayon Add button. Existing current color/size/Decimal price/stock, gallery keyboard/lightbox/scroll, wishlist, fitting link, services, mobile purchase controls and atomic cart handlers remain.

All4 unchanged existing R5 browser cases pass on this production source: FA/TR/EN actual URL filtering and Back/Forward, search reset, quick-add, variant price, cart drawer quantity/removal and product-editor badge save/reload. EN checks include existing WCAG2A/AA/2.1AA assertions. The initial run before inherited FID-2 privacy correction timed out because the overlay intercepted reset; after the product fix, unchanged tests passed47.3s. Build/lint/typecheck pass. Current-head full CI/independent review remain required.

Manual owner review: choose colors/sizes and watch actual price/gallery; open/close zoom by keyboard; add to cart and change quantity; compare1440/390 images. Merchant catalog text, actual currency/tax/policy and available photos remain authoritative, so they are not replaced with reference demo prices. Visual approval, Windows login/runtime, hosted preview/physical devices and Required branch-protection configuration(API403) remain unverified. No merge/main push/paid call.
