import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect, type Locator } from "@playwright/test";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
for (const locale of ["fa", "tr", "en"] as const)
  test(`${locale}: purchase receipt, expense approval and capital on mobile`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const t = { fa, tr, en }[locale].financeOps;
    const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } }),
      role = await db.role.findUniqueOrThrow({ where: { key: "accountant" } });
    const id = randomUUID(),
      email = `finance-ops-${id}@example.com`,
      password = "FinanceTest123!";
    const user = await db.user.create({
      data: {
        email,
        name: "Finance test",
        passwordHash: await bcrypt.hash(password, 4),
        roles: { create: { roleId: role.id, scope: { marketId: market.id } } },
      },
    });
    const supplier = await db.supplier.create({
      data: { marketId: market.id, name: `Supplier ${id}` },
    });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin/login");
      await page.locator('[name="email"]').fill(email);
      await page.locator('[name="password"]').fill(password);
      await page.getByRole("button", { name: "ورود امن" }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await page.locator('[name="adminLocale"]').selectOption(locale);
      await expect(page.locator('aside a[href="/admin/finance"]')).toHaveText(
        { fa, tr, en }[locale].finance.title,
      );
      await page.goto(`/admin/finance/operations?marketId=${market.id}`);
      await expect(
        page.getByRole("heading", { name: t.title, exact: true }),
      ).toBeVisible();
      const section = (label: string) =>
        page.locator("section").filter({
          has: page.getByRole("heading", { name: label, exact: true }),
        });
      const rates = async (form: Locator) => {
        await form.locator('[name="currency"]').selectOption("TRY");
        await expect(form.locator('[name="rateTry"]')).toHaveValue("1");
        await form.locator('[name="rateUsd"]').fill("0.025");
      };
      const submit = async (form: Locator) => {
        await form.locator('[name="confirm"]').check();
        await form.getByRole("button", { name: t.submit, exact: true }).click();
        await expect(form.getByRole("status")).toHaveText(t.saved);
      };
      const purchase = section(t.purchases).locator("form").first();
      await purchase.locator('[name="supplierId"]').selectOption(supplier.id);
      await purchase.locator('[name="memo"]').fill(`PO ${id}`);
      await rates(purchase);
      await purchase.locator('[name="quantity"]').fill("100");
      await purchase.locator('[name="purchaseTotal"]').fill("100000");
      await purchase.locator('[name="additionalCost"]').fill("2000");
      await submit(purchase);
      const article = section(t.purchases)
        .locator("article")
        .filter({ hasText: `PO ${id}` });
      await expect(article).toContainText("1020.0000");
      await article.scrollIntoViewIfNeeded();
      await shoppingProof(page, info, `operations-purchase-${locale}`);
      const receiving = article.locator("form");
      await receiving.locator('[name="confirm"]').check();
      await receiving
        .getByRole("button", { name: t.submit, exact: true })
        .click();
      await expect(article).toContainText(t.RECEIVED);
      await expect(article.locator("form")).toHaveCount(0);
      const expense = section(t.expenses).locator("form").first();
      await expense.locator('[name="category"]').fill("Rent");
      await expense.locator('[name="memo"]').fill(`Expense ${id}`);
      await expense.locator('[name="amount"]').fill("50.0001");
      await rates(expense);
      await expense.locator('input[type="file"]').setInputFiles({
        name: "expense.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nFixture PDF\n%%EOF"),
      });
      await expect(
        expense.getByRole("link", { name: t.attachment, exact: true }),
      ).toBeVisible();
      if (locale === "fa") {
        let lost = false;
        await page.route("**/admin/finance/operations*", async (route) => {
          if (!lost && route.request().method() === "POST") {
            lost = true;
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        });
        await expense.locator('[name="confirm"]').check();
        await expense
          .getByRole("button", { name: t.submit, exact: true })
          .click();
        await expect(expense.getByRole("status")).toHaveText(t.unknown);
        await expense
          .getByRole("button", { name: t.retry, exact: true })
          .click();
        await expect(expense.getByRole("status")).toHaveText(t.saved);
        expect(
          await db.expense.count({ where: { memo: `Expense ${id}` } }),
        ).toBe(1);
        await page.unroute("**/admin/finance/operations*");
      } else await submit(expense);
      const expenseRow = section(t.expenses)
        .locator("article")
        .filter({ hasText: `Expense ${id}` });
      const approval = expenseRow.locator("form");
      await approval.locator('[name="confirm"]').check();
      await approval
        .getByRole("button", { name: t.submit, exact: true })
        .click();
      await expect(expenseRow).toContainText(t.APPROVED);
      await expect(
        expenseRow.getByRole("link", { name: t.journal }),
      ).toBeVisible();
      const partner = section(t.partners).locator("form").first();
      await partner.locator('[name="name"]').fill(`Partner ${id}`);
      await partner.locator('[name="ownershipPercent"]').fill("1");
      await partner
        .getByRole("button", { name: t.submit, exact: true })
        .click();
      await expect(partner.getByRole("status")).toHaveText(t.saved);
      const capital = section(t.partners).locator("form").nth(1);
      await capital
        .locator('[name="partnerId"]')
        .selectOption({ label: `Partner ${id}` });
      await capital.locator('[name="memo"]').fill(`Capital ${id}`);
      await capital.locator('[name="amount"]').fill("100");
      await rates(capital);
      await submit(capital);
      await expect(
        section(t.partners)
          .locator("article")
          .filter({ hasText: `Partner ${id}` }),
      ).toContainText("100.0000");
      await page
        .getByRole("heading", { name: t.title, exact: true })
        .scrollIntoViewIfNeeded();
      await shoppingProof(page, info, `operations-overview-${locale}`);
      await page.getByRole("link", { name: t.margins, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: t.margins, exact: true }),
      ).toBeVisible();
      await page.locator('[name="dimension"]').selectOption("product");
      await page.getByRole("button", { name: t.filter, exact: true }).click();
      const download = page.waitForEvent("download");
      await page
        .getByRole("link", {
          name: t.export.replace("{format}", "XLSX"),
          exact: true,
        })
        .first()
        .click();
      expect((await download).suggestedFilename()).toBe("margins.xlsx");
      await shoppingProof(page, info, `operations-margins-${locale}`);
    } finally {
      await db.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
    }
  });
