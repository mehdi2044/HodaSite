import { test, expect } from "@playwright/test";

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const)
  for (const width of [390, 1440])
    test(`${locale}/${width}: committed home purchase followed immediately by slow Flight navigation`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [],
        events: object[] = [];
      page.on("pageerror", (error) =>
        errors.push(error.stack ?? error.message),
      );
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 200,
        downloadThroughput: 250000,
        uploadThroughput: 100000,
      });
      const started = Date.now();
      cdp.on("Network.requestWillBeSent", (e) => {
        if (e.type === undefined || e.type === "Document" || e.type === "Fetch")
          events.push({
            type: "request",
            id: e.requestId,
            at: Date.now() - started,
            method: e.request.method,
            path: new URL(e.request.url).pathname,
            flight: e.request.headers.RSC ?? e.request.headers.rsc ?? null,
          });
      });
      cdp.on("Network.responseReceived", (e) => {
        if (e.type === undefined || e.type === "Document" || e.type === "Fetch")
          events.push({
            type: "response",
            id: e.requestId,
            at: Date.now() - started,
            status: e.response.status,
            mime: e.response.mimeType,
            path: new URL(e.response.url).pathname,
          });
      });
      cdp.on("Network.loadingFailed", (e) =>
        events.push({
          type: "abort-or-failure",
          id: e.requestId,
          at: Date.now() - started,
          canceled: e.canceled,
          error: e.errorText,
        }),
      );
      try {
        await page.goto(`/${locale}/m/${market}`, {
          waitUntil: "domcontentloaded",
        });
        const shop = page.locator(".home-curated-shop");
        await shop.scrollIntoViewIfNeeded();
        await shop.locator(".home-look-tabs button").nth(1).click();
        const look = shop.locator(".home-look-studio:visible");
        await expect(look).toHaveAttribute(
          "data-look-id",
          "fixture-editorial-easy-days",
        );
        const piece = look.locator(".editorial-piece").first(),
          size = piece.getByRole("combobox");
        const id = (await size
          .locator('option:not([value=""]):not([disabled])')
          .first()
          .getAttribute("value"))!;
        await size.selectOption(id);
        const response = page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            !!r.request().postData()?.includes(id),
        );
        await piece.locator("button").click();
        expect((await response).status()).toBe(200);
        await expect(look.locator('[role="status"]')).toBeVisible();
        await expect(piece.locator("button")).toBeEnabled();
        await expect(look.locator(".home-look-pieces")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        events.push({
          type: "immediate-gallery-click",
          at: Date.now() - started,
        });
        await shop.locator(".home-experience-heading a").click();
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/m/${market}/looks$`),
        );
        await expect(page.locator(".lookbook h1")).toBeVisible();
        await page.goBack();
        await expect(shop).toBeAttached();
        await page.goto(`/${locale}/cart?market=${market}`);
        await expect(
          page.locator('input[type="number"][name="quantity"]'),
        ).toHaveCount(1);
        await expect(
          page.locator('input[type="number"][name="quantity"]'),
        ).toHaveValue("1");
        await page.goto(`/${locale}/checkout?market=${market}`);
        await expect(page.locator('[name="firstName"]')).toBeVisible();
        await page.goBack();
        await expect(
          page.locator('input[type="number"][name="quantity"]'),
        ).toHaveValue("1");
        await page.goForward();
        await page.reload();
        await expect(page.locator(".shop-checkout-piece")).toHaveCount(1);
        expect(
          events.some(
            (event) => "mime" in event && event.mime === "text/x-component",
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
      } finally {
        await info.attach("slow-flight-and-abort-events", {
          body: JSON.stringify(
            { locale, width, events, errors, noOrderSubmitted: true },
            null,
            2,
          ),
          contentType: "application/json",
        });
      }
    });
