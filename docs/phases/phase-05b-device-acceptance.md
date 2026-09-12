# Phase 05b — Physical device acceptance

Implementation and automated browser evidence are separate from a physical installation. No physical device pass has been recorded by the implementation agent. No connected phone or accessible HTTPS staging environment was available during this implementation.

## Prerequisites
- A reachable HTTPS staging URL with the exact merged commit deployed, trusted certificate, seeded demo market/catalog and test email delivery. Do not test payments with real money.
- Configured brand name and ready public logo/favicon in admin. Review actual product/hero imagery; demo placeholders are not approved merchandising.
- One Android phone with Chrome and one iPhone with Safari. Record model, OS, browser version, date, commit, market and locale below.

## Run on each device, in fa / tr / en
1. Open the staging URL in the system browser, choose a market and language, and open the installation guide in the footer. Android: use the browser install button/menu when offered. iPhone: Share → Add to Home Screen, enable Open as Web App if shown, then Add. In-app browsers may need to open Safari/Chrome first.
2. Launch from the new icon. Confirm brand icon/name, standalone window, retained language/market, safe area around notch/home indicator, portrait/landscape and readable enlarged text.
3. Browse category, open/close filters, swipe and zoom a product photo, select color/size, add/update/remove cart items. Check that the sticky purchase button does not cover content or navigation.
4. Fill checkout with the software keyboard and autofill. Complete a synthetic order, inspect instructions, upload a test receipt; open account, tracking and a delivered fixture's return form. Confirm loading, empty, error and success feedback. Verify all three languages.
5. While editing checkout, switch airplane mode on: changes/submission must be blocked, not queued. Relaunch offline: show only the generic translated reconnect page, never cached account/order/receipt data. Reconnect and explicitly return to the shop.
6. Log out. Open previous account/order routes: authorization must be required. Check another user cannot see previous private data; no private responses are in the worker cache.
7. Deploy a second test build. Leave checkout open in one window and home in another: update must be deferred. Close other shop windows, finish current work, and request update from home. Confirm a single reload, new version, old owned cache cleanup and working offline fallback. Close/relaunch the installed app once more.

## Evidence table — fill only after actual observation
| Device | OS / browser | Date / commit / HTTPS URL | Locale / market | Install / launch | Purchase / offline / logout | Update / relaunch | Evidence |
|---|---|---|---|---|---|---|---|
| Android physical phone | Pending | Pending | fa / tr / en | Not run | Not run | Not run | None |
| iPhone physical phone | Pending | Pending | fa / tr / en | Not run | Not run | Not run | None |

Automated Chromium and WebKit CI runs are retained in the PR and `storefront-mobile-proof`; they do not fill the table above. Public repository evidence must use synthetic accounts and redact private device/account/network identifiers.

Reference: [MDN installation requirements and platform differences](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). Browser installation prompts differ; a PWA is not an App Store/Play Store native publication.
