import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { reconciliationFixture } from "../../helpers/reconciliation";
import { shoppingProof } from "./shopping-proof";
import fa from "../../../messages/fa.json";
import tr from "../../../messages/tr.json";
import en from "../../../messages/en.json";

export function reconciliationBrowserFlows() {
  const db = new PrismaClient();
  test.afterAll(() => db.$disconnect());
  for (const locale of ["fa", "tr", "en"] as const) {
    test(`${locale}: accountant reviews cash, spent credit and discrepancies on mobile without writes`, async ({
      page,
      browserName,
    }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width: 390, height: 844 });
      const month = { fa: "08", tr: "09", en: "10" }[locale],
        day = `2006-${month}-${browserName === "webkit" ? "16" : "15"}`;
      const t = { fa, tr, en }[locale].reconciliation,
        ft = { fa, tr, en }[locale].finance;
      const f = await reconciliationFixture(db, { day });
      const bad = await reconciliationFixture(db, { day, mismatch: true });
      const outside = await reconciliationFixture(db, { day, code: "IR" });
      const role = await db.role.findUniqueOrThrow({
        where: { key: "accountant" },
      });
      const email = `reconciliation-${randomUUID()}@example.com`,
        password = "ReconcileTest123!";
      const user = await db.user.create({
        data: {
          email,
          name: "Reconciliation test",
          passwordHash: await bcrypt.hash(password, 4),
          roles: {
            create: { roleId: role.id, scope: { marketId: f.market.id } },
          },
        },
      });
      const evidence = () =>
        db.order.findMany({
          where: { id: { in: [f.order.id, bad.order.id] } },
          include: {
            payments: { orderBy: { id: "asc" } },
            creditUses: { orderBy: { id: "asc" } },
          },
          orderBy: { id: "asc" },
        });
      const before = await evidence();
      try {
        await page.goto("/admin/login");
        await page.locator('[name="email"]').fill(email);
        await page.locator('[name="password"]').fill(password);
        await page.getByRole("button", { name: "ورود امن" }).click();
        await expect(page).toHaveURL(/\/admin$/);
        await page.locator('[name="adminLocale"]').selectOption(locale);
        const financeLink = page.locator('aside a[href="/admin/finance"]');
        await expect(financeLink).toHaveText(ft.title);
        await financeLink.click();
        await page
          .getByTestId("finance-report")
          .getByRole("link", { name: t.title })
          .click();
        const list = page.getByTestId("reconciliation-list");
        await expect(
          list.getByRole("heading", { name: t.title }),
        ).toBeVisible();
        await expect(list.locator('select[name="marketId"] option')).toHaveText(
          [ft.allMarkets, "TR"],
        );
        await list.locator('[name="from"]').fill(day);
        await list.locator('[name="to"]').fill(day);
        await list.locator('[name="marketId"]').selectOption(f.market.id);
        await list.getByRole("button", { name: ft.apply }).click();
        const row = list.locator(`[data-order="${f.order.id}"]`);
        await expect(row).toContainText(t.matched);
        await expect(
          list.locator(`[data-order="${bad.order.id}"]`),
        ).toContainText(t.needsReview);
        await expect(
          list.locator(`[data-order="${outside.order.id}"]`),
        ).toHaveCount(0);
        await list.scrollIntoViewIfNeeded();
        await shoppingProof(
          page,
          info,
          `reconciliation-list-${browserName}-${locale}`,
        );
        await row.getByRole("link", { name: f.order.number }).click();
        const detail = page.getByTestId("reconciliation-detail");
        await expect(
          detail.getByRole("heading", { name: t.matched, exact: true }),
        ).toBeVisible();
        await expect(detail.locator('[data-metric="credit"] dd')).toHaveText(
          { fa: "۴۰٫۰۰۰۰ TRY", tr: "40,0000 TRY", en: "40.0000 TRY" }[locale],
        );
        await expect(detail.locator('[data-metric="external"] dd')).toHaveText(
          { fa: "۶۰٫۰۰۰۱ TRY", tr: "60,0001 TRY", en: "60.0001 TRY" }[locale],
        );
        await detail
          .locator('[data-metric="external"]')
          .scrollIntoViewIfNeeded();
        await shoppingProof(
          page,
          info,
          `reconciliation-amounts-${browserName}-${locale}`,
        );
        await detail.getByText(t.rates, { exact: true }).click();
        await expect(detail).toContainText("0.025000000000");
        await detail
          .getByText(t.rates, { exact: true })
          .scrollIntoViewIfNeeded();
        await shoppingProof(
          page,
          info,
          `reconciliation-fx-${browserName}-${locale}`,
        );
        for (const secret of [
          f.customer.email!,
          "private-bank-reference",
          "private-quote-terms",
        ])
          await expect(detail).not.toContainText(secret);
        await page.goto(`/admin/finance/reconciliation/${bad.order.id}`);
        await expect(detail.locator('[data-issue="PAYMENT_TOTAL"]')).toHaveText(
          t.issues.PAYMENT_TOTAL,
        );
        await expect(
          detail.locator('[data-metric="difference"] dd'),
        ).toHaveText(
          { fa: "-۰٫۰۰۰۱ TRY", tr: "-0,0001 TRY", en: "-0.0001 TRY" }[locale],
        );
        await detail.scrollIntoViewIfNeeded();
        await shoppingProof(
          page,
          info,
          `reconciliation-mismatch-${browserName}-${locale}`,
        );
        await page.goto(
          `/admin/finance/reconciliation/${outside.order.id}?userId=forged-owner`,
        );
        await expect(page.getByTestId("reconciliation-detail")).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText(
          outside.order.number,
        );
        await page.goto(
          `/admin/finance/reconciliation?from=${day}&to=2000-01-01`,
        );
        await expect(page.getByRole("alert")).toHaveText(t.invalidFilter);
        expect(await evidence()).toEqual(before);
        expect(
          await db.journalEntry.count({ where: { createdById: user.id } }),
        ).toBe(0);
        expect(
          await db.auditLog.count({
            where: {
              userId: user.id,
              entityId: { in: [f.order.id, bad.order.id] },
            },
          }),
        ).toBe(0);
      } finally {
        await db.user.update({
          where: { id: user.id },
          data: { isActive: false },
        });
      }
    });
  }
}
