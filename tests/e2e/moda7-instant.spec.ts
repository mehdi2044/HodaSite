import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { fillAdminMfa } from "./helpers/admin-mfa";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";
const db = new PrismaClient();
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
async function login(page: Page, email: string) {
  await page.locator('main input[name="email"]').fill(email);
  await page
    .locator("main form")
    .getByRole("button", { name: en.commerce.sendCode, exact: true })
    .click();
  let code = "";
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron"}`,
          },
        });
        const inbox = await (
          await page.request.get(
            `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        if (!inbox.messages?.length) return false;
        const mail = await (
          await page.request.get(
            `${mailpit}/api/v1/message/${inbox.messages[0].ID}`,
          )
        ).json();
        code = mail.Text?.match(/\b\d{6}\b/)?.[0] ?? "";
        return !!code;
      },
      { timeout: 45000, intervals: [500, 1000] },
    )
    .toBe(true);
  await page.getByTestId("otp-code").fill(code);
  await page
    .locator("main form")
    .filter({ has: page.getByTestId("otp-code") })
    .getByRole("button", { name: en.commerce.login, exact: true })
    .click();
}
async function choose(page: Page, locale: "fa" | "tr" | "en", key: string) {
  const dict = { fa, tr, en }[locale].instantFitting,
    room = page.getByTestId("instant-fitting");
  const profile = await db.catalogCutout.findFirstOrThrow({
    where: {
      productId: `seed-moda4-style-${key}`,
      variantId: null,
      deletedAt: null,
    },
  });
  const v = await db.variant.findFirstOrThrow({
    where: {
      productId: profile.productId,
      colorId: profile.colorId,
      isActive: true,
      stockItems: { some: { onHand: { gt: 0 } } },
    },
    include: { product: true },
    orderBy: { id: "asc" },
  });
  const title = (v.product.titleI18n as Record<string, string>)[locale];
  await room.getByLabel(dict.search, { exact: true }).fill(title);
  await room.getByRole("button", { name: dict.search, exact: true }).click();
  const card = room.locator(`[data-product-id="${profile.productId}"]`);
  await expect(card).toBeVisible();
  await card.getByLabel(dict.variant, { exact: true }).selectOption(v.id);
  await card.getByRole("button", { name: dict.try, exact: true }).click();
  await expect(
    room.locator(`[data-fitting-piece-target="${v.id}"]`),
  ).toBeAttached();
  return v;
}
test("R7a guest four real models, RTL/TR/EN, keyboard/reduced motion and no paid session", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  const entries = await db.fittingCoinEntry.count(),
    sessions = await db.fittingSession.count();
  for (const locale of ["fa", "tr", "en"] as const) {
    const t = { fa, tr, en }[locale].instantFitting;
    await page.goto(`/${locale}/fitting-room`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/fitting-room$`));
    const room = page.getByTestId("instant-fitting");
    await expect(
      room.getByRole("heading", { name: t.title, exact: true }),
    ).toBeVisible();
    for (const [kind, key] of [
      ["WOMAN", "women-tee"],
      ["MAN", "men-shirt"],
      ["GIRL", "kids-dress"],
      ["BOY", "kids-knit"],
    ]) {
      await room.locator(`[data-model-kind="${kind}"]`).click();
      await choose(page, locale, key);
      const stage = room.locator(".moda-instant-stage");
      await stage.focus();
      await page.keyboard.press("ArrowRight");
      await expect(room.locator(".moda-instant-turn")).toHaveAttribute(
        "style",
        /rotateY\(5deg\)/,
      );
      await page.keyboard.press("Home");
      await stage.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          stage
            .locator("img")
            .evaluateAll((imgs) =>
              imgs.every(
                (im) =>
                  (im as HTMLImageElement).complete &&
                  (im as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`r7a-${locale}-${kind.toLowerCase()}-390.png`),
        scale: "css",
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .include('[data-testid="instant-fitting"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await room.locator(".moda-instant-stage").focus();
    await page.keyboard.press("ArrowRight");
    await expect(room.locator(".moda-instant-turn")).toHaveCSS(
      "transform",
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  expect(await db.fittingCoinEntry.count()).toBe(entries);
  expect(await db.fittingSession.count()).toBe(sessions);
});
test("R7a guest composition survives verified login, private save/reload/profile, atomic cart, archive/restore/delete", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `instant-${randomUUID()}@example.com`,
    t = en.instantFitting,
    name = `Private instant ${randomUUID().slice(0, 8)}`;
  let customerId = "";
  try {
    await page.goto("/en/fitting-room");
    let room = page.getByTestId("instant-fitting");
    await room.locator('[data-model-kind="WOMAN"]').click();
    const top = await choose(page, "en", "women-tee"),
      bottom = await choose(page, "en", "women-trousers");
    await expect(room.locator("[data-scene-layer]")).toHaveCount(2);
    await room.getByRole("link", { name: t.loginSave, exact: true }).click();
    await login(page, email);
    await expect(page).toHaveURL(/\/en\/fitting-room$/);
    room = page.getByTestId("instant-fitting");
    await expect(room.locator("[data-scene-layer]")).toHaveCount(2);
    customerId = (await db.customer.findUniqueOrThrow({ where: { email } })).id;
    const coins = await db.fittingCoinEntry.count({ where: { customerId } });
    expect(coins).toBe(0);
    await room.getByLabel(t.name, { exact: true }).fill(name);
    await room.getByRole("button", { name: t.save, exact: true }).click();
    await expect(room.locator("[role=status]")).toHaveText(t.saved);
    let saved = await db.customerInstantLook.findFirstOrThrow({
      where: { customerId, name },
    });
    expect(
      (saved.snapshot as { variantIds: string[] }).variantIds.sort(),
    ).toEqual([top.id, bottom.id].sort());
    await page.reload();
    room = page.getByTestId("instant-fitting");
    const wardrobe = room.locator(".moda-instant-wardrobe");
    await wardrobe.getByRole("button", { name, exact: true }).click();
    await expect(room.locator("[data-scene-layer]")).toHaveCount(2);
    await room.getByRole("button", { name: t.addAll, exact: true }).click();
    await expect(room.locator("[role=status]")).toHaveText(t.added);
    const cart = await db.cart.findFirstOrThrow({
      where: { customerId, completedAt: null },
      include: { items: true },
    });
    expect(cart.items.map((v) => v.variantId).sort()).toEqual(
      [top.id, bottom.id].sort(),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("r7a-private-en-1440.png"),
      scale: "css",
    });
    await page.goto("/en/account");
    await expect(
      page
        .locator(".moda-wardrobe-grid")
        .getByRole("link", { name, exact: true }),
    ).toBeVisible();
    await page.goto("/en/fitting-room");
    room = page.getByTestId("instant-fitting");
    const list = room.locator(".moda-instant-wardrobe");
    await list.getByLabel(t.confirm, { exact: true }).check();
    await list.getByRole("button", { name: t.archive, exact: true }).click();
    await expect
      .poll(() =>
        db.customerInstantLook
          .findUnique({ where: { id: saved.id } })
          .then((v) => !!v?.archivedAt),
      )
      .toBe(true);
    await list.locator("summary").click();
    await list.getByLabel(t.confirm, { exact: true }).check();
    await list.getByRole("button", { name: t.restore, exact: true }).click();
    await expect
      .poll(() =>
        db.customerInstantLook
          .findUnique({ where: { id: saved.id } })
          .then((v) => v?.archivedAt === null),
      )
      .toBe(true);
    await list.getByLabel(t.confirm, { exact: true }).check();
    await list.getByRole("button", { name: t.delete, exact: true }).click();
    await expect
      .poll(() =>
        db.customerInstantLook.findUnique({ where: { id: saved.id } }),
      )
      .toBeNull();
    expect(await db.fittingCoinEntry.count({ where: { customerId } })).toBe(
      coins,
    );
    expect(await db.fittingSession.count({ where: { customerId } })).toBe(0);
  } finally {
    if (customerId) {
      await db.customerInstantLook.deleteMany({ where: { customerId } });
      await db.customer.update({
        where: { id: customerId },
        data: { isActive: false },
      });
    }
  }
});
test("R7a real MFA admin can switch free mode without enabling paid AI", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const before = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  try {
    await page.goto("/admin/login");
    await page
      .locator("[name=email]")
      .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
    await page
      .locator("[name=password]")
      .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
    await fillAdminMfa(page);
    await page.getByRole("button", { name: "ورود امن" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.context().addCookies([
      {
        name: "hoda.admin.locale",
        value: "en",
        url: info.project.use.baseURL!,
      },
    ]);
    await page.goto("/admin/settings/fitting");
    const flag = page.getByLabel(en.fitting.instantEnabled, { exact: true });
    await expect(flag).toBeChecked();
    await flag.uncheck();
    await page.getByLabel(en.fitting.confirmAdmin, { exact: true }).check();
    await page
      .getByRole("button", { name: en.fitting.saveSettings, exact: true })
      .click();
    await expect
      .poll(() =>
        db.integration
          .findUniqueOrThrow({ where: { key: "fitting-room" } })
          .then(
            (v) => (v.config as { instantEnabled: boolean }).instantEnabled,
          ),
      )
      .toBe(false);
    await page.reload();
    await flag.check();
    await page.getByLabel(en.fitting.confirmAdmin, { exact: true }).check();
    await page
      .getByRole("button", { name: en.fitting.saveSettings, exact: true })
      .click();
    await expect
      .poll(() =>
        db.integration
          .findUniqueOrThrow({ where: { key: "fitting-room" } })
          .then(
            (v) => (v.config as { instantEnabled: boolean }).instantEnabled,
          ),
      )
      .toBe(true);
    const row = await db.integration.findUniqueOrThrow({
      where: { key: "fitting-room" },
    });
    expect(row.isActive).toBe(false);
    expect((row.config as { enabled: boolean }).enabled).toBe(false);
  } finally {
    await db.integration.update({
      where: { id: before.id },
      data: {
        config: before.config as Prisma.InputJsonValue,
        isActive: before.isActive,
      },
    });
  }
});
