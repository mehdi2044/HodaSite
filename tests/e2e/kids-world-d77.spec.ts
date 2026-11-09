import { expect, test } from "@playwright/test";

const widths = [360, 390, 430, 768, 1280, 1440, 2048] as const;
const selector = '[data-moda4="kids-world"]';
const visibleCard =
  '[data-moda4="kids-turntable-item"][data-kids-visible="true"]';

test("Kids World preserves garment proportions and keeps every visible podium and price clear", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fa/m/IR");
  const section = page.locator(selector);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    const stage = section.locator('[data-moda4="kids-turntable"]');
    await stage.scrollIntoViewIfNeeded();
    await expect(stage.locator(visibleCard).first()).toBeVisible();
    const images = stage.locator(`${visibleCard} img`);
    expect(await images.count()).toBeGreaterThan(0);
    for (const img of await images.all()) {
      await expect
        .poll(() =>
          img.evaluate((node) => (node as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(img).toHaveCSS("object-fit", "contain");
      await expect(img).toHaveCSS("object-position", "50% 100%");
    }
    const problems = await stage.evaluate((node, selector) => {
      const frame = node.getBoundingClientRect();
      const cards = Array.from(node.querySelectorAll<HTMLElement>(selector));
      const issues: string[] = [];
      for (const [index, card] of cards.entries()) {
        const box = card.getBoundingClientRect();
        const base = card
          .querySelector(".moda-kids-base")!
          .getBoundingClientRect();
        const label = card
          .querySelector(".moda-kids-label")!
          .getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
        if (Math.abs(matrix.a - matrix.d) > 0.0001)
          issues.push("unequal scale");
        if (
          base.height <= 8 ||
          label.top <= base.bottom ||
          label.bottom > frame.bottom + 1
        )
          issues.push("base/label outside its space");
        if (box.left < frame.left - 1 || box.right > frame.right + 1)
          issues.push("cropped podium");
        for (const other of cards.slice(index + 1)) {
          const next = other.getBoundingClientRect();
          if (
            Math.min(box.right, next.right) - Math.max(box.left, next.left) >
            2
          )
            issues.push("overlapping podiums");
        }
      }
      return issues;
    }, visibleCard);
    expect(problems, `Kids World at ${width}px`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});

for (const [locale, market] of [
  ["fa", "IR"],
  ["tr", "TR"],
  ["en", "CA"],
] as const) {
  test(`Kids World links to the exact catalog piece with the ${market} price (${locale})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/m/${market}`);
    const section = page.locator(selector);
    const piece = section.locator(`${visibleCard} a.moda-kids-piece`).first();
    await piece.scrollIntoViewIfNeeded();
    const href = await piece.getAttribute("href");
    const price = await piece.locator("bdi").innerText();
    expect(href).toMatch(new RegExp(`^/${locale}/m/${market}/p/.+\\?color=`));
    await expect(section.locator("h2")).toHaveAttribute("dir", "ltr");
    if (locale === "fa") await piece.press("Enter");
    else if (locale === "tr") await piece.tap();
    else await piece.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.getByTestId("product-price")).toContainText(price);
  });
}

test("Kids World pauses without resetting, resumes and moves with the controls and drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/fa/m/IR");
  const section = page.locator(selector);
  const stage = section.locator('[data-moda4="kids-turntable"]');
  const angle = () =>
    stage.evaluate((node) =>
      (node as HTMLElement).style.getPropertyValue("--kids-ring-angle"),
    );
  await stage.scrollIntoViewIfNeeded();
  const initial = await angle();
  await expect.poll(angle).not.toBe(initial);
  const controls = section.locator(".moda-carousel-controls button");
  await controls.nth(1).click();
  await expect(controls.nth(1)).toHaveAttribute("aria-pressed", "true");
  const stopped = await angle();
  expect(await angle()).toBe(stopped);
  await controls.nth(2).click();
  expect(await angle()).not.toBe(stopped);
  await stage.scrollIntoViewIfNeeded();
  const bounds = (await stage.boundingBox())!;
  const beforeDrag = await angle();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 66, bounds.y + 30, {
    steps: 6,
  });
  await page.mouse.up();
  expect(await angle()).not.toBe(beforeDrag);
  await controls.nth(1).click();
  await expect(controls.nth(1)).toHaveAttribute("aria-pressed", "false");
  const resumed = await angle();
  await expect.poll(angle).not.toBe(resumed);
});
