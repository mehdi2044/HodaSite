import { expect, test, type Page } from "@playwright/test";
import fa from "../../messages/fa.json";

test("the four-world prism crosses its seam by one face in either direction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fa/m/IR");
  const consent = page.getByRole("button", { name: fa.consent.reject });
  if (await consent.isVisible()) await consent.click();

  const prism = page.locator(".moda-carousel-prism");
  const orbit = prism.locator('[data-moda4="worlds-prism"]');
  const faceButtons = prism.locator(".moda-carousel-tabs button");
  const faces = orbit.locator('[data-moda4="worlds-face"]');
  const category = prism.locator(".moda-prism-links a:visible");
  await expect(faceButtons).toHaveCount(4);
  await expect(prism).toHaveAttribute("data-reduced", "true");
  await expect(prism).toHaveAttribute("data-running", "false");
  expect(
    await orbit.evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");

  const firstUrl = await category.getAttribute("href");
  expect(firstUrl).toMatch(/^\/fa\/m\/IR\/c\//);
  const previous = prism.getByRole("button", {
    name: fa.modaHomepage.previous,
  });
  const next = prism.getByRole("button", { name: fa.modaHomepage.next });
  await previous.press("Enter");
  await expect(faceButtons.last()).toHaveAttribute("aria-pressed", "true");
  await expect(orbit).toHaveCSS("transform-style", "preserve-3d");
  await expect(orbit).toHaveAttribute("style", /rotateY\(90deg\)/);
  await expect(faces.last()).toHaveAttribute("aria-hidden", "false");
  const lastUrl = await category.getAttribute("href");
  expect(lastUrl).toMatch(/^\/fa\/m\/IR\/c\//);
  expect(lastUrl).not.toBe(firstUrl);

  await next.press("Enter");
  await expect(orbit).toHaveAttribute("style", /rotateY\(0deg\)/);
  await expect(category).toHaveAttribute("href", firstUrl!);
  await faceButtons.last().press("Enter");
  await expect(orbit).toHaveAttribute("style", /rotateY\(90deg\)/);
  await expect(category).toHaveAttribute("href", lastUrl!);
  const destination = await page.request.get(lastUrl!);
  expect(destination.ok()).toBe(true);
});

async function openPrism(page: Page) {
  await page.goto("/fa/m/IR");
  const consent = page.getByRole("button", { name: fa.consent.reject });
  if (await consent.isVisible()) await consent.click();
  const prism = page.locator(".moda-carousel-prism");
  const stage = prism.locator(".moda-carousel-stage");
  await stage.scrollIntoViewIfNeeded();
  return { prism, stage, orbit: stage.locator('[data-moda4="worlds-prism"]') };
}

test.describe("mouse and sequential movement", () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: { width: 1440, height: 900 },
  });

  test("repeated quarter turns retain their direction and selected catalog link", async ({
    page,
  }) => {
    const { prism, stage, orbit } = await openPrism(page);
    const buttons = prism.locator(".moda-carousel-tabs button");
    const next = prism.getByRole("button", { name: fa.modaHomepage.next });
    const previous = prism.getByRole("button", {
      name: fa.modaHomepage.previous,
    });
    const link = prism.locator(".moda-prism-links a:visible");
    await buttons.first().click();
    const origin = await orbit.evaluate((node) =>
      Number(
        /rotateY\((-?\d+)deg\)/.exec(node.getAttribute("style") ?? "")?.[1],
      ),
    );
    const destinations = new Set([await link.getAttribute("href")]);
    await expect(stage).toHaveCSS("perspective", "1600px");
    for (let step = 1; step <= 8; step++) {
      await next.click();
      await expect(buttons.nth(step % 4)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(orbit).toHaveAttribute(
        "style",
        new RegExp(`rotateY\\(${origin - step * 90}deg\\)`),
      );
      destinations.add(await link.getAttribute("href"));
    }
    expect(destinations.size).toBe(4);
    for (const href of destinations) {
      expect(href).toMatch(/^\/fa\/m\/IR\/c\//);
      expect((await page.request.get(href!)).ok()).toBe(true);
    }
    await previous.click();
    await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
    const faceLink = orbit.locator('[aria-hidden="false"] a');
    await faceLink.scrollIntoViewIfNeeded();
    const bounds = (await faceLink.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 90, y, { steps: 8 });
    await page.mouse.up();
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
    await expect(orbit).toHaveAttribute(
      "style",
      new RegExp(`rotateY\\(${origin - 720}deg\\)`),
    );
    await expect(page).toHaveURL(/\/fa\/m\/IR$/);
    const target = await link.getAttribute("href");
    await link.click();
    await expect(page).toHaveURL((url) => url.pathname === target);
  });
});

test("mobile touch swipe changes the visible prism face", async ({
  page,
  browserName,
}) => {
  // Chromium dispatches native multi-event touch gestures through its CDP.
  expect(browserName).toBe("chromium");
  const { prism, orbit } = await openPrism(page);
  const buttons = prism.locator(".moda-carousel-tabs button");
  await buttons.first().tap();
  const faceLink = orbit.locator('[aria-hidden="false"] a');
  await faceLink.scrollIntoViewIfNeeded();
  const bounds = (await faceLink.boundingBox())!;
  const x = bounds.x + bounds.width * 0.66;
  const y = bounds.y + bounds.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let offset = 15; offset <= 105; offset += 15)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - offset, y }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/fa\/m\/IR$/);
  } finally {
    await session.detach();
  }
});
