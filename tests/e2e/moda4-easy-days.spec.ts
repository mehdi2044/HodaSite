import { expect, test } from "@playwright/test";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";

const markets = [
  { locale: "fa", market: "IR", copy: fa, width: 390 },
  { locale: "tr", market: "TR", copy: tr, width: 768 },
  { locale: "en", market: "CA", copy: en, width: 1440 },
] as const;

test.use({ contextOptions: { reducedMotion: "reduce" } });

for (const { locale, market, copy, width } of markets) {
  test(`Easy Days opens the pictured set and adds it once in ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${locale}/m/${market}`);
    const hero = page.locator('[data-moda4="hero"]');
    await hero.getByRole("button", { name: "Easy Days", exact: true }).click();
    const slide = hero.locator('[data-moda4="hero-slide"][data-slide="1"]');
    await expect(slide.locator(".m4-pins button")).toHaveCount(3);
    await slide.locator(".m4-acts button[data-moda4-cta]").click();
    const sheet = slide.locator("details.moda-scene-purchase");
    await expect(sheet).toHaveAttribute("open", "");
    await expect(page).toHaveURL(new RegExp(`/${locale}/m/${market}$`));
    const sizes = sheet.locator('select[name="variantId"]');
    await expect(sizes).toHaveCount(3);
    await expect(sizes.first()).toBeFocused();
    const add = sheet.getByRole("button", { name: copy.scenes.addScene });
    await expect(add).toBeDisabled();
    const total = sheet.locator(".scene-selection-total bdi");
    const initial = await total.innerText();
    const chosen: string[] = [];
    for (const select of await sizes.all()) {
      const choice = await select
        .locator("option:not(:disabled)")
        .nth(1)
        .getAttribute("value");
      await select.selectOption(choice!);
      chosen.push(choice!);
    }
    await expect(total).not.toHaveText(initial);
    await expect(add).toBeEnabled();
    await add.click();
    const saved = sheet
      .getByRole("status")
      .filter({ hasText: copy.commerce.saved });
    await expect(saved).toBeVisible();
    await add.click();
    await expect(saved).toBeVisible();

    const look = page.locator('[data-moda4="shop-the-look"]');
    const photo = look.locator(".scene-photo:visible");
    await expect(photo.locator(".scene-pin")).toHaveCount(3);
    const heading = await look.locator("h2").boundingBox();
    const frame = await photo.boundingBox();
    const panel = await look.locator(".moda-scene-purchase").boundingBox();
    expect(heading && frame && panel).toBeTruthy();
    expect(
      heading!.y + heading!.height <= frame!.y ||
        heading!.x + heading!.width <= frame!.x ||
        frame!.x + frame!.width <= heading!.x,
    ).toBe(true);
    expect(
      panel!.y >= frame!.y + frame!.height ||
        panel!.x >= frame!.x + frame!.width ||
        panel!.x + panel!.width <= frame!.x,
    ).toBe(true);

    await page.goto(`/${locale}/cart?market=${market}`);
    const cartSizes = page.locator('main input[name="variantId"]');
    const shown = await cartSizes.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
    expect(new Set(shown)).toEqual(new Set(chosen));
    const quantities = page.locator(
      'main input[type="number"][name="quantity"]',
    );
    await expect(quantities).toHaveCount(3);
    for (const input of await quantities.all())
      await expect(input).toHaveValue("1");
  });
}

for (const width of [390, 768, 1440]) {
  test(`Rayan hoodie keeps the rotation and wishlist separate at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/fa/m/IR");
    const card = page
      .locator(".kids-motion-card")
      .filter({ hasText: "هودی رایان" })
      .first();
    const rotation = card.locator(".kids-motion-tools > summary");
    const heart = card.locator(".shop-card-wishlist button");
    await expect(rotation).toHaveAttribute(
      "aria-label",
      fa.cutouts.angleControls,
    );
    await expect(heart).toBeVisible();
    const controls = await rotation.boundingBox();
    const wishlist = await heart.boundingBox();
    expect(controls && wishlist).toBeTruthy();
    expect(
      controls!.x + controls!.width <= wishlist!.x ||
        wishlist!.x + wishlist!.width <= controls!.x,
    ).toBe(true);
    await rotation.focus();
    await expect(rotation).toBeFocused();
    await rotation.press("Enter");
    await expect(card.locator(".kids-motion-tools")).toHaveAttribute(
      "open",
      "",
    );
    const turn = card.getByRole("button", {
      name: fa.cutouts.angleRight,
      exact: true,
    });
    if (width === 390) await turn.tap();
    else {
      await turn.hover();
      await turn.click();
    }
    expect(
      await card.evaluate((element) =>
        element.style.getPropertyValue("--kids-angle"),
      ),
    ).toBe("10deg");
    await expect(heart).toBeVisible();
  });
}
