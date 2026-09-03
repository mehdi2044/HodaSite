import { test, expect } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("POST /api/uploads without a session is 401", async ({ request }) => {
  const res = await request.post("/api/uploads", {
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(res.status()).toBe(401);
});

test("an authenticated upload of a real PNG succeeds", async ({ page }) => {
  await login(page);
  const res = await page.request.post("/api/uploads", {
    multipart: {
      file: { name: "photo.png", mimeType: "image/png", buffer: PNG },
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.url).toMatch(/\/media\/media\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);

  // B10: the uploaded file is actually served
  const served = await page.request.get(body.url);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("image/png");
  expect(Buffer.from(await served.body()).equals(PNG)).toBe(true);
});

test("a text file renamed .png is rejected by magic-byte sniffing", async ({
  page,
}) => {
  await login(page);
  const res = await page.request.post("/api/uploads", {
    multipart: {
      file: {
        name: "evil.png",
        mimeType: "image/png",
        buffer: Buffer.from("this is definitely not an image"),
      },
    },
  });
  expect(res.status()).toBe(415);
});
