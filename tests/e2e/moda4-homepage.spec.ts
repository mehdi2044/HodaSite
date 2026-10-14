import { test, expect } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import en from "../../messages/en.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
const db = new PrismaClient();
test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 20000 });
test("R3b full real CMS: private unsaved renderer, ordered blocks and publication visible in open storefront", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  const previous = await db.homepage.findFirst({
    where: { marketId: market.id },
  });
  const shop = await context.newPage();
  try {
    await context.addCookies([
      { name: "admin-locale", value: "en", url: info.project.use.baseURL! },
      { name: "market", value: "CA", url: info.project.use.baseURL! },
    ]);
    await page.goto("/admin/login");
    await page
      .locator('input[name="email"]')
      .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
    await page
      .locator('input[name="password"]')
      .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
    await fillAdminMfa(page);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/admin(?:\/|$)/);
    await shop.goto("/en/m/CA");
    await page.goto(`/admin/content/homepage?scope=${market.id}`);
    const form = page.getByTestId("homepage-form");
    const type = form.getByRole("combobox", {
      name: en.homepageAdmin.add,
      exact: true,
    });
    await type.selectOption("NewIn");
    await form
      .getByRole("button", { name: en.homepageAdmin.add, exact: true })
      .click();
    const block = form.locator("details").last();
    await block
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(0)
      .fill("تازه‌های آزمون");
    await block
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(1)
      .fill("Deneme yenileri");
    await block
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(2)
      .fill("R3b new arrivals proof");
    await block
      .getByRole("combobox", { name: en.modaAdmin.source, exact: true })
      .selectOption("manual");
    await block
      .locator(".moda-manual-products label")
      .filter({ hasText: "" })
      .first()
      .locator("input")
      .check();
    await page
      .getByRole("combobox", {
        name: en.modaAdmin.previewLanguage,
        exact: true,
      })
      .selectOption("en");
    const preview = page.getByTestId("homepage-unsaved-preview").contentFrame();
    await expect(
      preview.getByRole("heading", {
        name: "R3b new arrivals proof",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      shop.getByRole("heading", {
        name: "R3b new arrivals proof",
        exact: true,
      }),
    ).toHaveCount(0);
    await block
      .getByRole("button", { name: en.modaAdmin.clone, exact: true })
      .click();
    expect(await form.locator("details").count()).toBeGreaterThan(1);
    const copy = form.locator("details").last();
    await copy
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(2)
      .fill("R3b duplicate proof");
    await copy
      .getByRole("checkbox", { name: en.modaAdmin.enabled, exact: true })
      .uncheck();
    await copy
      .getByRole("button", { name: en.homepageAdmin.remove, exact: true })
      .click();
    await form
      .getByRole("button", { name: en.modaAdmin.restoreRemoved, exact: true })
      .click();
    await expect(
      form
        .locator("details")
        .last()
        .getByRole("checkbox", { name: en.modaAdmin.enabled, exact: true }),
    ).not.toBeChecked();
    await form
      .getByRole("button", { name: en.homepageAdmin.save, exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText(en.modaAdmin.saved);
    await page.reload();
    const saved = await db.homepage.findFirstOrThrow({
      where: { marketId: market.id },
    });
    expect(JSON.stringify(saved.draftBlocks)).toContain(
      "R3b new arrivals proof",
    );
    expect(JSON.stringify(saved.blocks)).not.toContain(
      "R3b new arrivals proof",
    );
    await page
      .getByTestId("homepage-form")
      .getByRole("button", { name: en.scenes.publishChanges, exact: true })
      .click();
    await expect(
      shop.getByRole("heading", {
        name: "R3b new arrivals proof",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      shop.getByRole("heading", { name: "R3b duplicate proof", exact: true }),
    ).toHaveCount(0);
    await shop.screenshot({
      path: test.info().outputPath("r3b-cms-public-390.png"),
      fullPage: true,
    });
    for (const locale of ["fa", "tr", "en"]) {
      await shop.goto(`/${locale}/m/CA`);
      await expect(shop.locator("main")).toBeVisible();
      expect(
        await shop.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  } finally {
    if (previous) {
      const { id, createdAt, updatedAt, ...rest } = previous;
      void createdAt;
      void updatedAt;
      await db.homepage.update({
        where: { id },
        data: {
          ...rest,
          blocks: rest.blocks as Prisma.InputJsonValue,
          draftBlocks:
            rest.draftBlocks === null
              ? Prisma.DbNull
              : (rest.draftBlocks as Prisma.InputJsonValue),
        },
      });
    } else {
      const home = await db.homepage.findFirst({
        where: { marketId: market.id },
      });
      if (home)
        await db.homepage.update({
          where: { id: home.id },
          data: { deletedAt: new Date() },
        });
    }
    await shop.close();
  }
});
