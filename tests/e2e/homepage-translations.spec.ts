import { fillAdminMfa } from "./helpers/admin-mfa";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("ایمیل").fill(EMAIL);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await fillAdminMfa(page);
  await page.getByRole("button", { name: "ورود امن" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe.configure({ mode: "serial" });
test("homepage preview is sandboxed, responsive and writes only on save", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/homepage");
  const before = await page.locator('input[name="blocks"]').inputValue();
  await page.getByLabel("افزودن بلوک").selectOption("RichText");
  await page.getByRole("button", { name: "افزودن بلوک", exact: true }).click();
  const input = page.getByLabel("متن (fa)").last();
  await input.fill("پیش‌نمایش زنده بدون ذخیره");
  const frame = page.getByTitle("پیش‌نمایش ذخیره‌نشده");
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(
    frame.contentFrame().getByText("پیش‌نمایش زنده بدون ذخیره"),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="blocks"]')).toHaveValue(before);
});

test("UI override changes runtime text and reset restores file default", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/translations");
  await page.getByPlaceholder("جست‌وجوی کلید یا متن…").fill("catalog.search");
  const card = page.getByTestId("translation-catalog.search");
  const replacement = `جایگزین ${Date.now()}`;
  await card.getByLabel("مقدار جایگزین").fill(replacement);
  await card.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect
    .poll(async () => (await page.request.get("/fa/search")).text(), {
      timeout: 15_000,
    })
    .toContain(replacement);
  await page.goto("/fa/search");
  await expect(page.getByText(replacement).first()).toBeVisible();
  await page.goto("/admin/content/translations");
  await page.getByPlaceholder("جست‌وجوی کلید یا متن…").fill("catalog.search");
  await page
    .getByTestId("translation-catalog.search")
    .getByRole("button", { name: "بازگشت به پیش‌فرض" })
    .click();
});

test("homepage source selections and every trust translation survive save and reload", async ({
  page,
}, info) => {
  const { PrismaClient } = await import("@prisma/client");
  const { shoppingProof } = await import("./helpers/shopping-proof");
  const db = new PrismaClient();
  const market = await db.market.create({
    data: {
      code: `HP-${Date.now()}`,
      name: "Homepage browser test",
      currency: "USD",
      defaultLocale: "en",
      enabledLocales: ["en"],
      roundingRule: {},
      holdHours: 1,
      paymentDeadlineHours: 1,
      fxMode: "AUTO_ACCEPT",
    },
  });
  const category = await db.category.findFirstOrThrow({
    where: { deletedAt: null },
  });
  const collection = await db.collection.create({
    data: {
      slug: market.code,
      titleI18n: { fa: "مجموعه آزمون", tr: "Test", en: "Test" },
    },
  });
  const items = [
    { fa: "ارسال اول", tr: "Bir", en: "One" },
    { fa: "ارسال دوم", tr: "İki", en: "Two" },
    { fa: "ارسال سوم", tr: "Üç", en: "Three" },
  ];
  const homepage = await db.homepage.create({
    data: {
      marketId: market.id,
      blocks: [
        { type: "TrustBar", items },
        {
          type: "ProductStrip",
          title: { fa: "محصولات", tr: "Ürünler", en: "Products" },
          source: { mode: "latest", limit: 4 },
        },
      ],
    },
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/admin/content/homepage");
    await page
      .getByLabel("دامنهٔ بازار", { exact: true })
      .selectOption(market.id);
    await page
      .getByTestId("trust-item-0")
      .getByLabel("متن (fa)")
      .fill("ارسال ویرایش‌شده");
    await page.getByLabel("منبع", { exact: true }).selectOption("category");
    await page
      .getByLabel("انتخاب دسته یا مجموعه", { exact: true })
      .selectOption(category.id);
    await page.getByLabel("تعداد نمایش", { exact: true }).fill("3");
    await page.getByLabel("منبع", { exact: true }).scrollIntoViewIfNeeded();
    await shoppingProof(page, info, "homepage-source-editor");
    const save = page.getByRole("button", {
      name: "ذخیرهٔ چیدمان",
      exact: true,
    });
    await save.click();
    await expect(page.getByRole("status")).toBeVisible();
    const saved = (
      await db.homepage.findUniqueOrThrow({ where: { id: homepage.id } })
    ).blocks as unknown as Array<{
      items?: typeof items;
      source?: { mode: string; referenceId?: string; limit: number };
    }>;
    expect(saved[0].items).toEqual([
      { ...items[0], fa: "ارسال ویرایش‌شده" },
      ...items.slice(1),
    ]);
    expect(saved[1].source).toEqual({
      mode: "category",
      referenceId: category.id,
      limit: 3,
    });
    await page.reload();
    await page
      .getByLabel("دامنهٔ بازار", { exact: true })
      .selectOption(market.id);
    await expect(
      page.getByTestId("trust-item-2").getByLabel("متن (en)"),
    ).toHaveValue("Three");
    await page.getByLabel("منبع", { exact: true }).selectOption("collection");
    await page
      .getByLabel("انتخاب دسته یا مجموعه", { exact: true })
      .selectOption(collection.id);
    await save.click();
    await expect
      .poll(async () =>
        JSON.stringify(
          (await db.homepage.findUniqueOrThrow({ where: { id: homepage.id } }))
            .blocks,
        ),
      )
      .toContain(collection.id);
    await page.getByLabel("منبع", { exact: true }).selectOption("bestseller");
    await save.click();
    await expect
      .poll(async () =>
        JSON.stringify(
          (await db.homepage.findUniqueOrThrow({ where: { id: homepage.id } }))
            .blocks,
        ),
      )
      .toContain('"bestseller"');
  } finally {
    await db.homepage.delete({ where: { id: homepage.id } });
    await db.collection.delete({ where: { id: collection.id } });
    // Audit history retains the market ID as data, not a foreign key.
    await db.market.delete({ where: { id: market.id } });
    await db.$disconnect();
  }
});
