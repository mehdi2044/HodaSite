import { expect, test } from "@playwright/test";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

// Admin search must follow the selected UI language, independently of the browser.
test.use({ locale: "en-US" });

for (const [locale, market, messages] of [
  ["fa", "IR", fa],
  ["tr", "TR", tr],
  ["en", "CA", en],
] as const) {
  test(`${locale}: collection filtering, product selection and bag summary remain usable`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/m/${market}`);
    const browse = page
      .locator(".shop-department-shelf")
      .first()
      .locator(".shop-section-link");
    const categoryHref = await browse.getAttribute("href");
    await browse.click();
    await expect(page.locator(".shop-category-portrait img")).toBeVisible();
    await expect(page.locator(".shop-category-artwork figcaption")).toHaveText(
      messages.shopping.demoImage,
    );
    await expect(
      page.locator(".shop-category-artwork figcaption"),
    ).toBeVisible();
    await shoppingProof(page, info, `${locale}-category`);
    const toggle = page.locator(".shop-filter-toggle");
    await expect(toggle).toHaveAccessibleName(messages.catalog.filters);
    await toggle.click();
    const sheet = page.locator("dialog.shop-sheet");
    await expect(sheet).toBeVisible();
    await sheet.locator('select[name="sort"]').selectOption("price-asc");
    await sheet
      .getByRole("button", { name: messages.catalog.apply, exact: true })
      .click();
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(sheet).not.toBeVisible();
    await expect(toggle.locator("span")).toHaveText(
      new Intl.NumberFormat(locale).format(1),
    );
    await expect(toggle).toHaveAccessibleName(
      `${messages.catalog.filters} (${new Intl.NumberFormat(locale).format(1)})`,
    );
    await toggle.click();
    await sheet
      .getByRole("button", { name: messages.shopping.reset, exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname === categoryHref && url.search === "",
    );
    await expect(toggle).toHaveAccessibleName(messages.catalog.filters);
    await page.goto(
      `/${locale}/m/${market}/p/${encodeURIComponent(locale === "fa" ? "نمونه-women-tee" : "demo-women-tee")}`,
    );
    const purchase = page.locator(".shop-purchase-panel");
    expect(
      await page
        .locator(".shop-product-overview")
        .evaluate((el) =>
          Boolean(
            el.compareDocumentPosition(
              document.querySelector(".shop-gallery")!,
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        ),
    ).toBe(true);
    const details = page.locator(".shop-product-details");
    expect(
      await purchase.evaluate((el) =>
        Boolean(
          el.compareDocumentPosition(
            document.querySelector(".shop-product-details")!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    await expect(details).toHaveAttribute("open", "");
    await page.locator(".shop-demo-disclosure summary").click();
    await expect(
      page.getByText(messages.shopping.demoImageNote, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: messages.shopping.fullImage, exact: true })
      .click();
    await expect(page.locator("dialog.shop-gallery-zoom")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.shop-gallery-zoom")).not.toBeVisible();
    await purchase.locator("button[aria-pressed]").last().click();
    const variantId = await purchase.locator('[name="variantId"]').inputValue();
    expect(variantId).not.toBe("");
    await page
      .getByRole("button", { name: messages.catalog.addToCart, exact: true })
      .click();
    await expect(
      purchase.locator(".shop-product-submit").getByRole("status"),
    ).toHaveText(messages.commerce.saved);
    await page
      .getByTestId("mobile-bottom-navigation")
      .locator(`a[href="/${locale}/cart"]`)
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/cart`));
    const cartItem = page.locator(".shop-cart-item").filter({
      has: page.locator(`input[name="variantId"][value="${variantId}"]`),
    });
    await expect(cartItem).toHaveCount(1);
    await expect(
      cartItem.locator('[name="quantity"][type="number"]'),
    ).toHaveValue("1");
    await expect(page.locator(".shop-bag-count")).toBeVisible();
    await page.locator(".shop-summary-jump").click();
    await expect(page).toHaveURL(/#cart-summary$/);
    await expect(page.locator("#cart-summary-title")).toBeInViewport();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await shoppingProof(page, info, `design-bag-${locale}-${width}`);
    }
  });

  test(`${locale}: admin sections can be searched and reached on mobile`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/login");
    await page
      .getByLabel("ایمیل")
      .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
    await page
      .getByLabel("رمز عبور")
      .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
    await fillAdminMfa(page);
    await page.getByRole("button", { name: "ورود امن" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    if (locale !== "fa") {
      await page.locator('select[name="adminLocale"]').selectOption(locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        messages.commerce.dashboard,
      );
    }
    const tasks = page.locator(".admin-task-grid");
    await expect(tasks.getByRole("link")).toHaveCount(4);
    const categoryTask = tasks.getByRole("link", {
      name: new RegExp(messages.adminShell.taskCategories),
    });
    await expect(categoryTask).toHaveAttribute(
      "href",
      "/admin/catalog/taxonomy#taxonomy-category",
    );
    await shoppingProof(page, info, `design-dashboard-${locale}-390`);
    await categoryTask.click();
    await expect(page.locator("#taxonomy-category h2")).toBeInViewport();
    await expect(
      page.getByRole("navigation", {
        name: messages.catalogAdmin.taxonomySections,
      }),
    ).toBeAttached();
    await page.goto("/admin");
    const toggle = page.getByRole("button", {
      name: messages.adminShell.menu,
      exact: true,
    });
    const nav = page.getByRole("navigation", {
      name: messages.adminShell.navigation,
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(nav).toBeVisible();
    if (locale === "tr") {
      const search = nav.getByLabel(messages.adminShell.searchNavigation);
      await search.fill("içerik");
      await expect(nav.locator("summary")).toHaveText([
        messages.adminShell.groupContent,
      ]);
      await expect(nav.getByRole("link")).not.toHaveCount(0);
      await search.fill("iletişim");
      await expect(
        nav.getByRole("link", {
          name: messages.adminShell.contact,
          exact: true,
        }),
      ).toBeVisible();
    }
    await nav
      .getByLabel(messages.adminShell.searchNavigation)
      .fill(messages.adminShell.products);
    await nav
      .getByRole("link", { name: messages.adminShell.products, exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/catalog\/products$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const active = nav.locator('a[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("href", "/admin/catalog/products");
    await nav
      .getByLabel(messages.adminShell.searchNavigation)
      .fill("no-matching-section-xyz");
    await expect(nav.getByRole("status")).toHaveText(
      messages.adminShell.navigationEmpty,
    );
    await nav.getByLabel(messages.adminShell.searchNavigation).press("Escape");
    await expect(toggle).toBeFocused();
    await expect(nav).not.toBeVisible();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await shoppingProof(page, info, `design-admin-${locale}-${width}`);
    }
    const filters = page.locator(".admin-catalog-filters");
    await filters.locator('[name="q"]').fill("no-matching-product-xyz");
    await filters
      .getByRole("button", { name: messages.catalogAdmin.apply, exact: true })
      .click();
    await expect(page.locator(".admin-table-empty")).toBeVisible();
    await page
      .getByRole("link", {
        name: messages.catalogAdmin.clearFilters,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/admin\/catalog\/products$/);
    await expect(page.locator(".admin-table-empty")).toHaveCount(0);
  });
}
