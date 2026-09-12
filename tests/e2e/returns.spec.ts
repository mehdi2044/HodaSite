import { shoppingProof } from "./helpers/shopping-proof";
import { PrismaClient } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { returnFixture } from "../helpers/returns";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";
const db = new PrismaClient();
const submit = async (form: Locator) =>
  form.locator('button:not([type="button"])').last().click();
async function customerLogin(
  page: Page,
  email: string,
  locale: string,
  next: string,
) {
  await page.goto(`/${locale}/account/login?next=${encodeURIComponent(next)}`);
  await page.locator('main [name="email"]').fill(email);
  await submit(page.locator('form:has(input[name="email"])'));
  await expect(page.locator('[name="code"]')).toBeVisible();
  let code = "";
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const base = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
        const result = await (
          await page.request.get(
            `${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        if (!result.messages?.length) return false;
        const mail = await (
          await page.request.get(
            `${base}/api/v1/message/${result.messages[0].ID}`,
          )
        ).json();
        code = mail.Text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
        return code.length === 6;
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  await page.locator('[name="code"]').fill(code);
  await submit(page.locator('form:has(input[name="code"])'));
  await expect(page).toHaveURL(new RegExp(next + "$"));
}
async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page
    .locator('[name="email"]')
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .locator('[name="password"]')
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
for (const locale of ["fa", "tr", "en"] as const) {
  test(`${locale} mobile customer return, warehouse receipt and settlement`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    const f = await returnFixture(db, { locale }),
      exchange = locale === "tr",
      t = { fa, tr, en }[locale].returns;
    const url = `/${locale}/orders/${f.order.number}/pay`;
    await customerLogin(page, f.customer.email, locale, url);
    const panel = page.getByTestId("customer-returns"),
      form = panel.locator("form").first();
    if (exchange) {
      await form.locator('[name="type"]').selectOption("EXCHANGE");
      await form
        .locator('[name="exchangeVariantId"]')
        .selectOption(f.variants[1].id);
    }
    await form.locator('[name="note"]').fill("Size does not fit");
    await panel.scrollIntoViewIfNeeded();
    await shoppingProof(page, info, `${locale}-return-request`);
    await submit(form);
    await expect(
      panel.getByText(t.statuses.REQUESTED, { exact: false }),
    ).toBeVisible();
    const request = await db.returnRequest.findFirstOrThrow({
      where: { orderId: f.order.id },
    });
    const admin = await context.newPage();
    await adminLogin(admin);
    await admin.goto("/admin/returns");
    const row = admin
      .getByTestId("admin-return")
      .filter({ hasText: f.order.number });
    const operation = (name: string) =>
      row.locator(`form:has(input[name="operation"][value="${name}"])`);
    await submit(operation("APPROVE"));
    await expect(
      row.getByText(fa.returns.statuses.APPROVED, { exact: false }),
    ).toBeVisible();
    const receive = operation("RECEIVE");
    await receive.locator('select[name^="condition:"]').selectOption("RESTOCK");
    await submit(receive);
    await expect(
      row.getByText(fa.returns.statuses.RECEIVED, { exact: false }),
    ).toBeVisible();
    const op = exchange ? "EXCHANGE" : locale === "en" ? "REFUND" : "CREDIT";
    if (op === "REFUND")
      await operation(op)
        .locator('[name="note"]')
        .fill("Manual demo transfer completed");
    await submit(operation(op));
    await expect(
      row.getByText(fa.returns.statuses.RESOLVED, { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(
      panel.getByText(t.statuses.RESOLVED, { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (exchange) {
      await panel
        .getByRole("link", { name: new RegExp(t.exchangeOrder) })
        .click();
      await expect(page.getByTestId("order-status")).toHaveText(
        tr.commerce.statuses.PAID,
      );
    } else if (op === "CREDIT") {
      await page.goto(`/${locale}/account`);
      await expect(
        page.getByRole("heading", { name: t.creditBalance }),
      ).toBeVisible();
    }
    expect(
      (await db.stockItem.findUniqueOrThrow({ where: { id: f.stocks[0].id } }))
        .onHand,
    ).toBe(9);
    expect(
      (await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe("RESOLVED");
    await admin.close();
  });
}
test.afterAll(() => db.$disconnect());
