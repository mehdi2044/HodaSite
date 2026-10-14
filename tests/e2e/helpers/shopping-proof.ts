import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
/** Lazy images and srcset switches need real viewport admission before decode. */
export async function expectImagesDecoded(images: Locator) {
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(async (element) => {
          const image = element as HTMLImageElement;
          try {
            await image.decode();
          } catch {
            return false;
          }
          return image.complete && image.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }
}
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
