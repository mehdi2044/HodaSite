import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { shippingFixture } from "../helpers/shipping";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
for (const locale of ["fa", "tr", "en"] as const) {
  test(`private invoice generation, download and regeneration: ${locale}`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180000);
    const code = { fa: "IR", tr: "TR", en: "CA" }[locale];
    const { order, guestToken } = await shippingFixture(db, code, 2, locale);
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
    await page.goto(`/admin/orders/${order.number}`);
    const panel = page.getByTestId("invoice-panel");
    await panel.getByRole("button", { name: fa.invoice.generate }).click();
    await expect
      .poll(async () => db.invoice.count({ where: { orderId: order.id } }))
      .toBe(1);
    const invoice = await db.invoice.findFirstOrThrow({
      where: { orderId: order.id },
    });
    await expect
      .poll(
        async () => {
          const result = await page.request.post("/api/cron/tick", {
            headers: {
              authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
            },
          });
          expect(result.ok()).toBeTruthy();
          return (
            await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
          ).status;
        },
        { timeout: 100000, intervals: [500, 1000, 3000] },
      )
      .toBe("READY");
    await page.reload();
    const url = await panel
      .getByRole("link", { name: fa.invoice.download })
      .getAttribute("href");
    expect(url).toBeTruthy();
    const adminDownload = await page.request.get(url!);
    expect(adminDownload.status()).toBe(200);
    expect((await adminDownload.body()).subarray(0, 5).toString()).toBe(
      "%PDF-",
    );
    expect(adminDownload.headers()["cache-control"]).toBe("private, no-store");
    const ready = await db.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { media: true },
    });
    expect(
      (await page.request.get(`/media/${ready.media!.storageKey}`)).status(),
    ).toBe(404);
    const guest = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    try {
      expect((await guest.request.get(url!)).status()).toBe(404);
      await guest.addCookies([
        {
          name: `hoda.order.${order.number}`,
          value: guestToken,
          url: "http://127.0.0.1:3000",
        },
      ]);
      const tab = await guest.newPage();
      await tab.goto(`/${locale}/orders/${order.number}/pay`);
      await expect(
        tab
          .getByTestId("invoice-panel")
          .getByRole("link", { name: { fa, tr, en }[locale].invoice.download }),
      ).toBeVisible();
      expect((await guest.request.get(url!)).status()).toBe(200);
      await guest.clearCookies();
      expect((await guest.request.get(url!)).status()).toBe(404);
    } finally {
      await guest.close();
    }
    await panel.getByRole("button", { name: fa.invoice.generate }).click();
    await expect
      .poll(async () => db.invoice.count({ where: { orderId: order.id } }))
      .toBe(2);
    expect(
      (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .mediaId,
    ).toBe(ready.mediaId);
    expect((await page.request.get(url!)).status()).toBe(200);
  });
}
test("market invoice tax labels can be edited from settings", async ({
  page,
}) => {
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
  await page.goto("/admin/settings/invoices");
  const form = page.locator("form").first();
  await form.locator('[name="taxLabelFa"]').fill("شناسه مالیاتی آزمایشی");
  await form.locator('[name="taxId"]').fill("TEST-123");
  await form.getByRole("button", { name: fa.invoice.save }).click();
  await expect(form.getByRole("status")).toContainText(fa.commerce.saved);
  await page.reload();
  expect(await page.locator('[name="taxId"]').first().inputValue()).toBe(
    "TEST-123",
  );
});
