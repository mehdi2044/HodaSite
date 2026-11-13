import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

const db = new PrismaClient();
const messages = { fa, tr, en };
const markets = { fa: "IR", tr: "TR", en: "CA" } as const;
type Locale = keyof typeof markets;
const productId = (key: string) => `seed-moda4-style-${key}`;
const room = (page: Page) => page.getByTestId("instant-fitting");
const card = (page: Page, key: string) =>
  room(page).locator(`[data-product-id="${productId(key)}"]`);
const pick = (page: Page, key: string) =>
  card(page, key).locator(".moda-instant-pick");
const layer = (page: Page, id: string) =>
  room(page).locator(`[data-fitting-piece-target="${id}"]`);
const ready = (page: Page) =>
  expect(room(page)).toHaveAttribute("aria-busy", "false");

test.use({ hasTouch: true, contextOptions: { reducedMotion: "reduce" } });
test.afterAll(() => db.$disconnect());

async function variant(page: Page, key: string) {
  const id = await card(page, key).getAttribute("data-fitting-variant");
  if (!id) throw Error("Missing real gallery variant");
  return id;
}

for (const locale of ["fa", "tr", "en"] as const) {
  test(`FR3 responsive live gallery, keyboard, touch, replacement, restore and cart ${locale}`, async ({
    page,
  }) => {
    const t = messages[locale].instantFitting;
    const coins = await db.fittingCoinEntry.count();
    const paid = await db.fittingSession.count();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/${locale}/fitting-room?market=${markets[locale]}`);
    const gallery = room(page).getByRole("region", { name: t.galleryTitle });
    await expect(gallery).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    const top = gallery.locator('[data-fitting-filter="TOP"]');
    await top.click();
    await expect(top).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, "women-trousers")).toHaveCount(0);
    const all = gallery.locator('[data-fitting-filter="all"]');
    await all.click();
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, "women-trousers")).toBeVisible();

    const knit = await variant(page, "women-knit");
    await pick(page, "women-knit").press("Tab");
    await pick(page, "women-knit").press("Space");
    await expect(pick(page, "women-knit")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card(page, "women-knit")).toHaveCSS(
      "border-top-style",
      "solid",
    );
    await expect(layer(page, knit)).toBeAttached();
    await expect(pick(page, "women-knit")).toBeFocused();
    const pants = await variant(page, "women-trousers");
    await pick(page, "women-trousers").tap();
    await expect(layer(page, pants)).toBeAttached();
    await expect(room(page).getByTestId("instant-gallery-count")).toHaveText(
      locale === "fa" ? "۲ / ۴" : "2 / 4",
    );

    const tee = await variant(page, "women-tee");
    await pick(page, "women-tee").click();
    await expect(layer(page, knit)).toHaveCount(0);
    await expect(layer(page, tee)).toBeAttached();
    await expect(layer(page, pants)).toBeAttached();
    await expect(pick(page, "women-knit")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await card(page, "women-tee").locator("summary").click();
    const select = card(page, "women-tee").getByRole("combobox", {
      name: t.variant,
    });
    const alternateColor = await db.variant.findFirstOrThrow({
      where: {
        productId: productId("women-tee"),
        colorId: "seed-color-charcoal",
      },
    });
    const colorOption = select.locator(`option[value="${alternateColor.id}"]`);
    await expect(colorOption).toHaveJSProperty("disabled", true);
    await expect(colorOption).toContainText(t.galleryIncompatible);
    const next = await select
      .locator(`option:not(:disabled):not([value="${tee}"])`)
      .first()
      .getAttribute("value");
    if (!next) throw Error("Missing second stocked tee variant");
    await select.selectOption(next);
    await pick(page, "women-tee").click();
    await expect(layer(page, tee)).toHaveCount(0);
    await expect(layer(page, next)).toBeAttached();
    await expect(card(page, "women-tee")).toHaveAttribute(
      "data-fitting-variant",
      next,
    );

    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(layer(page, pants)).toBeAttached();
      await expect(pick(page, "women-tee")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        await card(page, "women-tee")
          .locator("img")
          .evaluate((img) => getComputedStyle(img).objectFit),
      ).toBe("contain");
    }

    await ready(page);
    await page.reload();
    await expect(layer(page, next)).toBeAttached();
    await expect(card(page, "women-tee")).toHaveAttribute(
      "data-fitting-variant",
      next,
    );
    await expect(layer(page, pants)).toBeAttached();
    const before = await db.cartItem.count({ where: { variantId: next } });
    const price = await card(page, "women-tee").locator("bdi").innerText();
    expect(price.trim().length).toBeGreaterThan(0);
    await room(page)
      .getByRole("button", { name: t.addAll, exact: true })
      .click();
    await expect(room(page).getByText(t.added, { exact: true })).toBeVisible();
    expect(await db.cartItem.count({ where: { variantId: next } })).toBe(
      before + 1,
    );

    await pick(page, "women-tee").click();
    await expect(layer(page, next)).toHaveCount(0);
    await expect(layer(page, pants)).toBeAttached();
    for (const [kind, key] of [
      ["MAN", "men-shirt"],
      ["GIRL", "kids-dress"],
      ["BOY", "kids-knit"],
    ] as const) {
      await room(page).locator(`[data-model-kind="${kind}"]`).click();
      await expect(layer(page, pants)).toHaveCount(0);
      await expect(pick(page, key)).toBeEnabled();
      const id = await variant(page, key);
      await pick(page, key).tap();
      await expect(layer(page, id)).toBeAttached();
    }
    expect(await db.fittingCoinEntry.count()).toBe(coins);
    expect(await db.fittingSession.count()).toBe(paid);
  });
}

test("FR3 restores unavailable variants truthfully and allows removal of deleted selection", async ({
  page,
}) => {
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).pathname !== "/moda4_fr3_browser_test")
    throw Error(
      "Unavailable/deletion fixture must run in the independent FR3 browser database",
    );
  await page.goto("/en/fitting-room?market=CA");
  const id = await variant(page, "women-knit");
  const stock = await db.stockItem.findMany({ where: { variantId: id } });
  const original = await db.product.findUniqueOrThrow({
    where: { id: productId("women-knit") },
  });
  const t = messages.en.instantFitting;
  await pick(page, "women-knit").click();
  await ready(page);
  try {
    for (const row of stock)
      await db.stockItem.update({
        where: { id: row.id },
        data: { onHand: row.reserved },
      });
    await page.reload();
    await expect(card(page, "women-knit")).toHaveAttribute(
      "data-fitting-variant",
      id,
    );
    await expect(
      card(page, "women-knit").locator(".moda-fr3-status"),
    ).toHaveText(t.unavailable);
    await expect(
      room(page).getByRole("button", { name: t.addAll }),
    ).toBeDisabled();
    await db.product.update({
      where: { id: original.id },
      data: { deletedAt: new Date() },
    });
    await page.reload();
    await expect(card(page, "women-knit")).toHaveCount(0);
    await expect(room(page).locator(".moda-instant-pieces")).toContainText(
      t.unavailable,
    );
    await expect(layer(page, id)).toHaveCount(0);
    await room(page)
      .getByRole("button", { name: t.remove, exact: true })
      .click();
    await expect(room(page).locator(".moda-instant-pieces li")).toHaveCount(0);
  } finally {
    await db.product.update({
      where: { id: original.id },
      data: { deletedAt: original.deletedAt },
    });
    for (const row of stock)
      await db.stockItem.update({
        where: { id: row.id },
        data: { onHand: row.onHand },
      });
  }
});

test("FR3 product cursor reaches every public page without duplicates", async ({
  page,
}) => {
  await page.goto("/en/fitting-room?market=CA");
  await room(page)
    .getByRole("checkbox", { name: messages.en.instantFitting.onlyCompatible })
    .uncheck();
  const cards = room(page).locator("[data-product-id]");
  const firstPage = await cards.count();
  const more = room(page).getByRole("button", {
    name: messages.en.instantFitting.moreProducts,
  });
  await expect(more).toBeVisible();
  await more.click();
  await expect(more).toHaveCount(0);
  const ids = await cards.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-product-id")),
  );
  expect(ids.length).toBeGreaterThan(firstPage);
  expect(new Set(ids).size).toBe(ids.length);
});
