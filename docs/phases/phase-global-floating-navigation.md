# Global floating storefront navigation

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D81.

Owner scope: replace the white mobile navigation with a single reusable D77 black floating dock, visible on direct homepage and public storefront routes on desktop/mobile. No fittingNav query dependency. Six real destinations; current validated PDP or selected fitting product when available, otherwise real catalog/gallery. Retain fitting layout/cart shortcut, header cart and current Hero headroom/hydration code.

Presentation setting: optional ThemeSettings.colors.navigation.floatingEnabled boolean in existing theme JSON, default enabled for old content. No schema/migration/backfill. The existing settings.theme.edit action validates/audits it, preserves it on old payloads, and serializes theme writes. Default is the owner's requested new presentation. Disabled means no floating dock, with existing header/menu/cart access retained.

Navigation is suppressed on checkout/payment and individual order/receipt flows; admin has no storefront shell. Dialogs cover/hide the dock without moving page content. Locale and market remain explicit. Mobile public dock retains the existing 84px first-paint budget; fitting retains its 109px budget. Desktop reserves a separate viewport/footer band in the storefront shell so the dock cannot cover Hero controls. Hero source/CSS/images/typography stay unchanged; the shell may budget the new desktop chrome.

Acceptance: FA/TR/EN at 360/390/430/768/1440, six readable 44px targets, one dock, direct home desktop visible, real link destinations, selected product/invalid product/market transitions, cart and sensitive-route suppression, authorized admin toggle and legacy-payload preservation. Check actual native touch/mouse/keyboard, unchanged 33 storefront regressions, fitting, Hero hydration/headroom and Fidelity, full unit/PostgreSQL, lint/typecheck/build and isolated backup/restore. Actual before/after images and Persian report. No push, PR, merge or FR3.2. Earlier previews/data/WIP/reference remain protected; owner visual acceptance is separate.
