import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { returnFixture } from "../helpers/returns";
import { shoppingProof } from "./helpers/shopping-proof";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale}: scoped accountant filters, daily report and private CSV on mobile`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    const month = { fa: "01", tr: "02", en: "03" }[locale];
    const day = `2002-${month}-15`,
      t = { fa, tr, en }[locale].finance;
    const f = await returnFixture(db, {
      pending: true,
      price: "50",
      quantity: 2,
    });
    await db.order.update({
      where: { id: f.order.id },
      data: { status: "PAID", paidAt: new Date(`${day}T00:00:00Z`) },
    });
    const payment = await db.payment.create({
      data: {
        orderId: f.order.id,
        currency: f.market.currency,
        amount: "100",
        method: "CASH",
        status: "APPROVED",
        reviewedAt: new Date(`${day}T00:00:00Z`),
      },
    });
    await db.refund.create({
      data: {
        orderId: f.order.id,
        paymentId: payment.id,
        currency: f.market.currency,
        amount: "10.0001",
        method: "CASH",
        status: "COMPLETED",
        reason: "Finance browser fixture",
        createdAt: new Date(`${day}T12:00:00Z`),
      },
    });
    const role = await db.role.findUniqueOrThrow({
      where: { key: "accountant" },
    });
    const email = `finance-${randomUUID()}@example.com`,
      password = "FinanceTest123!";
    const user = await db.user.create({
      data: {
        email,
        name: "Finance test",
        passwordHash: await bcrypt.hash(password, 4),
        roles: {
          create: { roleId: role.id, scope: { marketId: f.market.id } },
        },
      },
    });
    try {
      await page.goto("/admin/login");
      await page.locator('[name="email"]').fill(email);
      await page.locator('[name="password"]').fill(password);
      await page.getByRole("button", { name: "ورود امن" }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await page.locator('[name="adminLocale"]').selectOption(locale);
      const link = page.locator('aside a[href="/admin/finance"]');
      await expect(link).toHaveText(t.title);
      await link.click();
      const panel = page.getByTestId("finance-report");
      await expect(panel.getByRole("heading", { name: t.title })).toBeVisible();
      expect(
        await panel.locator('select[name="marketId"] option').allTextContents(),
      ).toEqual([t.allMarkets, "TR"]);
      await panel.locator('[name="from"]').fill(day);
      await panel.locator('[name="to"]').fill(day);
      await panel.locator('[name="marketId"]').selectOption(f.market.id);
      await panel.getByRole("button", { name: t.apply }).click();
      await expect(page).toHaveURL(
        new RegExp(`from=${day}&to=${day}&marketId=${f.market.id}`),
      );
      const row = panel.locator(`article[data-market="${f.market.id}"]`);
      const amount = { fa: "۸۹٫۹۹۹۹", tr: "89,9999", en: "89.9999" }[locale];
      await expect(row.locator('[data-metric="netExternal"] dd')).toContainText(
        amount,
      );
      await panel.scrollIntoViewIfNeeded();
      await shoppingProof(page, info, `finance-${locale}`);
      await row.locator(".finance-metrics").scrollIntoViewIfNeeded();
      await shoppingProof(page, info, `finance-metrics-${locale}`);
      await row.locator("summary").click();
      await expect(row.locator("tbody tr")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const downloadPromise = page.waitForEvent("download");
      await panel.getByRole("link", { name: t.export }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("finance-report.csv");
      const csv = await readFile((await download.path())!, "utf8");
      expect(csv).toContain('"89.9999"');
      expect(csv).toContain(t.netExternal);
      expect(csv).not.toContain(f.customer.email);
      expect(csv).not.toContain('"IR"');
      const ir = await db.market.findUniqueOrThrow({ where: { code: "IR" } });
      const denied = await page.request.get(
        `/admin/finance/export?marketId=${ir.id}&userId=forged-owner`,
      );
      expect(denied.status()).toBe(403);
      expect(denied.headers()["cache-control"]).toBe("private, no-store");
      // Direct unauthorized page is denied before streaming report content.
      expect(
        (await page.goto(`/admin/finance?marketId=${ir.id}`))!.status(),
      ).toBe(404);
      await expect(page.getByTestId("finance-report")).toHaveCount(0);
      await page.goto(`/admin/finance?from=${day}&to=2001-01-01`);
      await expect(
        page.getByTestId("finance-report").getByRole("alert"),
      ).toHaveText(t.invalid);
      await expect(
        page
          .getByTestId("finance-report")
          .getByRole("link", { name: t.export }),
      ).toHaveCount(0);
    } finally {
      await db.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
    }
  });
}
test.afterAll(() => db.$disconnect());
