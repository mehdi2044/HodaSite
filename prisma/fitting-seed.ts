import type { PrismaClient } from "@prisma/client";
const text = (fa: string, tr: string, en: string) => ({ fa, tr, en });
/** Additive samples. Preserve existing merchant settings, prices, taxonomy and model choices. */
export async function seedFittingRoom(db: PrismaClient) {
  for (const [key, title] of [
    ["girls", text("دخترانه", "Kız çocuk", "Girls")],
    ["boys", text("پسرانه", "Erkek çocuk", "Boys")],
    ["baby", text("نوزادی", "Bebek", "Baby")],
  ] as const) {
    const parentId = `seed-category-kids-${key}`;
    await db.category.upsert({
      where: { id: parentId },
      update: {},
      create: {
        id: parentId,
        parentId: "seed-category-kids",
        gender: "KIDS",
        titleI18n: title,
        descriptionI18n: title,
        slugI18n: text(`کودک-${title.fa}`, `cocuk-${key}`, `kids-${key}`),
        sortOrder: 5,
      },
    });
    for (const [section, title] of [
      ["tops", text("بالاتنه", "Üst giyim", "Tops")],
      ["bottoms", text("پایین‌تنه", "Alt giyim", "Bottoms")],
      ["one-pieces", text("لباس یک‌تکه", "Tek parça", "One-pieces")],
      ["outerwear", text("پالتو و لایه بیرونی", "Dış giyim", "Outerwear")],
      ["accessories", text("اکسسوری", "Aksesuar", "Accessories")],
    ] as const) {
      const id = `seed-category-${parentId}-${section}`;
      await db.category.upsert({
        where: { id },
        update: {},
        create: {
          id,
          parentId,
          gender: "KIDS",
          titleI18n: title,
          descriptionI18n: title,
          slugI18n: text(
            `${key}-${title.fa}`,
            `${key}-${section}`,
            `${key}-${section}`,
          ),
          sortOrder: 10,
        },
      });
    }
  }
  const category = await db.category.upsert({
    where: { id: "seed-category-fitting-coins" },
    update: {},
    create: {
      id: "seed-category-fitting-coins",
      parentId: "seed-category-accessories",
      gender: "UNISEX",
      titleI18n: text(
        "اعتبار اتاق پرو",
        "Kabin jetonları",
        "Fitting room coins",
      ),
      slugI18n: text("اعتبار-اتاق-پرو", "kabin-jetonlari", "fitting-coins"),
    },
  });
  const color = await db.color.upsert({
    where: { code: "SERVICE" },
    update: {},
    create: {
      id: "seed-color-service",
      code: "SERVICE",
      hex: "#b38a5c",
      nameI18n: text("اعتبار دیجیتال", "Dijital kredi", "Digital credit"),
    },
  });
  const size = await db.size.upsert({
    where: {
      scale_value_groupKey: {
        scale: "INTL",
        value: "DIGITAL",
        groupKey: "service",
      },
    },
    update: {},
    create: { scale: "INTL", value: "DIGITAL", groupKey: "service" },
  });
  const markets = await db.market.findMany({ select: { id: true } });
  for (const [amount, price] of [
    ["100", "5"],
    ["500", "20"],
    ["1000", "35"],
  ] as const) {
    const id = `seed-fitting-pack-${amount}`;
    const product = await db.product.upsert({
      where: { id },
      update: {},
      create: {
        id,
        categoryId: category.id,
        gender: "UNISEX",
        titleI18n: text(
          `بستهٔ ${amount} سکه`,
          ` ${amount} jeton paketi`,
          `${amount} coin pack`,
        ),
        slugI18n: text(`سکه-${amount}`, `jeton-${amount}`, `coins-${amount}`),
        descriptionI18n: text(
          "اعتبار دیجیتال اتاق پرو؛ قیمت نمونه و قابل ویرایش توسط مدیر.",
          "Kabin için dijital kredi; yönetici örnek fiyatı düzenleyebilir.",
          "Digital fitting-room service credit; illustrative price editable by admin.",
        ),
        status: "DRAFT",
        coinPackCoins: amount,
        basePriceAmount: price,
        basePriceCurrency: "USD",
        weightGrams: 1,
        marketIds: markets.map((m) => m.id),
        tags: ["seed", "demo", "fitting-service"],
        searchText: `coins jeton سکه ${amount}`,
      },
    });
    await db.variant.upsert({
      where: { sku: `FITTING-COINS-${amount}` },
      update: {},
      create: {
        id: `${id}-digital`,
        productId: product.id,
        colorId: color.id,
        sizeId: size.id,
        sku: `FITTING-COINS-${amount}`,
        weightGrams: 1,
      },
    });
  }
  const models = [
    [
      "woman",
      "WOMAN",
      "look-women-coat",
      text("مدل زن", "Kadın model", "Woman model"),
    ],
    ["man", "MAN", "look-men", text("مدل مرد", "Erkek model", "Man model")],
    ["girl", "GIRL", "look-girl", text("مدل دختر", "Kız model", "Girl model")],
    [
      "boy",
      "BOY",
      "look-kids",
      text("مدل پسر", "Erkek çocuk model", "Boy model"),
    ],
  ] as const;
  await db.integration.upsert({
    where: { key: "fitting-room" },
    update: {},
    create: {
      key: "fitting-room",
      provider: "openai",
      isActive: false,
      config: {
        enabled: false,
        coinSalesEnabled: false,
        costCoins: "12.5",
        welcomeCoins: "62.5",
        dailyFreeUses: 2,
        dailyLimit: 10,
        globalDailyLimit: 500,
        timezone: "Europe/Istanbul",
        provider: "openai",
        model: "gpt-image-1.5",
        quality: "medium",
        rewards: [],
        models: models.map(([id, kind, key, label]) => ({
          id,
          kind,
          mediaId: `seed-fashion-v2-${key}`,
          label,
          enabled: true,
        })),
      },
    },
  });
}
