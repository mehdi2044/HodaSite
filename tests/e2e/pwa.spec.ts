import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
for (const locale of ["fa", "tr", "en"] as const) {
  const t = { fa, tr, en }[locale];
  test(`${locale} manifest, brand icons, isolated offline and online recovery`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}`);
    const manifestLink = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    const response = await page.request.get(manifestLink!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("manifest+json");
    const m = await response.json();
    expect(m.lang).toBe(locale);
    expect(m.display).toBe("standalone");
    expect(m.id).toBe("/");
    expect(m.start_url).toMatch(new RegExp(`^/${locale}(\\?|$)`));
    expect(m.theme_color).toBeTruthy();
    for (const size of [180, 192, 512]) {
      const icon = await page.request.get(`/pwa/${locale}/icon/${size}`);
      expect(icon.status()).toBe(200);
      const meta = await sharp(await icon.body()).metadata();
      expect([meta.width, meta.height]).toEqual([size, size]);
    }
    expect((await page.request.get(`/pwa/${locale}/icon/999`)).status()).toBe(
      404,
    );
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await page.locator(".pwa-install-help summary").click();
    await expect(page.locator(".pwa-install-help")).toContainText(
      t.pwa.iphoneHelp,
    );
    await shoppingProof(page, info, `${locale}-install-help`);
    await page.goto(`/${locale}/account/login`);
    const email = page.locator('main input[name="email"]');
    await email.fill("offline@example.com");
    await context.setOffline(true);
    await expect(
      page.locator('main button[type="submit"],main form button').first(),
    ).toBeDisabled();
    await expect(page.locator(".pwa-connection")).toBeVisible();
    await shoppingProof(page, info, `${locale}-offline-form`);
    await page.goto(`/${locale}/orders/private-proof/pay?token=do-not-cache`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      t.pwa.offlineTitle,
    );
    expect(await page.content()).not.toContain("do-not-cache");
    await shoppingProof(page, info, `${locale}-offline`);
    const keys = await page.evaluate(async () => {
      const names = await caches.keys();
      return (
        await Promise.all(
          names
            .filter((n) => n.startsWith("hoda-public-pwa-"))
            .map(async (n) =>
              (await (await caches.open(n)).keys()).map((r) => r.url),
            ),
        )
      ).flat();
    });
    expect(keys.some((k) => k.includes(`/pwa/${locale}/offline`))).toBe(true);
    for (const key of keys)
      expect(new URL(key).pathname).toMatch(
        /^\/(pwa\/(fa|tr|en)\/offline$|_next\/static\/)/,
      );
    expect(keys.join()).not.toMatch(/private-proof|do-not-cache/);
    await context.setOffline(false);
    await page.getByRole("link", { name: t.pwa.retry }).click();
    await expect(page.locator('header input[name="q"]')).toBeVisible();
  });
}
test("manifest preserves the selected market on a fresh launch without cookies", async ({
  page,
  context,
}) => {
  const manifest = await (
    await page.request.get("/pwa/en/manifest.webmanifest?market=TR")
  ).json();
  expect(manifest.start_url).toBe("/en?market=TR");
  await context.clearCookies();
  await page.goto(manifest.start_url);
  expect(
    (await context.cookies()).find((c) => c.name === "market")?.value,
  ).toBe("TR");
});
for (const path of ["/en", "/fa/m/IR", "/tr/m/TR", "/en/m/CA"]) {
  test(`${path} install promotion is dismissible and absent in standalone`, async ({
    page,
  }) => {
    const locale = path.split("/")[1] as "fa" | "tr" | "en";
    const t = { fa, tr, en }[locale];
    await page.goto(path);
    await page.evaluate(() => {
      localStorage.removeItem("hoda.install.dismissed");
    });
    await page.reload();
    // A synthetic event must wait for React's effect to register its handler.
    // The real handler prevents this cancelable event; false proves receipt.
    const offerInstall = async () => {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const e = new Event("beforeinstallprompt", { cancelable: true });
            Object.assign(e, {
              prompt: async () => {},
              userChoice: Promise.resolve({ outcome: "dismissed" }),
            });
            return window.dispatchEvent(e);
          }),
        )
        .toBe(false);
    };
    await offerInstall();
    await expect(page.locator(".pwa-install-prompt")).toBeVisible();
    await page.getByRole("button", { name: t.pwa.later, exact: true }).click();
    await page.reload();
    await offerInstall();
    await expect(page.locator(".pwa-install-prompt")).not.toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.locator(".pwa-install")).not.toBeVisible();
  });
}

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`${locale} canonical home exposes waiting-worker update controls`, async ({
    page,
  }) => {
    // Synthetic registration checks the real UI/action wiring. Actual worker
    // activation and multi-window guards are separately exercised in the VM suite.
    await page.addInitScript(() => {
      Object.defineProperty(navigator.serviceWorker, "register", {
        value: async () => ({
          waiting: {
            postMessage: (data: { type: string }) => {
              document.documentElement.dataset.pwaMessage = data.type;
              navigator.serviceWorker.dispatchEvent(
                new MessageEvent("message", {
                  data: { type: "UPDATE_DEFERRED" },
                }),
              );
            },
          },
          active: null,
          addEventListener: () => {},
          update: async () => {},
        }),
      });
    });
    const t = { fa, tr, en }[locale];
    await page.goto(`/${locale}/m/${market}`);
    const update = page.locator(".pwa-update");
    await expect(update).toBeVisible();
    await update
      .getByRole("button", { name: t.pwa.update, exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-pwa-message",
      "ACTIVATE_UPDATE",
    );
    await expect(update).toContainText(t.pwa.updateDeferred);
    await page.goto(`/${locale}/cart`);
    await expect(page.locator(".pwa-update")).toHaveCount(0);
  });
}
