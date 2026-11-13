import { expect, test } from "@playwright/test";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import { fillAdminMfa } from "./helpers/admin-mfa";

const hoodie = "seed-moda4-style-kids-hoodie";
const scarf = "seed-moda4-style-accessories-scarf";
const pick = (id: string) => `[data-product-id="${id}"] .moda-instant-pick`;
const markets = [
  ["fa", "IR", fa],
  ["tr", "TR", tr],
  ["en", "CA", en],
] as const;

for (const [locale, market, copy] of markets) {
  test(`FR3.1b ${locale} readable dock and selected product at 360/390/430`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/${locale}/fitting-room?market=${market}`);
    const dock = page.getByTestId("mobile-bottom-navigation");
    const navProduct = dock.getByRole("link", {
      name: copy.instantFitting.dockProduct,
      exact: true,
    });
    await expect(navProduct).toHaveAttribute("href", /#instant-gallery$/);
    await expect(page.locator(".storefront-app")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(dock.getByRole("link")).toHaveCount(7);
      expect(
        await dock.getByRole("link").evaluateAll((links) =>
          links.every((link) => {
            const r = link.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(link);
            return (
              r.width >= 44 &&
              r.height >= 44 &&
              r.left >= 0 &&
              r.right <= innerWidth &&
              [...range.getClientRects()].every(
                (text) => text.left >= r.left && text.right <= r.right,
              ) &&
              Number.parseFloat(getComputedStyle(link).fontSize) >= 13
            );
          }),
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.locator(pick(scarf)).tap();
    await expect(navProduct).toHaveAttribute(
      "href",
      new RegExp(`/${locale}/m/${market}/p/`),
    );
    await expect(
      dock.getByRole("link", { name: copy.commerce.cart, exact: true }),
    ).toHaveAttribute("href", `/${locale}/cart?market=${market}`);
    const remove = page
      .locator(".moda-fr31-receipt li")
      .getByRole("button", { name: copy.instantFitting.remove, exact: true });
    await remove.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await expect
      .poll(
        async () =>
          (await remove.boundingBox())!.y +
          (await remove.boundingBox())!.height,
      )
      .toBeLessThan((await dock.boundingBox())!.y);
    const expectedTitle = await page
      .locator(".moda-fr31-receipt li strong")
      .innerText();
    await navProduct.tap();
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}/p/`));
    await expect(
      page.getByRole("heading", { name: expectedTitle, level: 1 }),
    ).toBeVisible();
  });
}

test("FR3.1b receipt edits real color and size and buys exactly the displayed composition", async ({
  page,
}) => {
  test.skip(
    !process.env.FR31B_COLOR_FIXTURE,
    "Needs the separate approved two-color catalog fixture",
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/en/fitting-room?market=CA");
  await page.locator('[data-model-kind="BOY"]').click();
  await page.locator(pick(hoodie)).click();
  await page.locator(pick(scarf)).click();
  const receipt = page.locator(".moda-fr31-receipt");
  const row = receipt.locator('li[data-receipt-variant*="kids-hoodie"]');
  const hoodieLayer = page
    .locator('[data-fitting-piece-target*="kids-hoodie"] img')
    .first();
  const before = await hoodieLayer.getAttribute("src");
  await row.locator("summary").click();
  await row
    .getByRole("combobox", {
      name: en.instantFitting.receiptColor,
      exact: true,
    })
    .selectOption("seed-color-sage");
  const apply = row.getByRole("button", {
    name: en.instantFitting.receiptApplyVariant,
  });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(row).toHaveAttribute("data-receipt-variant", /-sage-4y$/);
  await expect(hoodieLayer).not.toHaveAttribute("src", before!);
  const size = row.getByRole("combobox", {
    name: en.instantFitting.receiptSize,
    exact: true,
  });
  const sizeValue = await size
    .locator("option")
    .filter({ hasText: /^8\s*Y$/i })
    .getAttribute("value");
  await size.selectOption(sizeValue!);
  await apply.click();
  await expect(row).toHaveAttribute("data-receipt-variant", /-sage-8y$/);
  const ids = await receipt
    .locator("li")
    .evaluateAll((rows) =>
      rows.map((el) => el.getAttribute("data-receipt-variant")),
    );
  expect(ids).toContain("seed-moda4-seed-style-v2-accessories-scarf-one-size");
  const total = (await receipt
    .locator(".moda-fr31-total bdi")
    .textContent())!.trim();
  await receipt
    .getByRole("button", { name: en.instantFitting.addAll, exact: true })
    .click();
  await expect(receipt.getByRole("status")).toHaveText(en.instantFitting.added);
  await page.goto("/en/cart?market=CA");
  expect(
    (
      await page
        .locator('.shop-cart-controls input[name="variantId"]')
        .evaluateAll((inputs) => [
          ...new Set(inputs.map((el) => (el as HTMLInputElement).value)),
        ])
    ).sort(),
  ).toEqual(ids.sort());
  await expect(
    page.locator(".shop-order-summary dl > div").first().locator("dd"),
  ).toHaveText(total);
});

test("FR3.1b Cutout panel proposes and previews an attachment before approval", async ({
  page,
  context,
}, info) => {
  test.skip(
    !process.env.FR31_ADMIN_FIXTURE,
    "Requires a separate admin fixture",
  );
  await page.goto("/admin/login");
  await page.locator('[name="email"]').fill(process.env.ADMIN_EMAIL!);
  await page.locator('[name="password"]').fill(process.env.ADMIN_PASSWORD!);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await context.addCookies([
    { name: "hoda.admin.locale", value: "en", url: info.project.use.baseURL! },
  ]);
  await page.goto(`/admin/catalog/cutouts?product=${scarf}`);
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="payload"]') });
  const c = en.cutouts;
  await form
    .getByRole("combobox", { name: c.model, exact: true })
    .selectOption("woman");
  const x = form.getByLabel(c.fields.x, { exact: true });
  await x.fill("0.25");
  await form.getByRole("button", { name: c.attachmentSuggest }).click();
  await expect(x).toHaveValue("0.5");
  await expect(page.getByTestId("cutout-visual")).toBeVisible();
  await expect(form.getByLabel(c.confirm, { exact: true })).not.toBeChecked();

  await page.goto(
    "/admin/catalog/cutouts?product=seed-moda4-style-men-tee&color=seed-color-navy",
  );
  await form
    .getByRole("combobox", { name: c.model, exact: true })
    .selectOption("man");
  await expect(form.getByRole("alert")).toContainText(c.placementMissing);
  await expect(form.getByText(c.attachmentManual)).toBeVisible();
});
