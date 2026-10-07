import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
for (const [locale, marketCode] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`${locale} admin rules, coupons and non-consuming simulator at 390px`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180000);
    const t = { fa, tr, en }[locale].promotionAdmin,
      suffix = randomUUID().slice(0, 8),
      name = `Browser ${locale} ${suffix}`;
    const market = await db.market.findUniqueOrThrow({
      where: { code: marketCode },
    });
    const variant = await db.variant.findFirstOrThrow({
      where: { isActive: true, product: { status: "ACTIVE", deletedAt: null } },
    });
    const cart = await db.cart.create({
      data: {
        tokenHash: randomUUID(),
        marketId: market.id,
        currency: market.currency,
        locale,
        expiresAt: new Date(Date.now() + 86400000),
        items: { create: { variantId: variant.id, quantity: 1 } },
      },
    });
    await page.setViewportSize({ width: 390, height: 844 });
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
    await page.goto(`/admin/promotions?marketId=${market.id}&new=1`);
    await expect(
      page.getByRole("heading", { name: t.title, exact: true }),
    ).toBeVisible();
    const editor = page
      .locator("form")
      .filter({ has: page.locator('[name="name"]') });
    await editor.locator('[name="name"]').fill(name);
    for (const l of ["fa", "tr", "en"])
      await editor.locator(`[name="titleI18n.${l}"]`).fill(`Benefit ${l}`);
    await expect(editor.locator('[name="status"]')).toHaveValue("DRAFT");
    await expect(editor.locator('[name="enabled"]')).not.toBeChecked();
    await editor
      .getByRole("button", { name: t.addCondition, exact: true })
      .click();
    await editor
      .getByTestId("promotion-condition")
      .getByLabel(t.value, { exact: true })
      .fill("0");
    await editor.locator('[name="couponRequired"]').check();
    await editor.locator('[name="totalUsageCap"]').fill("5");
    await editor.locator('[name="confirmed"]').check();
    await editor.getByRole("button", { name: t.save, exact: true }).click();
    await expect(page).toHaveURL(/&id=/);
    const id = new URL(page.url()).searchParams.get("id")!;
    await expect
      .poll(
        async () =>
          (await db.promotionProgram.findUniqueOrThrow({ where: { id } }))
            .version,
      )
      .toBe(1);
    await page
      .locator("form")
      .filter({ has: page.locator('[name="name"]') })
      .locator('[name="priority"]')
      .fill("7");
    await editor.locator('[name="confirmed"]').check();
    await editor.getByRole("button", { name: t.save, exact: true }).click();
    await expect
      .poll(
        async () =>
          (await db.promotionProgram.findUniqueOrThrow({ where: { id } }))
            .version,
      )
      .toBe(2);
    const issuer = page
      .locator("form")
      .filter({ has: page.locator('[name="code"]') });
    const code = `ADMIN-${suffix}`.toUpperCase();
    await issuer.locator('[name="code"]').fill(code);
    await issuer.locator('[name="totalUsageCap"]').fill("1");
    await issuer.locator('[name="confirmed"]').check();
    await issuer.getByRole("button", { name: t.issue, exact: true }).click();
    await expect
      .poll(() => db.promotionCoupon.count({ where: { programId: id } }))
      .toBe(1);
    await expect(issuer.locator('[name="confirmed"]')).not.toBeChecked();
    const issuanceForm = page
      .locator("form")
      .filter({ has: page.locator('[name="issueMode"]') });
    await issuanceForm.locator('[name="issueMode"]').selectOption("bulk");
    await issuanceForm.locator('[name="count"]').fill("2");
    await issuanceForm.locator('[name="confirmed"]').check();
    // Commit the server action, drop its response, then retry identical batch issuance.
    let dropped = false;
    await page.route("**/admin/promotions?**", async (route) => {
      if (
        !dropped &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        dropped = true;
        await route.fetch();
        await route.abort("connectionreset");
      } else await route.continue();
    });
    await issuanceForm
      .getByRole("button", { name: t.issue, exact: true })
      .click();
    await expect(issuanceForm.getByRole("alert")).toHaveText(t.unknown);
    await expect(issuanceForm.locator('[name="count"]')).toBeDisabled();
    await issuanceForm
      .getByRole("button", { name: t.retry, exact: true })
      .click();
    await expect
      .poll(() => db.promotionCoupon.count({ where: { programId: id } }))
      .toBe(3);
    await expect(
      issuanceForm.getByText(t.saved, { exact: true }),
    ).toBeVisible();
    await page.unroute("**/admin/promotions?**");
    const sim = page
      .locator("form")
      .filter({ has: page.locator('[name="cartId"]') });
    await sim.locator('[name="cartId"]').selectOption(cart.id);
    await sim.locator('[name="couponCodes"]').fill(code);
    await sim.getByRole("button", { name: t.simulate, exact: true }).click();
    await expect(page.getByTestId("simulation-result")).toContainText(
      t.reasons.APPLIED,
    );
    await expect(page.getByTestId("simulation-result")).toContainText(
      t.matched,
    );
    expect(
      await db.promotionRedemption.count({ where: { programId: id } }),
    ).toBe(0);
    const config = (
      await db.promotionProgramRevision.findFirstOrThrow({
        where: { programId: id },
        orderBy: { version: "desc" },
      })
    ).config as { enabled: boolean; status: string };
    expect(config).toMatchObject({ enabled: false, status: "DRAFT" });
    await page.screenshot({
      path: info.outputPath(`promotion-admin-${locale}.png`),
      fullPage: true,
    });
    await sim.locator('[name="preview"]').uncheck();
    await expect(page.getByTestId("simulation-result")).toHaveCount(0);
    await sim.getByRole("button", { name: t.simulate, exact: true }).click();
    await expect(page.getByTestId("simulation-result")).toContainText(
      t.reasons.DISABLED,
    );
    const coupon = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: code }) });
    const { id: couponId } = await db.promotionCoupon.findFirstOrThrow({
      where: { programId: id, code },
    });
    async function expectCoupon(status: string, version: number) {
      await expect
        .poll(async () => {
          const row = await db.promotionCoupon.findUniqueOrThrow({
            where: { id: couponId },
          });
          return {
            status: row.status,
            version: row.version,
            mutations: await db.auditLog.count({
              where: {
                entityType: "PromotionCoupon",
                entityId: couponId,
                action: "promotion.coupon.status",
              },
            }),
          };
        })
        .toEqual({ status, version, mutations: version - 1 });
    }
    async function expectReloadRequired() {
      await expect(coupon.getByRole("alert")).toHaveText(t.statusNeedsReload);
      await expect(coupon.locator('[name="status"]')).toBeDisabled();
      await expect(coupon.locator('[name="confirmed"]')).toBeDisabled();
      await expect(
        coupon.getByRole("button", { name: t.save, exact: true }),
      ).toBeDisabled();
      await expect(
        coupon.getByRole("button", { name: t.retry, exact: true }),
      ).toHaveCount(0);
      await expect(coupon.getByText(t.saved, { exact: true })).toHaveCount(0);
    }
    async function reloadCoupon() {
      await Promise.all([
        page.waitForEvent("load"),
        coupon
          .getByRole("button", { name: t.reloadStatus, exact: true })
          .click(),
      ]);
      await coupon.locator("summary").click();
      await expect(coupon.getByRole("alert")).toHaveCount(0);
    }
    await coupon.locator("summary").click();
    // An uncertain response must not imply success, whether or not it committed.
    for (const commit of [false, true]) {
      let requests = 0;
      await page.route("**/admin/promotions?**", async (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().headers()["next-action"]
        ) {
          requests++;
          if (commit) await route.fetch();
          await route.abort("connectionreset");
        } else await route.continue();
      });
      await coupon.locator('[name="status"]').selectOption("PAUSED");
      await coupon.locator('[name="confirmed"]').check();
      await coupon.getByRole("button", { name: t.save, exact: true }).click();
      await expectReloadRequired();
      await expectCoupon(commit ? "PAUSED" : "ACTIVE", commit ? 2 : 1);
      await reloadCoupon();
      await expect(coupon.locator('[name="status"]')).toHaveValue(
        commit ? "PAUSED" : "ACTIVE",
      );
      await expect(coupon.locator('[name="status"]')).toBeEnabled();
      await expect(coupon.locator('[name="confirmed"]')).not.toBeChecked();
      expect(requests).toBe(1);
      await page.unroute("**/admin/promotions?**");
    }
    // Another tab commits the same target status; a stale form still needs reload.
    const otherPage = await context.newPage();
    await otherPage.goto(page.url());
    const otherCoupon = otherPage.locator("details").filter({
      has: otherPage.locator("summary", { hasText: code }),
    });
    await otherCoupon.locator("summary").click();
    await otherCoupon.locator('[name="status"]').selectOption("ACTIVE");
    await otherCoupon.locator('[name="confirmed"]').check();
    await otherCoupon
      .getByRole("button", { name: t.save, exact: true })
      .click();
    await expectCoupon("ACTIVE", 3);
    await otherPage.close();
    await coupon.locator('[name="status"]').selectOption("ACTIVE");
    await coupon.locator('[name="confirmed"]').check();
    await coupon.getByRole("button", { name: t.save, exact: true }).click();
    await expectReloadRequired();
    await expectCoupon("ACTIVE", 3);
    await reloadCoupon();
    await expect(coupon.locator('[name="status"]')).toHaveValue("ACTIVE");

    // Irreversible archive has the same recovery, with no second mutation/audit.
    let archiveRequests = 0;
    await page.route("**/admin/promotions?**", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        archiveRequests++;
        await route.fetch();
        await route.abort("connectionreset");
      } else await route.continue();
    });
    await coupon.locator('[name="status"]').selectOption("ARCHIVED");
    await coupon.locator('[name="confirmed"]').check();
    await coupon.getByRole("button", { name: t.save, exact: true }).click();
    await expectReloadRequired();
    await expectCoupon("ARCHIVED", 4);
    await reloadCoupon();
    await expect(coupon.locator("form")).toHaveCount(0);
    await expect(
      coupon.getByText(t.archiveWarning, { exact: true }),
    ).toBeVisible();
    await expectCoupon("ARCHIVED", 4);
    expect(archiveRequests).toBe(1);
    await page.unroute("**/admin/promotions?**");
    expect(await page.locator(".admin").getAttribute("dir")).toBe(
      locale === "fa" ? "rtl" : "ltr",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  });
}
test.afterAll(() => db.$disconnect());
