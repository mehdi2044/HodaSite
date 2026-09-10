import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
const db = new PrismaClient();
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
async function submit(page: Page, field: string) {
  await page
    .locator("form")
    .filter({ has: page.locator(`[name="${field}"]`) })
    .locator('button:not([type="button"])')
    .last()
    .click();
}
async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page
    .getByLabel("ایمیل")
    .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
  await page
    .getByLabel("رمز عبور")
    .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function receipt(page: Page) {
  await page.locator('[name="receipt"]').setInputFiles({
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
    ),
  });
  await submit(page, "receipt");
}
for (const [locale, slug, province, city, postal] of [
  ["fa", "محصول-1", "تهران", "تهران", "1234567890"],
  ["tr", "urun-1", "İstanbul", "Kadıköy", "34710"],
  ["en", "product-1", "ON", "Toronto", "M5V 2T6"],
] as const) {
  const t = { en, fa, tr }[locale].commerce;
  test(`${locale} passwordless purchase, private receipt and payment approval`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const email = `e2e-${randomUUID()}@example.com`;
    await page.context().clearCookies();
    await page.goto(`/${locale}/p/${encodeURIComponent(slug)}`);
    await submit(page, "variantId");
    await expect(
      page.getByRole("status").filter({ hasText: t.saved }),
    ).toBeVisible();
    await page.goto(`/${locale}/account/login?next=/${locale}/checkout`);
    await page.locator('main [name="email"]').fill(email);
    await submit(page, "email");
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
          const response = await page.request.get(
            `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          );
          const result = (await response.json()) as {
            messages: Array<{ ID: string }>;
          };
          if (!result.messages?.length) return false;
          const mail = (await (
            await page.request.get(
              `${mailpit}/api/v1/message/${result.messages[0].ID}`,
            )
          ).json()) as { Text: string };
          code = mail.Text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
          return code.length === 6;
        },
        { timeout: 45000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await page.locator('[name="code"]').fill(code);
    await submit(page, "code");
    await expect(page).toHaveURL(`http://127.0.0.1:3000/${locale}/checkout`);
    for (const [key, value] of Object.entries({
      firstName: "Test",
      lastName: "Buyer",
      phone: "+1 555 000 0000",
      province,
      city,
      line1: "10 Example Street",
      postalCode: postal,
    }))
      await page.locator(`[name="${key}"]`).fill(value);
    await submit(page, "firstName");
    await expect(page).toHaveURL(/step=2/);
    await page.getByRole("button", { name: t.next, exact: true }).click();
    await expect(page).toHaveURL(/step=3/);
    await page.locator('[name="terms"]').check();
    await submit(page, "terms");
    await expect(page).toHaveURL(/\/orders\/[A-Z]{2}-\d+\/pay$/);
    const number = new URL(page.url()).pathname.split("/")[3];
    const before = await db.order.findUniqueOrThrow({
      where: { number },
      include: { items: true },
    });
    await receipt(page);
    await expect(page.getByTestId("order-status")).toHaveText(
      t.statuses.AWAITING_VERIFICATION,
    );
    const proof = await db.receipt.findFirstOrThrow({
      where: { payment: { orderId: before.id } },
      include: { media: true },
    });
    const raw = await page.request.get(`/media/${proof.media.storageKey}`);
    expect(raw.status()).toBe(404);
    const noSignature = await page.request.get(`/api/receipts/${proof.id}`);
    expect(noSignature.status()).toBe(404);
    const href = await page
      .getByRole("link", { name: t.viewReceipt })
      .first()
      .getAttribute("href");
    expect((await page.request.get(href!)).status()).toBe(200);
    const expired = new URL(href!, page.url());
    expired.searchParams.set("expires", "1000000000");
    expect((await page.request.get(expired.toString())).status()).toBe(404);
    const admin = await context.newPage();
    await adminLogin(admin);
    await admin.goto(`/admin/orders/${number}`);
    if (locale === "fa") {
      await admin.locator('[name="operation"]').selectOption("reject");
      await admin
        .locator('[name="reason"]')
        .fill("Please upload the correct transfer reference");
      await submit(admin, "operation");
      await expect(admin.getByTestId("admin-order-status")).toHaveText(
        fa.commerce.statuses.PENDING_PAYMENT,
      );
      await page.reload();
      await receipt(page);
      await expect(page.getByTestId("order-status")).toHaveText(
        t.statuses.AWAITING_VERIFICATION,
      );
      await admin.reload();
    }
    await admin.locator('[name="operation"]').selectOption("approve");
    await submit(admin, "operation");
    await expect(admin.getByTestId("admin-order-status")).toHaveText(
      fa.commerce.statuses.PAID,
    );
    await page.reload();
    await expect(page.getByTestId("order-status")).toHaveText(t.statuses.PAID);
    expect(
      await db.stockMovement.count({
        where: { referenceId: before.id, type: "OUT" },
      }),
    ).toBe(1);
    expect(
      (
        await db.order.findUniqueOrThrow({ where: { id: before.id } })
      ).totalAmount.toString(),
    ).toBe(before.totalAmount.toString());
    expect(
      (await context.cookies()).some((c) =>
        c.name.startsWith("hoda.customer.session"),
      ),
    ).toBe(true);
    await admin.close();
  });
}
test.afterAll(async () => db.$disconnect());
