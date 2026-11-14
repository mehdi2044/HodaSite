import { expect, test } from "@playwright/test";
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
