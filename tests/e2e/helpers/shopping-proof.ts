import { expect, type Page, type TestInfo } from "@playwright/test";
export async function shoppingProof(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const path = info.outputPath(`shopping-${label}.png`);
  await page.screenshot({ path });
  await info.attach(label, { path, contentType: "image/png" });
}
