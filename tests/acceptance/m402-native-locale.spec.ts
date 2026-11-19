import { expect, test } from "@playwright/test";
import en from "../../messages/en.json";

const labels = { fa: "فارسی", tr: "Türkçe", en: "English" };
for (const [locale, target] of [
  ["en", "fa"],
  ["fa", "tr"],
  ["tr", "en"],
] as const) {
  test(`${locale} to ${target}: native journal language link works before hydration`, async ({
    page,
  }) => {
    const errors: string[] = [],
      documents: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documents.push(new URL(request.url()).pathname);
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      /\/_next\/static\/chunks\/.*\.js(?:\?|$)/,
      async (route) => {
        await gate;
        await route.continue();
      },
    );
    const destination = `/${target}/m/CA/magazine`;
    try {
      const response = await page.goto(`/${locale}/m/CA/magazine`, {
        waitUntil: "commit",
      });
      const link = page
        .getByRole("link", { name: labels[target], exact: true })
        .first();
      await expect(link).toHaveAttribute("href", destination);
      await response?.finished();
      await link.click({ noWaitAfter: true });
      await expect(page).toHaveURL(new RegExp(destination + "$"));
      await expect(page.locator("html")).toHaveAttribute("lang", target);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        target === "fa" ? "rtl" : "ltr",
      );
      expect(documents).toContain(destination);
    } finally {
      release();
    }
    await expect(page.locator(".storefront-cart-toggle")).toBeEnabled();
    await expect(page.locator('link[rel="canonical"]').first()).toHaveAttribute(
      "href",
      new RegExp(destination + "$"),
    );
    expect(
      (await page.context().cookies()).find(
        (cookie) => cookie.name === "market",
      )?.value,
    ).toBe("CA");
    expect(errors).toEqual([]);
  });
}

test("native language changes retain the existing guest cart and market", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/en/m/CA/p/product-1");
  await page.locator(".shop-add-button").click();
  await expect(
    page.getByRole("status").filter({ hasText: en.commerce.saved }).first(),
  ).toBeVisible();
  let current = "en";
  for (const target of ["fa", "tr", "en"] as const) {
    await page.goto(`/${current}/m/CA/magazine`);
    const link = page
      .getByRole("link", { name: labels[target], exact: true })
      .first();
    await expect(link).toHaveAttribute("href", `/${target}/m/CA/magazine`);
    await link.click();
    await expect(page.locator("html")).toHaveAttribute("lang", target);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      target === "fa" ? "rtl" : "ltr",
    );
    await page.goto(`/${target}/cart?market=CA`);
    await expect(
      page.locator('main input[type="number"][name="quantity"]'),
    ).toHaveValue("1");
    expect(
      (await page.context().cookies()).find(
        (cookie) => cookie.name === "market",
      )?.value,
    ).toBe("CA");
    current = target;
  }
  expect(errors).toEqual([]);
});
