import { test, expect } from "@playwright/test";
import { ensureMaintenanceOff } from "./helpers/maintenance";

// Phase 01a §1: "cookie persistence (market, NEXT_LOCALE)". A first visit
// with no market cookie should get one set by the middleware, defaulted per
// locale (fa -> IR). Kept separate from tests/e2e/markets.spec.ts, which
// pins the cookie explicitly to test the enabledLocales gate deterministically.
test("middleware sets a market cookie on the first storefront visit", async ({
  page,
  context,
}) => {
  await ensureMaintenanceOff(page.request);
  await context.clearCookies();
  await page.goto("/fa");

  const marketCookie = (await context.cookies()).find(
    (c) => c.name === "market",
  );
  expect(marketCookie?.value).toBe("IR");
});
