import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { customerLogin } from "./helpers/crm-customer";
import { fillAdminMfa } from "./helpers/admin-mfa";
import { ensureMaintenanceOff } from "./helpers/maintenance";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
const db = new PrismaClient();
for (const [locale, code] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`${locale}: CRM360, preferences, unsubscribe, segments and privacy review at 390px`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(300000);
    if (
      !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
        "_test",
      )
    )
      throw new Error("Dedicated _test database required");
    await ensureMaintenanceOff(page.request);
    await page.setViewportSize({ width: 390, height: 844 });
    const t = { fa, tr, en }[locale].crm,
      email = `crm-browser-${randomUUID()}@example.com`;
    await customerLogin(page, email);
    const market = await db.market.findUniqueOrThrow({ where: { code } });
    await context.addCookies([
      { name: "market", value: code, url: "http://127.0.0.1:3000" },
    ]);
    await page.goto(`/${locale}/account/preferences`);
    await expect(
      page.getByRole("heading", { name: t.preferences }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    const channelForm = page
      .locator("form:visible")
      .filter({ has: page.locator('input[name="channel"][value="email"]') });
    await channelForm.locator('select[name="status"]').selectOption("OPTED_IN");
    await channelForm.getByRole("button", { name: t.save }).click();
    await expect(page.getByRole("link", { name: t.unsubscribe })).toBeVisible();
    await page.getByRole("link", { name: t.unsubscribe }).click();
    await page.getByRole("button", { name: t.confirmUnsubscribe }).click();
    await expect(page.getByRole("status")).toContainText(
      { fa, tr, en }[locale].engagement.saved,
    );
    const customer = await db.customer.findUniqueOrThrow({ where: { email } });
    expect(
      (
        await db.marketingConsent.findUniqueOrThrow({
          where: {
            customerId_marketId_channel: {
              customerId: customer.id,
              marketId: market.id,
              channel: "email",
            },
          },
        })
      ).status,
    ).toBe("OPTED_OUT");
    await page.goto(`/${locale}/account/preferences`);
    await page.locator('select[name="kind"]:visible').selectOption("EXPORT");
    await page.getByRole("button", { name: t.request, exact: true }).click();
    await expect(
      page.getByRole("button", { name: t.cancel, exact: true }),
    ).toBeVisible();
    const req = await db.privacyRequest.findFirstOrThrow({
      where: { customerId: customer.id, marketId: market.id, kind: "EXPORT" },
    });
    await page.locator('select[name="kind"]:visible').selectOption("DELETE");
    await page.getByRole("button", { name: t.request, exact: true }).click();
    await expect(
      page.getByRole("button", { name: t.cancel, exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: t.cancel, exact: true })
      .first()
      .click();
    // Cancel only the newest deletion request; the export remains for admin review.
    await expect
      .poll(
        async () =>
          (
            await db.privacyRequest.findFirstOrThrow({
              where: { customerId: customer.id, kind: "DELETE" },
            })
          ).status,
      )
      .toBe("CANCELLED");
    await page.screenshot({
      path: info.outputPath(`crm-preferences-${locale}.png`),
      fullPage: true,
    });
    await context.addCookies([
      { name: "hoda.admin.locale", value: "fa", url: "http://127.0.0.1:3000" },
    ]);
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
    await context.addCookies([
      {
        name: "hoda.admin.locale",
        value: locale,
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.goto(`/admin/crm/${customer.id}?marketId=${market.id}`);
    await expect(page.getByRole("heading", { name: t.profile })).toBeVisible();
    const tag = `browser-${locale}-${randomUUID().slice(0, 8)}`;
    await page.locator('[name="tags"]:visible').fill(tag);
    await page
      .locator("form:visible")
      .filter({ has: page.locator('[name="tags"]:visible') })
      .getByRole("button", { name: t.save })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.crmProfile.findUnique({
              where: {
                customerId_marketId: {
                  customerId: customer.id,
                  marketId: market.id,
                },
              },
            })
          )?.tags,
      )
      .toContain(tag);
    await page
      .locator('[name="body"]:visible')
      .fill("Private browser fixture note");
    await page.getByRole("button", { name: t.addNote }).click();
    await expect(page.getByText(/^Private browser fixture note/)).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`crm-customer-${locale}.png`),
      fullPage: true,
    });
    await page.goto(`/admin/crm?tab=segments&marketId=${market.id}`);
    const builder = page
      .locator("form:visible")
      .filter({ has: page.locator('[name="definition"]') })
      .first();
    await builder.locator('[name="name"]').fill(tag);
    await builder.getByRole("button", { name: t.addCondition }).click();
    await builder.getByLabel(t.condition, { exact: true }).selectOption("tag");
    await builder.getByLabel(t.conditionValue, { exact: true }).fill(tag);
    await builder.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(builder.getByRole("status")).toContainText("1");
    await builder.getByRole("button", { name: t.save, exact: true }).click();
    await expect
      .poll(() =>
        db.crmSegment.count({ where: { name: tag, marketId: market.id } }),
      )
      .toBe(1);
    await page.screenshot({
      path: info.outputPath(`crm-segment-${locale}.png`),
      fullPage: true,
    });
    await page.goto(`/admin/crm?tab=metrics&marketId=${market.id}`);
    for (const [name, value] of Object.entries({
      name: "Browser example",
      recencyDays: "30,60,90,180",
      frequency: "1,3,5,10",
      monetaryUsd: "50,100,250,500",
      churnDays: "180",
    }))
      await page.locator(`[name="${name}"]:visible`).fill(value);
    await page.getByRole("button", { name: t.save, exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      { fa, tr, en }[locale].engagement.saved,
    );
    await page.goto(`/admin/crm?tab=privacy&marketId=${market.id}`);
    const review = page.locator("article:visible").filter({ hasText: req.id });
    await review.locator('[name="status"]').selectOption("IN_REVIEW");
    await review.getByRole("button", { name: t.save }).click();
    await expect(
      review.locator('[name="status"] option[value="APPROVED"]'),
    ).toHaveCount(1);
    await review.locator('[name="status"]').selectOption("APPROVED");
    await review.getByRole("button", { name: t.save }).click();
    await expect
      .poll(
        async () =>
          (await db.privacyRequest.findUniqueOrThrow({ where: { id: req.id } }))
            .status,
      )
      .toBe("APPROVED");
    const result = await page.request.get(`/api/crm/export/${req.id}`);
    expect(result.status()).toBe(200);
    expect(result.headers()["cache-control"]).toContain("no-store");
    expect(await result.text()).not.toContain("Private browser fixture note");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  });
}
