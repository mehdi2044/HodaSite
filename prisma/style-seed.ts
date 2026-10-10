import type { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import sharp from "sharp";
import { legacyHomepageBlocks, spatialCampaignTitle } from "./demo-homepage";

const text = (fa: string, tr: string, en: string) => ({ fa, tr, en });
// Fictional, explicitly labelled demo merchandise. Existing merchant records are never rewritten.
export const styleProducts = [
  [
    "women-tee",
    "tops",
    "IVORY",
    "24",
    text("تی‌شرت نخی صبا", "Saba pamuklu tişört", "Saba cotton tee"),
  ],
  [
    "women-trousers",
    "bottoms",
    "SAND",
    "58",
    text("شلوار پیلی‌دار آوا", "Ava pileli pantolon", "Ava pleated trousers"),
  ],
  [
    "women-coat",
    "outerwear",
    "SAND",
    "112",
    text("بارانی رها", "Raha trençkot", "Raha trench coat"),
  ],
  [
    "women-knit",
    "tops",
    "IVORY",
    "64",
    text("بافت نارون", "Narvan triko", "Narvan knit"),
  ],
  [
    "women-dress",
    "one-pieces",
    "RUST",
    "78",
    text("پیراهن میدی مهتاب", "Mahtab midi elbise", "Mahtab midi dress"),
  ],
  [
    "men-shirt",
    "tops",
    "NAVY",
    "68",
    text("اورشرت سپهر", "Sepehr üst gömlek", "Sepehr overshirt"),
  ],
  [
    "men-tee",
    "tops",
    "IVORY",
    "26",
    text("تی‌شرت نخی سام", "Sam pamuklu tişört", "Sam cotton tee"),
  ],
  [
    "men-chino",
    "bottoms",
    "SAND",
    "54",
    text("شلوار چینو بردیا", "Bardia chino pantolon", "Bardia chinos"),
  ],
  [
    "men-knit",
    "tops",
    "CHARCOAL",
    "72",
    text("پلیور آراد", "Arad kazak", "Arad sweater"),
  ],
  [
    "men-hoodie",
    "tops",
    "FOREST",
    "62",
    text("هودی روزبه", "Roozbeh kapüşonlu", "Roozbeh hoodie"),
  ],
  [
    "kids-knit",
    "tops",
    "SAGE",
    "38",
    text("ژاکت بافت باران", "Baran triko hırka", "Baran knit cardigan"),
  ],
  [
    "kids-hoodie",
    "tops",
    "RUST",
    "32",
    text("هودی رایان", "Rayan kapüşonlu", "Rayan hoodie"),
  ],
  [
    "kids-trousers",
    "bottoms",
    "IVORY",
    "28",
    text("شلوار نرم آریو", "Ario rahat pantolon", "Ario soft joggers"),
  ],
  [
    "kids-dress",
    "one-pieces",
    "LILAC",
    "42",
    text("پیراهن نیلوفر", "Niloufar elbise", "Niloufar dress"),
  ],
  [
    "kids-set",
    "one-pieces",
    "SAGE",
    "48",
    text("ست راحتی نیلا", "Nila rahat takım", "Nila lounge set"),
  ],
  [
    "accessories-bag",
    "",
    "COGNAC",
    "86",
    text("کیف دستی هانا", "Hana tote çanta", "Hana tote"),
  ],
  [
    "accessories-scarf",
    "",
    "IVORY",
    "34",
    text("شال بافت سرو", "Sarv triko atkı", "Sarv knit scarf"),
  ],
  [
    "accessories-belt",
    "",
    "COGNAC",
    "30",
    text("کمربند آرو", "Aro kemer", "Aro belt"),
  ],
  [
    "accessories-cap",
    "",
    "NAVY",
    "22",
    text("کلاه کادن", "Kaden şapka", "Kaden cap"),
  ],
  [
    "accessories-socks",
    "",
    "MULTI",
    "16",
    text("جوراب رنگین", "Rangin çorap seti", "Rangin sock trio"),
  ],
] as const;

const productId = (key: string) => `seed-style-v2-${key}`;
const mediaId = (key: string) => `seed-fashion-v2-${key}`;
const colorId = (code: string) => `seed-color-${code.toLowerCase()}`;
export const styleLookBlock = {
  type: "ShopLook",
  title: text(
    "یک ست، به سلیقه تو",
    "Bir kombin, senin seçimin",
    "One look. Your choices.",
  ),
  body: text(
    "مدل را ببین، قطعات دلخواهت را انتخاب کن و سایز هر کدام را جدا مشخص کن. انتخاب‌هایت با هم به سبد می‌روند.",
    "Kombini keşfet, sevdiğin parçaları ve her birinin bedenini seç. Seçimlerini birlikte sepete ekle.",
    "Explore a prepared look, choose your pieces and pick each size. Add your selections to the bag together.",
  ),
  looks: [
    [
      "look-women-coat",
      "women",
      text("لایه‌های شهری", "Şehir katmanları", "City layers"),
      ["women-coat", "women-tee", "women-trousers", "accessories-bag"],
    ],
    [
      "look-women-knit",
      "women",
      text("آرام و روشن", "Sade ve aydınlık", "Soft neutrals"),
      ["women-knit", "women-trousers", "accessories-bag"],
    ],
    [
      "look-men",
      "men",
      text("روزهای بی‌تکلف", "Rahat günler", "Easy days"),
      ["men-shirt", "men-tee", "men-chino"],
    ],
    [
      "look-kids",
      "kids",
      text("برای روزهای بازی", "Oyun günleri", "Ready to play"),
      ["kids-knit", "kids-trousers"],
    ],
  ].map(([key, department, label, pieces]) => ({
    id: `seed-${key}`,
    label,
    categoryId: `seed-category-${department}`,
    mediaId: mediaId(key as string),
    items: (pieces as string[]).map((piece) => ({
      productId: productId(piece),
      colorId: colorId(
        styleProducts.find((product) => product[0] === piece)![2],
      ),
    })),
  })),
} as Prisma.InputJsonObject;

export async function seedStyleStorefront(
  db: PrismaClient,
  put: (key: string, bytes: Buffer) => Promise<string>,
) {
  const assets = [
    ...styleProducts.map((row) => ({ key: row[0], title: row[4] })),
    ...["look-women-coat", "look-women-knit", "look-men", "look-kids"].map(
      (key) => ({
        key,
        title: text(
          "مدل آماده فروشگاه",
          "Mağaza modeli",
          "Prepared shop model",
        ),
      }),
    ),
  ];
  for (const asset of assets) {
    if (await db.media.findUnique({ where: { id: mediaId(asset.key) } }))
      continue;
    const bytes = await readFile(
      path.join(process.cwd(), "prisma/demo-assets/v2", `${asset.key}.webp`),
    );
    const meta = await sharp(bytes).metadata();
    const prefix = `media/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}`;
    const variants: Record<
      string,
      { url: string; key: string; bytes: number }
    > = {};
    for (const width of [320, 640, 960]) {
      const data = await sharp(bytes)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const key = `media/variants/${mediaId(asset.key)}/${width}.webp`;
      variants[String(width)] = {
        url: await put(key, data),
        key,
        bytes: data.length,
      };
    }
    const key = `${prefix}.webp`,
      blur = await sharp(bytes).resize(16).webp({ quality: 40 }).toBuffer();
    await db.media.create({
      data: {
        id: mediaId(asset.key),
        kind: "image",
        storageKey: key,
        url: await put(key, bytes),
        originalName: `demo-fashion-v2-${asset.key}.webp`,
        width: meta.width,
        height: meta.height,
        bytes: bytes.length,
        mime: "image/webp",
        status: "READY",
        variants: { webp: variants },
        blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
        altI18n: text(
          `تصویر نمایشی هوش مصنوعی؛ ${asset.title.fa}`,
          `Yapay zekâ örnek görseli; ${asset.title.tr}`,
          `AI demo image; ${asset.title.en}`,
        ),
        tags: ["demo", "ai-generated"],
      },
    });
  }
  for (const [code, hex, names] of [
    ["IVORY", "#F1EBDC", text("شیری", "Ekru", "Ivory")],
    ["CHARCOAL", "#40413D", text("ذغالی", "Antrasit", "Charcoal")],
    ["FOREST", "#3E5240", text("سبز جنگلی", "Orman yeşili", "Forest")],
    ["SAGE", "#9BA78B", text("سبز مریم‌گلی", "Adaçayı", "Sage")],
    ["LILAC", "#B49BC2", text("یاسی", "Lila", "Lilac")],
    ["COGNAC", "#9D542E", text("عسلی", "Taba", "Cognac")],
    ["MULTI", "#A45135", text("چندرنگ", "Çok renkli", "Multicolor")],
  ] as const)
    await db.color.upsert({
      where: { code },
      update: {},
      create: { id: colorId(code), code, hex, nameI18n: names },
    });
  for (const department of ["women", "men", "kids"] as const) {
    const root = await db.category.findUniqueOrThrow({
      where: { id: `seed-category-${department}` },
    });
    for (const [slug, title] of [
      ["outerwear", text("لایه بیرونی", "Dış giyim", "Outerwear")],
      [
        "one-pieces",
        text("لباس یک‌تکه و ست", "Elbise ve takımlar", "One-pieces & sets"),
      ],
    ] as const)
      await db.category.upsert({
        where: { id: `seed-category-${root.id}-${slug}` },
        update: {},
        create: {
          id: `seed-category-${root.id}-${slug}`,
          parentId: root.id,
          gender: root.gender,
          titleI18n: title,
          descriptionI18n: title,
          slugI18n: text(
            `${title.fa}-${department}`,
            `${department}-${slug}`,
            `${department}-${slug}`,
          ),
          sortOrder: 20,
        },
      });
  }
  const markets = await db.market.findMany({ select: { id: true } });
  for (const [key, section, color, price, title] of styleProducts) {
    const department = key.split("-")[0];
    const root = `seed-category-${department}`;
    const sizes =
      department === "kids"
        ? ["4Y", "6Y", "8Y"]
        : department === "accessories"
          ? ["ONE SIZE"]
          : ["S", "M", "L"];
    const description = text(
      `نمونه نمایشی ${title.fa} برای تجربه چیدمان و خرید فروشگاه. محصول فرضی است؛ مشخصات و قیمت‌ها برای نمایش هستند.`,
      `${title.tr}: mağaza deneyimi için kurgusal örnek ürün. Özellikler ve fiyatlar gösterim amaçlıdır.`,
      `${title.en}: fictional demo merchandise for exploring the store. Specifications and prices are illustrative.`,
    );
    const product = await db.product.upsert({
      where: { id: productId(key) },
      update: {},
      create: {
        id: productId(key),
        categoryId: section ? `seed-category-${root}-${section}` : root,
        brandId: "seed-brand-atelier",
        gender:
          department === "women"
            ? "WOMEN"
            : department === "men"
              ? "MEN"
              : department === "kids"
                ? "KIDS"
                : "UNISEX",
        titleI18n: title,
        slugI18n: text(`نمونه-${key}`, `demo-${key}`, `demo-${key}`),
        descriptionI18n: description,
        tags: ["seed", "style-v2", "demo"],
        status: "ACTIVE",
        basePriceAmount: price,
        basePriceCurrency: "USD",
        marketIds: markets.map((market) => market.id),
        searchText: `${title.fa} ${title.tr} ${title.en} ${key} demo`,
      },
    });
    for (const [order, value] of sizes.entries()) {
      const groupKey =
        department === "kids"
          ? "kids-age"
          : department === "accessories"
            ? "accessories"
            : "apparel";
      const scale = department === "kids" ? "CA" : "INTL";
      const size = await db.size.upsert({
        where: { scale_value_groupKey: { scale, value, groupKey } },
        update: {},
        create: { scale, value, groupKey, sortOrder: order },
      });
      const sku = `STYLE-V2-${key.toUpperCase()}-${value.replace(/\s/g, "-")}`;
      await db.variant.upsert({
        where: { sku },
        update: {},
        create: {
          id: `${productId(key)}-${value.replace(/\s/g, "-").toLowerCase()}`,
          productId: product.id,
          colorId: colorId(color),
          sizeId: size.id,
          sku,
          isActive: true,
        },
      });
    }
    if (!(await db.productMedia.count({ where: { productId: product.id } })))
      await db.productMedia.create({
        data: { productId: product.id, mediaId: mediaId(key), sortOrder: 0 },
      });
  }
  await upgradeStyleComposition(db);
}

/** Compare-and-swap only the exact, untouched previous demo. No market overrides. */
export async function upgradeStyleComposition(db: PrismaClient) {
  const home = await db.homepage.findUnique({
    where: { id: "seed-homepage-global" },
  });
  if (!home || home.deletedAt || home.marketId !== null) return;
  const previous = legacyHomepageBlocks.map((block, index) =>
    index === 0
      ? {
          ...block,
          mediaId: "seed-fashion-v1-coat",
          ctaUrl: "/search",
          layout: "spatial",
          title: spatialCampaignTitle,
        }
      : block,
  );
  if (!isDeepStrictEqual(home.blocks, previous)) return;
  const blocks = structuredClone(
    legacyHomepageBlocks,
  ) as Prisma.InputJsonObject[];
  blocks[0] = {
    ...blocks[0],
    mediaId: mediaId("look-women-coat"),
    layout: "editorial",
    ctaUrl: "/search",
    title: text(
      "از یک انتخاب،\nبه یک استایل",
      "Bir seçimden\nbir stile",
      "From a piece\nto a whole look",
    ),
    body: text(
      "لایه‌های تازه و ترکیب‌هایی برای روزهای تو",
      "Günlerin için yeni katmanlar ve kombinler",
      "Fresh layers and combinations for your days",
    ),
  };
  blocks.splice(1, 0, styleLookBlock);
  blocks[3] = { ...blocks[3], source: { mode: "latest", limit: 8 } };
  await db.homepage.updateMany({
    where: { id: home.id, updatedAt: home.updatedAt },
    data: { blocks },
  });
}
