import { expect, test } from "@playwright/test";

const widths = [360, 390, 430, 768, 1280, 1440, 2048] as const;
const selector = '[data-moda4="kids-world"]';
const cardSelector = '[data-moda4="kids-turntable-item"]';
const labeledCard = `${cardSelector}[data-kids-label-visible="true"]`;

test("Kids World preserves all garment proportions and only suppresses occluded labels", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fa/m/IR");
  const section = page.locator(selector);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    const stage = section.locator('[data-moda4="kids-turntable"]');
    await stage.scrollIntoViewIfNeeded();
    await expect(stage.locator(labeledCard).first()).toBeVisible();
    const images = stage.locator(`${cardSelector} img`);
    expect(await images.count()).toBeGreaterThan(1);
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
      const visibleLabels = cards
        .filter((card) => card.dataset.kidsLabelVisible === "true")
        .map((card) =>
          card.querySelector(".moda-kids-label")!.getBoundingClientRect(),
        );
      for (const card of cards) {
        const art = card.querySelector(".moda-kids-visual")!;
        const podium = card.querySelector(".moda-kids-base")!;
        const base = podium.getBoundingClientRect();
        const label = card
          .querySelector(".moda-kids-label")!
          .getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
        if (Math.abs(matrix.a - matrix.d) > 0.0001)
          issues.push("unequal scale");
        if (base.height <= 8 || label.top <= base.bottom)
          issues.push("base/label outside its space");
        if (
          [card, art, podium].some(
            (element) => Number(getComputedStyle(element).opacity) < 0.83,
          )
        )
          issues.push("hidden garment or podium");
      }
      for (const [index, label] of visibleLabels.entries()) {
        if (
          label.left < frame.left - 1 ||
          label.right > frame.right + 1 ||
          label.bottom > frame.bottom + 1
        )
          issues.push("cropped price");
        for (const next of visibleLabels.slice(index + 1)) {
          if (
            Math.min(label.right, next.right) -
              Math.max(label.left, next.left) >
              2 &&
            Math.min(label.bottom, next.bottom) -
              Math.max(label.top, next.top) >
              2
          )
            issues.push("overlapping prices");
        }
      }
      return issues;
    }, cardSelector);
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
    const piece = section.locator(`${labeledCard} a.moda-kids-piece`).first();
    await piece.scrollIntoViewIfNeeded();
    const href = await piece.getAttribute("href");
    const price = await piece.locator("bdi").innerText();
    expect(href).toMatch(new RegExp(`^/${locale}/m/${market}/p/.+\\?color=`));
    await expect(section.locator("h2")).toHaveAttribute("dir", "ltr");
    const target = piece.locator(".moda-kids-visual");
    if (locale === "fa") await piece.press("Enter");
    else if (locale === "tr") await target.tap();
    else await target.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.getByTestId("product-price")).toContainText(price);
  });

  test(`Kids World hint and controls occupy distinct reachable rows (${locale})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${locale}/m/${market}`);
    const section = page.locator(selector);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    for (const width of widths) {
      await page.setViewportSize({ width, height: width >= 1280 ? 630 : 780 });
      const hint = section.locator(".moda-kids-hint");
      await hint.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      const problem = await hint.evaluate((element) => {
        const hintRect = element.getBoundingClientRect();
        const buttons = element.parentElement!.querySelectorAll("button");
        for (const button of buttons) {
          const { left, top, bottom, width, height } =
            button.getBoundingClientRect();
          if (
            top - hintRect.bottom < 8 ||
            bottom > innerHeight ||
            width < 43.9 ||
            height < 43.9
          )
            return "The hint or button is outside its safe row";
          if (
            !button.contains(
              document.elementFromPoint(left + width / 2, top + height / 2),
            )
          )
            return "A floating element covers a button";
        }
        return null;
      });
      expect(problem, `${locale} at ${width}px`).toBeNull();
    }
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
      parseFloat(
        (node as HTMLElement).style.getPropertyValue("--kids-ring-angle"),
      ),
    );
  await stage.scrollIntoViewIfNeeded();
  const initial = await angle();
  await expect.poll(angle).not.toBe(initial);
  const controls = section.locator(".moda-carousel-controls button");
  await controls.nth(1).click();
  await expect(controls.nth(1)).toHaveAttribute("aria-pressed", "true");
  const stopped = await angle();
  expect(await angle()).toBe(stopped);
  const count = await stage.locator(cardSelector).count();
  expect(count).toBeGreaterThan(1);
  for (const [index, direction] of [
    [2, 1],
    [0, -1],
  ]) {
    const start = await angle();
    for (let i = 1; i <= count; i++) {
      await controls.nth(index).click();
      await expect
        .poll(angle)
        .toBeCloseTo(start + (direction * 360 * i) / count, 4);
      const opacity = await stage
        .locator(".moda-kids-visual, .moda-kids-base")
        .evaluateAll((nodes) =>
          nodes.map((node) => Number(getComputedStyle(node).opacity)),
        );
      expect(Math.min(...opacity)).toBeGreaterThanOrEqual(0.83);
    }
  }
  expect(await angle()).toBeCloseTo(stopped, 4);
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
