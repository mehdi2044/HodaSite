import { expect, test } from "@playwright/test";
import en from "../../messages/en.json";
import { fillAdminMfa } from "./helpers/admin-mfa";

const models = ["WOMAN", "MAN", "GIRL", "BOY"] as const;
const accessories = ["cap", "scarf", "bag"] as const;
const labels = en.instantFitting;
const card = (kind: string) =>
  `[data-product-id="seed-moda4-style-accessories-${kind}"]`;

test("FR3.1 locates all three accessories on four models on desktop and mobile", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/en/fitting-room?market=CA");
  const room = page.getByTestId("instant-fitting");
  const stage = room.locator('[data-moda4="tryon-stage"]');
  const receipt = room.getByRole("region", { name: labels.receiptTitle });
  const dock = page.locator(".moda-fr31-dock");
  await expect(dock.locator('a[aria-current="page"]')).toHaveText(
    labels.dockFitting,
  );
  await expect(dock.getByRole("link")).toHaveCount(6);

  await expect(
    receipt.getByRole("button", { name: labels.realView }),
  ).toBeDisabled();
  for (const model of models) {
    await room.locator(`[data-model-kind="${model}"]`).click();
    await expect(stage).toHaveAttribute("data-stage-model-kind", model);
    for (const item of accessories) {
      const pick = room
        .locator(card(item))
        .getByRole("button", { name: labels.try });
      if ((await pick.getAttribute("aria-pressed")) !== "true")
        await pick.click();
      await expect(pick).toHaveAttribute("aria-pressed", "true");
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      const layers = stage.locator("[data-fitting-piece-target]");
      await expect(layers).toHaveCount(3);
      const coords = await layers.evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((node) => {
            const el = node as HTMLElement;
            const variant = el.dataset.fittingPieceTarget ?? "";
            const kind = ["cap", "scarf", "bag"].find((key) =>
              variant.includes(key),
            );
            return [
              kind,
              [parseFloat(el.style.left), parseFloat(el.style.top)],
            ];
          }),
        ),
      );
      const child = model === "BOY" || model === "GIRL";
      expect(coords.cap[1]).toBeLessThan(child ? 33 : 8);
      expect(coords.scarf[1]).toBeGreaterThan(coords.cap[1]);
      expect(coords.bag[1]).toBeGreaterThan(coords.scarf[1]);
      expect(coords.bag[0]).toBeGreaterThan(59);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if (process.env.FR31_EVIDENCE)
        await stage.screenshot({
          path: info.outputPath(`${model.toLowerCase()}-${width}.png`),
        });
    }
    await expect(receipt.locator("li")).toHaveCount(3);
    for (const row of await receipt.locator("li").all()) {
      await expect(row.locator("img")).toBeVisible();
      await expect(row.locator(":scope > bdi")).toContainText("CA$");
    }
  }
  await expect(dock.locator('a[href="/en/cart?market=CA"]')).toBeVisible();
  const total = await receipt.locator(".moda-fr31-total bdi").innerText();
  const chosenVariants = await Promise.all(
    accessories.map((kind) =>
      room.locator(card(kind)).getAttribute("data-fitting-variant"),
    ),
  );
  await receipt.getByRole("button", { name: labels.addAll }).click();
  await expect(receipt.getByRole("status")).toHaveText(labels.added);
  if (process.env.FR31_EVIDENCE) {
    await receipt.screenshot({ path: info.outputPath("receipt-390.png") });
    await dock.screenshot({ path: info.outputPath("dock-390.png") });
  }
  await page.goto("/en/cart?market=CA");
  await expect(page.locator(".shop-cart-item")).toHaveCount(3);
  const cartVariants = await page
    .locator('.shop-cart-controls input[name="variantId"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value),
    );
  expect(cartVariants.sort()).toEqual(chosenVariants.sort());
  await expect(
    page.locator(".shop-order-summary dl > div").first().locator("dd"),
  ).toHaveText(total);
});

test("FR3.1 dock opens real category and product with correct active state", async ({
  page,
}) => {
  await page.goto("/fa/fitting-room?market=IR");
  const dock = page.locator(".moda-fr31-dock");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  for (const [name, route] of [
    ["دسته", /\/c\//],
    ["محصول", /\/p\//],
    ["خانه", /\/fa\/m\/IR\?/],
    ["ورود / ثبت‌نام", /\/account\/login/],
  ] as const) {
    await dock.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(route);
    await expect(dock.locator('a[aria-current="page"]')).toHaveText(name);
  }
  await expect(dock.getByRole("link", { name: "پروفایل" })).toHaveAttribute(
    "href",
    /\/fa\/account\?/,
  );
});

test("FR3.1 admin saves isolated side geometry and preserves front placement", async ({
  page,
  context,
}, info) => {
  test.skip(
    !process.env.FR31_ADMIN_FIXTURE,
    "Requires a separate FR3.1 catalog for editing",
  );
  await page.goto("/admin/login");
  await page.locator('[name="email"]').fill(process.env.ADMIN_EMAIL!);
  await page.locator('[name="password"]').fill(process.env.ADMIN_PASSWORD!);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await context.addCookies([
    { name: "hoda.admin.locale", value: "en", url: info.project.use.baseURL! },
  ]);
  await page.goto(
    "/admin/catalog/cutouts?product=seed-moda4-style-kids-hoodie&color=seed-color-rust",
  );
  const c = en.cutouts;
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="payload"]') });
  const angle = form.getByRole("combobox", { name: c.placementView });
  const model = form.getByRole("combobox", { name: c.model, exact: true });
  const rotation = form.getByLabel(c.fields.rotation, { exact: true });
  await model.selectOption("boy");
  const front = await rotation.inputValue();
  await angle.selectOption("right");
  await rotation.fill("12");
  await form.getByLabel(c.mask.bottom).fill("0.08");
  const visual = page.getByTestId("cutout-visual");
  await expect(visual).toHaveCSS("clip-path", "inset(0% 0px 8%)");
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(rotation).toHaveValue("12");
  await form.getByLabel(c.confirm, { exact: true }).check();
  await form.getByRole("button", { name: c.save, exact: true }).click();
  await expect(form.locator(":scope > [role=status]")).toBeVisible();
  await page.reload();
  await model.selectOption("boy");
  await expect(rotation).toHaveValue(front);
  await angle.selectOption("right");
  await expect(rotation).toHaveValue("12");
  if (process.env.FR31_EVIDENCE)
    await visual.screenshot({ path: info.outputPath("admin-right-390.png") });
});
