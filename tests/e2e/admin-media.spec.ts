import { fillAdminMfa } from "./helpers/admin-mfa";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const CRON_SECRET = process.env.CRON_SECRET ?? "test-cron";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("media grid, trash and brand picker produce a responsive picture", async ({
  page,
}) => {
  await login(page);
  const image = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#e8792a" },
  })
    .jpeg()
    .toBuffer();
  const upload = await page.request.post("/api/uploads", {
    multipart: {
      file: { name: "e2e-media.jpg", mimeType: "image/jpeg", buffer: image },
    },
  });
  expect(upload.status()).toBe(202);
  const media = (await upload.json()) as { id: string };

  await expect
    .poll(
      async () => {
        // A freshly seeded database already has 12 optimization jobs while a
        // worker batch claims 10. Tick inside the poll so this test never
        // assumes an empty queue or a particular job ordering.
        const tick = await page.request.post("/api/cron/tick", {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        });
        expect(tick.ok()).toBe(true);
        const response = await page.request.get("/api/admin/media?kind=image");
        const body = (await response.json()) as {
          items: Array<{ id: string; status: string }>;
        };
        return body.items.find((item) => item.id === media.id)?.status;
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe("READY");

  const beforeReplaceResponse = await page.request.get(
    "/api/admin/media?kind=image",
  );
  const beforeReplace = (await beforeReplaceResponse.json()) as {
    items: Array<{ id: string; url: string }>;
  };
  const oldUrl = beforeReplace.items.find((item) => item.id === media.id)?.url;
  expect(oldUrl).toBeTruthy();
  const replacementImage = await sharp({
    create: { width: 960, height: 720, channels: 3, background: "#2e7d4f" },
  })
    .jpeg()
    .toBuffer();
  const replace = await page.request.post(`/api/uploads/${media.id}/replace`, {
    multipart: {
      file: {
        name: "e2e-replacement.jpg",
        mimeType: "image/jpeg",
        buffer: replacementImage,
      },
    },
  });
  expect(replace.status()).toBe(202);
  await expect
    .poll(
      async () => {
        await page.request.post("/api/cron/tick", {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        });
        const response = await page.request.get("/api/admin/media?kind=image");
        const body = (await response.json()) as {
          items: Array<{ id: string; url: string; width: number }>;
        };
        return body.items.find((item) => item.id === media.id);
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] },
    )
    .toMatchObject({ id: media.id, width: 960 });
  const afterReplace = await page.request.get("/api/admin/media?kind=image");
  const replacedItems = (await afterReplace.json()) as {
    items: Array<{ id: string; url: string }>;
  };
  expect(
    replacedItems.items.find((item) => item.id === media.id)?.url,
  ).not.toBe(oldUrl);

  await page.goto("/admin/media");
  const tile = page.getByTestId(`media-tile-${media.id}`);
  await expect(tile).toBeVisible();
  await tile.locator("img").click();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(tile).toBeHidden();
  await page.goto("/admin/media?view=trash");
  const trashTile = page.getByTestId(`media-tile-${media.id}`);
  await expect(trashTile).toBeVisible();
  await trashTile.locator("img").click();
  await page.getByRole("button", { name: "بازیابی" }).click();
  await expect(trashTile).toBeHidden();

  await page.goto("/admin/settings/brand");
  await page.getByRole("button", { name: "انتخاب رسانه" }).first().click();
  await page.getByTestId(`media-picker-item-${media.id}`).click();
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await page.goto("/fa");
  const picture = page.locator("header picture");
  await expect(picture).toBeVisible();
  await expect(picture.locator('source[type="image/avif"]')).toHaveAttribute(
    "srcset",
    /\/media\/media\/replacements\//,
  );
  const webpSource = picture.locator('source[type="image/webp"]');
  await expect(webpSource).toHaveAttribute(
    "srcset",
    /\/media\/media\/replacements\//,
  );
  await expect(picture.locator("img")).toHaveAttribute("width", "960");
  await expect(picture.locator("img")).toHaveAttribute("height", "720");

  const srcset = await webpSource.getAttribute("srcset");
  const variantUrl = srcset?.split(",")[0]?.trim().split(" ")[0];
  expect(variantUrl).toBeTruthy();
  const streamed = await page.request.get(variantUrl!);
  expect(streamed.status()).toBe(200);
  expect(streamed.headers()["content-type"]).toContain("image/webp");
  expect(streamed.headers()["cache-control"]).toContain("immutable");
});
