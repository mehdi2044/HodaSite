import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import en from "../../messages/en.json";

const productId = "seed-moda4-style-kids-hoodie";
const rust = "seed-moda4-seed-style-v2-kids-hoodie-6y";
const sage = "seed-moda4-seed-style-v2-kids-hoodie-sage-6y";

test.use({ contextOptions: { reducedMotion: "reduce" } });

async function displayedImage(layer: Locator) {
  const image = layer.locator("img");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  return image.evaluate(async (img: HTMLImageElement) => {
    const source = img.currentSrc;
    const response = await fetch(source);
    if (!response.ok) throw new Error("Cutout image request failed");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer(),
    );
    return {
      path: new URL(source).pathname,
      sha256: Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  });
}

test("FR3 approved Rayan hoodie switches actual Cutout pixels between two existing 6Y colors", async ({
  page,
}, info) => {
  test.skip(
    process.env.FR3_FIX_SUITE !== "color",
    "Requires the isolated admin-approved Rayan color fixture",
  );
  expect(info.project.use.baseURL).toBe("http://127.0.0.7:3104");
  await page.goto("/en/fitting-room?market=CA");
  const room = page.getByTestId("instant-fitting");
  const stage = room.locator('[data-moda4="tryon-stage"]');
  const card = room.locator(`[data-product-id="${productId}"]`);
  await room.locator('[data-model-kind="BOY"]').click();
  await expect(stage).toHaveAttribute("data-stage-model-kind", "BOY");
  const choose = card.locator("summary");
  await choose.click();
  const picker = card.getByRole("combobox", {
    name: en.instantFitting.variant,
  });
  const apply = card.getByRole("button", {
    name: en.instantFitting.try,
    exact: true,
  });
  const rustLayer = stage.locator(`[data-fitting-piece-target="${rust}"]`);
  const sageLayer = stage.locator(`[data-fitting-piece-target="${sage}"]`);
  await expect(picker.locator(`option[value="${rust}"]`)).toHaveJSProperty(
    "disabled",
    false,
  );
  await expect(picker.locator(`option[value="${sage}"]`)).toHaveJSProperty(
    "disabled",
    false,
  );
  await picker.selectOption(rust);
  await apply.click();
  const first = await displayedImage(rustLayer);
  await expect(card).toHaveAttribute("data-fitting-variant", rust);
  const rustPrice = await card.locator("bdi").innerText();
  await stage.screenshot({
    path: info.outputPath("before-rust.png"),
    animations: "disabled",
  });

  if (!(await picker.isVisible())) await choose.click();
  await picker.selectOption(sage);
  await apply.click();
  await expect(rustLayer).toHaveCount(0);
  const second = await displayedImage(sageLayer);
  expect(second.path).not.toBe(first.path);
  expect(second.sha256).not.toBe(first.sha256);
  await expect(card).toHaveAttribute("data-fitting-variant", sage);
  await expect(card.locator("bdi")).toHaveText(rustPrice);
  await stage.screenshot({
    path: info.outputPath("after-sage.png"),
    animations: "disabled",
  });

  await expect(room).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await expect(stage).toHaveAttribute("data-stage-model-kind", "BOY");
  await expect(card).toHaveAttribute("data-fitting-variant", sage);
  expect(await displayedImage(sageLayer)).toEqual(second);
  await expect(rustLayer).toHaveCount(0);
  writeFileSync(
    info.outputPath("render-proof.json"),
    JSON.stringify(
      {
        productId,
        size: "6Y",
        market: "CA",
        model: "BOY",
        unchangedPrice: rustPrice,
        before: { variantId: rust, ...first },
        after: { variantId: sage, ...second },
        restored: true,
      },
      null,
      2,
    ),
  );
});
