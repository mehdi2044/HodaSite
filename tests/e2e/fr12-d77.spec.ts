import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

const db = new PrismaClient();
const messages = { fa, tr, en };
type Locale = keyof typeof messages;
test.use({ hasTouch: true });
test.afterAll(() => db.$disconnect());

async function choose(
  page: Page,
  locale: Locale,
  key: string,
  exclude?: string,
) {
  const t = messages[locale].instantFitting;
  const profile = await db.catalogCutout.findFirstOrThrow({
    where: {
      productId: `seed-moda4-style-${key}`,
      variantId: null,
      deletedAt: null,
    },
  });
  const variant = await db.variant.findFirstOrThrow({
    where: {
      ...(exclude ? { id: { not: exclude } } : {}),
      productId: profile.productId,
      colorId: profile.colorId,
      isActive: true,
      stockItems: { some: { onHand: { gt: 0 } } },
    },
    include: { product: true },
    orderBy: { id: "asc" },
  });
  const room = page.getByTestId("instant-fitting");
  await room
    .getByLabel(t.search, { exact: true })
    .fill((variant.product.titleI18n as Record<string, string>)[locale]);
  await room.getByRole("button", { name: t.search, exact: true }).click();
  const card = room.locator(`[data-product-id="${profile.productId}"]`);
  if ((await card.locator("details").getAttribute("open")) === null)
    await card.locator("summary").click();
  await card.getByLabel(t.variant, { exact: true }).selectOption(variant.id);
  await card.getByRole("button", { name: t.try, exact: true }).click();
  await expect(
    room.locator(`[data-fitting-piece-target="${variant.id}"]`),
  ).toBeAttached();
  await expect(
    room.getByRole("button", { name: t.addAll, exact: true }),
  ).toBeEnabled();
  return variant.id;
}

async function touchDrag(page: Page, x: number, y: number, delta: number) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + delta * fraction, y, id: 1 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
}

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`FR2 D77 real four-model composition, drag, controls, resize and reduced motion ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(300000);
    const t = messages[locale].instantFitting;
    const coins = await db.fittingCoinEntry.count(),
      sessions = await db.fittingSession.count();
    await page.goto(`/${locale}/fitting-room?market=${market}`);
    const room = page.getByTestId("instant-fitting");
    const stage = room.locator('[data-moda4="tryon-stage"]');
    const turn = room.locator('[data-moda4="tryon-turntable"]');
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [kind, key] of [
        ["WOMAN", "women-knit"],
        ["MAN", "men-shirt"],
        ["GIRL", "kids-dress"],
        ["BOY", "kids-knit"],
      ]) {
        await room.locator(`[data-model-kind="${kind}"]`).click();
        await expect(turn).toHaveAttribute("data-yaw", "-14");
        let id = await choose(page, locale, key);
        if (kind === "WOMAN") {
          // A second stocked size must replace the exact prior variant/cutout.
          const previous = id;
          id = await choose(page, locale, key, previous);
          expect(id).not.toBe(previous);
          await expect(
            stage.locator(`[data-fitting-piece-target="${previous}"]`),
          ).toHaveCount(0);
          for (const extra of [
            "women-trousers",
            "women-coat",
            "accessories-bag",
          ])
            await choose(page, locale, extra);
          await expect(
            stage.locator("[data-fitting-piece-target]"),
          ).toHaveCount(4);
        }
        await expect(stage.locator('[data-motion="enter"]')).toHaveCount(0);
        await stage.focus();
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await expect(turn).toHaveAttribute("data-yaw", "5");
        await room.getByRole("button", { name: t.front, exact: true }).click();
        await expect(turn).toHaveAttribute("data-yaw", "0");
        await room
          .getByRole("button", { name: t.rotateRight, exact: true })
          .tap();
        await expect(turn).toHaveAttribute("data-yaw", "25");
        await room.getByRole("button", { name: t.front, exact: true }).click();
        await stage.scrollIntoViewIfNeeded();
        const box = (await stage.boundingBox())!;
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 60, y, { steps: 5 });
        await page.mouse.up();
        await expect(turn).toHaveAttribute("data-yaw", "21");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 20, y, { steps: 5 });
        await page.mouse.up();
        await expect(turn).toHaveAttribute("data-yaw", "28");
        await room.getByRole("button", { name: t.front, exact: true }).click();
        await stage.scrollIntoViewIfNeeded();
        const touchBox = (await stage.boundingBox())!;
        await touchDrag(
          page,
          touchBox.x + touchBox.width / 2,
          touchBox.y + touchBox.height / 2,
          60,
        );
        await expect
          .poll(async () => Number(await turn.getAttribute("data-yaw")))
          .toBeCloseTo(21, 0);
        const pose = await turn.getAttribute("data-yaw");
        await room.getByLabel(t.search, { exact: true }).focus();
        await expect(turn).toHaveAttribute("data-yaw", pose!);
        await stage.press("Control+Home");
        await expect(turn).toHaveAttribute("data-yaw", pose!);
        await page.setViewportSize({
          width: width === 390 ? 1440 : 390,
          height: 1000,
        });
        await expect(turn).toHaveAttribute("data-yaw", pose!);
        await expect(
          stage.locator(`[data-fitting-piece-target="${id}"]`),
        ).toBeAttached();
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(turn).toHaveCSS("transform", "none");
        await expect(
          room.getByRole("button", { name: t.rotateLeft, exact: true }),
        ).toBeDisabled();
        await expect(
          stage.locator(`[data-fitting-piece-target="${id}"] img`),
        ).toBeVisible();
        await expect(
          stage.locator(`[data-fitting-piece-target="${id}"] img`),
        ).toHaveCSS("opacity", "1");
        await room
          .getByRole("button", { name: t.clearSelection, exact: true })
          .click();
        await expect(stage.locator("[data-fitting-piece-target]")).toHaveCount(
          0,
        );
        await expect(
          room.getByRole("button", { name: t.addAll, exact: true }),
        ).toBeDisabled();
        await page.emulateMedia({ reducedMotion: "no-preference" });
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
    }
    await page.setViewportSize({ width: 2048, height: 1000 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(await db.fittingCoinEntry.count()).toBe(coins);
    expect(await db.fittingSession.count()).toBe(sessions);
    await info.attach("FR2 scope", {
      body: "Actual seeded variants/cutouts; no paid AI request, coin debit, payment or wardrobe mutation.",
      contentType: "text/plain",
    });
  });
}
