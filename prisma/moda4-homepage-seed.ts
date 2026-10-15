import type { Prisma, PrismaClient, Media } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
const text = (fa: string, tr: string, en: string) => ({ fa, tr, en });
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Mirrors the public cutout identity contract; integration tests resolve these real rows.
const imageIdentity = (image: Media) =>
  hash({
    id: image.id,
    storageKey: image.storageKey,
    width: image.width,
    height: image.height,
    mime: image.mime,
    variants: image.variants,
  });
const modelKeys = {
  woman: ["WOMAN", "look-women-coat"],
  man: ["MAN", "look-men"],
  girl: ["GIRL", "look-girl"],
  boy: ["BOY", "look-kids"],
} as const;
const geometry: Record<string, [number, number, number, number]> = {
  "women-knit": [0.18, 0.43, 0.5, 2],
  "women-tee": [0.18, 0.39, 0.5, 2],
  "women-trousers": [0.45, 0.255, 0.5, 1],
  "women-coat": [0.16, 0.414, 0.5, 3],
  "women-dress": [0.17, 0.423, 0.5, 2],
  "men-shirt": [0.17, 0.459, 0.5, 2],
  "men-tee": [0.18, 0.4, 0.5, 2],
  "men-knit": [0.17, 0.45, 0.5, 2],
  "men-hoodie": [0.13, 0.45, 0.5, 2],
  "men-chino": [0.45, 0.241, 0.5, 1],
  "kids-knit": [0.18, 0.455, 0.5, 2],
  "kids-hoodie": [0.14, 0.464, 0.5, 2],
  "kids-trousers": [0.45, 0.318, 0.5, 1],
  "kids-dress": [0.17, 0.527, 0.5, 2],
  "kids-set": [0.16, 0.527, 0.5, 2],
  "accessories-bag": [0.37, 0.195, 0.68, 5],
  "accessories-scarf": [0.17, 0.255, 0.5, 4],
  "accessories-cap": [0.04, 0.182, 0.51, 5],
};
/** Fresh bootstrap only, never an upgrade of an existing merchant/draft/theme.
 * Approved supplied raster cutouts, actual decoded alpha and current model fingerprints;
 * approximate styling geometry stays editable and is not a photorealistic/AI promise.
 * This module remains runnable in the minimal ops image without importing src/.
 */
export async function seedFreshModa4Homepage(
  db: PrismaClient,
  put: (key: string, bytes: Buffer) => Promise<string>,
  fresh: boolean,
) {
  if (!fresh) return;
  const home = await db.homepage.findUniqueOrThrow({
    where: { id: "seed-homepage-global" },
  });
  if (home.marketId || home.deletedAt || home.draftBlocks || home.version !== 0)
    return;
  const modelImages = await Promise.all(
    Object.entries(modelKeys).map(async ([id, [kind, key]]) => {
      const image = await db.media.findUniqueOrThrow({
        where: { id: `seed-fashion-v2-${key}` },
      });
      return {
        id,
        kind,
        image,
        fingerprint: hash({ id, kind, media: imageIdentity(image) }),
      };
    }),
  );
  const products = await db.product.findMany({
    where: {
      id: { in: Object.keys(geometry).map((key) => `seed-style-v2-${key}`) },
    },
    include: { variants: { include: { media: true } }, media: true },
  });
  const profiles = new Map<
    string,
    { mediaId: string; productId: string; colorId: string }
  >();
  for (const [key, [top, width, x, zIndex]] of Object.entries(geometry)) {
    const product = products.find(
      (product) => product.id === `seed-style-v2-${key}`,
    );
    if (!product?.variants.length || !product.fittingSlot) continue;
    // Dedicated v3 demo identities keep old fixture/merchant products and profiles untouched.
    const productId = `seed-moda4-style-${key}`;
    const slug = product.slugI18n as Record<string, string>;
    await db.product.create({
      data: {
        id: productId,
        categoryId: product.categoryId,
        brandId: product.brandId,
        fittingSlot: product.fittingSlot,
        gender: product.gender,
        titleI18n: product.titleI18n as Prisma.InputJsonValue,
        descriptionI18n: product.descriptionI18n as Prisma.InputJsonValue,
        slugI18n: Object.fromEntries(
          Object.entries(slug).map(([locale, value]) => [
            locale,
            `${value}-moda4`,
          ]),
        ),
        status: "ACTIVE",
        basePriceAmount: product.basePriceAmount,
        basePriceCurrency: product.basePriceCurrency,
        marketIds: product.marketIds,
        searchText: product.searchText,
        tags: ["seed", "demo", "moda4-v3"],
        media: {
          create: product.media.map((link) => ({
            mediaId: link.mediaId,
            sortOrder: link.sortOrder,
          })),
        },
        variants: {
          create: product.variants.map((variant) => ({
            id: `seed-moda4-${variant.id}`,
            sku: `MODA4-${variant.sku}`,
            colorId: variant.colorId,
            sizeId: variant.sizeId,
            isActive: variant.isActive,
            priceOverrideUsd: variant.priceOverrideUsd,
            media: {
              create: variant.media.map((link) => ({
                mediaId: link.mediaId,
                sortOrder: link.sortOrder,
              })),
            },
          })),
        },
      },
    });
    const variant =
      product.variants.find((variant) => variant.id === `${product.id}-m`) ??
      product.variants[0];
    const bytes = await readFile(
      path.join(process.cwd(), "prisma/demo-assets/v3/cutouts", `${key}.webp`),
    );
    const image = sharp(bytes);
    const metadata = await image.metadata();
    const alpha = (await image.stats()).channels.at(-1);
    if (
      !metadata.hasAlpha ||
      !metadata.width ||
      !metadata.height ||
      !alpha ||
      alpha.min === 255 ||
      alpha.max === 0
    )
      throw Error("Invalid curated demo cutout");
    const storageKey = `media/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}.webp`;
    const media = await db.media.create({
      data: {
        id: `seed-moda4-cutout-${key}`,
        kind: "image",
        storageKey,
        url: await put(storageKey, bytes),
        originalName: `demo-moda4-cutout-${key}.webp`,
        mime: "image/webp",
        bytes: bytes.length,
        width: metadata.width,
        height: metadata.height,
        variants: {},
        status: "READY",
        tags: ["demo", "ai-generated", "curated-cutout"],
        altI18n: product.titleI18n as Prisma.InputJsonValue,
      },
    });
    const choices = modelImages.filter(
      (model) =>
        key.startsWith("accessories-") ||
        (key.startsWith("women-")
          ? model.kind === "WOMAN"
          : key.startsWith("men-")
            ? model.kind === "MAN"
            : ["GIRL", "BOY"].includes(model.kind)),
    );
    await db.catalogCutout.create({
      data: {
        id: `seed-moda4-profile-${key}`,
        productId,
        colorId: variant.colorId,
        mediaId: media.id,
        slot: product.fittingSlot,
        anchor:
          product.fittingSlot === "ACCESSORY"
            ? key.endsWith("bag")
              ? "HAND"
              : key.endsWith("cap")
                ? "HEAD"
                : "NECK"
            : null,
        geometry: {
          version: 1,
          models: choices.map((model) => {
            const w = width * (["GIRL", "BOY"].includes(model.kind) ? 0.82 : 1);
            const height =
              (((w * metadata.height!) / metadata.width!) *
                model.image.width!) /
              model.image.height!;
            return {
              modelId: model.id,
              x,
              y: Math.min(0.95, top + height / 2),
              width: w,
              height,
              scale: 1,
              rotation: 0,
              zIndex,
            };
          }),
        },
        validation: {
          version: 1,
          imageFingerprint: imageIdentity(media),
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          confirmedAt: new Date().toISOString(),
          models: choices.map((model) => ({
            modelId: model.id,
            mediaId: model.image.id,
            fingerprint: model.fingerprint,
          })),
        },
      },
    });
    profiles.set(key, {
      mediaId: media.id,
      productId,
      colorId: variant.colorId,
    });
  }
  const frame = (mediaId: string) => ({
    mediaId,
    fit: "contain",
    aspect: "3:4",
    focal: { x: 0.5, y: 0.5 },
  });
  const scene = (
    id: string,
    modelId: keyof typeof modelKeys,
    keys: string[],
    title: ReturnType<typeof text>,
  ) => ({
    id,
    version: 1,
    mode: "COMPOSITE",
    modelId,
    title,
    alt: title,
    desktop: frame(`seed-fashion-v2-${modelKeys[modelId][1]}`),
    mobile: frame(`seed-fashion-v2-${modelKeys[modelId][1]}`),
    pieces: keys
      .map((key, index) => ({
        id: `${id}-piece-${index}`,
        ...profiles.get(key)!,
        referenceMediaId: profiles.get(key)!.mediaId,
        desktop: { x: index % 2 ? 0.78 : 0.22, y: 0.3 + index * 0.14 },
        mobile: { x: index % 2 ? 0.78 : 0.22, y: 0.3 + index * 0.14 },
        side: index % 2 ? "end" : "start",
      }))
      .map(({ mediaId: _mediaId, ...piece }) => {
        void _mediaId;
        return piece;
      }),
  });
  const outfits = [
    [
      "woman",
      ["women-tee", "women-trousers", "women-coat", "accessories-bag"],
      text("لایه‌های شهری", "Şehir katmanları", "City layers"),
    ],
    [
      "man",
      ["men-shirt", "men-chino", "accessories-scarf", "accessories-cap"],
      text("روزهای بی‌تکلف", "Rahat günler", "Easy days"),
    ],
    [
      "boy",
      ["kids-knit", "kids-trousers", "accessories-cap"],
      text("برای روزهای بازی", "Oyun günleri", "Ready to play"),
    ],
    [
      "girl",
      ["kids-dress", "accessories-cap"],
      text("کوچولوهای کنجکاو", "Küçük kaşifler", "Little wanderers"),
    ],
  ] as const;
  const makeScene = (id: string, n: number) => {
    const [model, keys, title] = outfits[n % outfits.length];
    return scene(id, model, [...keys], title);
  };
  const common = (id: string, type: string) => ({
    id,
    type,
    version: 1,
    enabled: true,
  });
  const explore = text("مشاهده", "Keşfet", "Explore");
  const catalog = { kind: "catalog" };
  const blocks = [
    {
      ...common("seed-moda4-hero", "HeroSlider"),
      autoplaySeconds: 7,
      slides: outfits.slice(0, 2).map((_, n) => ({
        id: `seed-moda4-slide-${n}`,
        scene: makeScene(`seed-moda4-hero-scene-${n}`, n),
        eyebrow: text(
          "چهار دنیای استایل",
          "Stilin dört dünyası",
          "Four worlds of style",
        ),
        body: text(
          "ترکیب نمایشی قابل تغییر؛ هر قطعه با قیمت واقعی",
          "Düzenlenebilir örnek kombin; gerçek ürün fiyatları",
          "Editable demo styling, with actual product prices",
        ),
        textSide: n ? "end" : "start",
        ctaLabel: explore,
        target: catalog,
      })),
    },
    {
      ...common("seed-moda4-bands", "Bands"),
      first: [
        text("استایل خودت", "Kendi tarzın", "Your own style"),
        text("چهار دنیا", "Dört dünya", "Four worlds"),
      ],
      second: [
        text(
          "زنان · مردان · کودکان · اکسسوری",
          "Kadın · Erkek · Çocuk · Aksesuar",
          "Women · Men · Kids · Accessories",
        ),
      ],
      durationSeconds: 30,
    },
    {
      ...common("seed-moda4-worlds", "WorldsPrism"),
      title: text(
        "چهار دنیا، یک نگاه",
        "Dört dünya, tek bakış",
        "Four worlds, one view",
      ),
      autoplaySeconds: 3.8,
      faces: ["women", "men", "kids", "accessories"].map((key, n) => {
        const offer = makeScene(`seed-moda4-world-scene-${n}`, n === 3 ? 0 : n);
        return {
          id: `seed-moda4-face-${n}`,
          categoryId: `seed-category-${key}`,
          title: text(
            ...({
              women: ["زنان", "Kadın", "Women"],
              men: ["مردان", "Erkek", "Men"],
              kids: ["کودکان", "Çocuk", "Kids"],
              accessories: ["اکسسوری", "Aksesuar", "Accessories"],
            }[key] as [string, string, string]),
          ),
          subtitle: text("انتخاب‌های تازه", "Yeni seçimler", "Fresh choices"),
          desktop: offer.desktop,
          mobile: offer.mobile,
          scene: offer,
        };
      }),
    },
    {
      ...common("seed-moda4-new", "NewIn"),
      title: text("تازه‌ها", "Yeni gelenler", "New arrivals"),
      source: {
        mode: "manual",
        productIds: [
          "women-coat",
          "men-shirt",
          "women-knit",
          "kids-hoodie",
          "accessories-bag",
          "women-dress",
        ].map((key) => `seed-moda4-style-${key}`),
        limit: 6,
      },
      ctaLabel: explore,
      target: catalog,
    },
    {
      ...common("seed-moda4-fitting", "FittingAd"),
      title: text("ترکیب خودت را ببین", "Kombinini gör", "See your styling"),
      body: text(
        "نمایش لایه‌ای، بدون درخواست هوش مصنوعی",
        "Katmanlı görünüm; yapay zekâ isteği yok",
        "Layered styling, with no AI request",
      ),
      looks: outfits.slice(0, 2).map((row, n) => ({
        id: `seed-moda4-fitting-look-${n}`,
        label: row[2],
        scene: makeScene(`seed-moda4-fitting-scene-${n}`, n),
      })),
      ctaLabel: explore,
      target: catalog,
    },
    {
      ...common("seed-moda4-look", "ShopLook"),
      title: text("این استایل را بخر", "Bu kombini al", "Shop the look"),
      body: text(
        "سایز واقعی هر قطعه را انتخاب کن",
        "Her parçanın bedenini seç",
        "Choose each actual size",
      ),
      looks: [],
      scene: makeScene("seed-moda4-shop-scene", 0),
    },
    {
      ...common("seed-moda4-lookbook", "Lookbook"),
      title: text("دفتر استایل", "Stil defteri", "Lookbook"),
      autoplaySeconds: 4.8,
      scenes: Array.from({ length: 6 }, (_, n) =>
        makeScene(`seed-moda4-lookbook-scene-${n}`, n),
      ),
    },
    {
      ...common("seed-moda4-kids", "KidsWorld"),
      title: text(
        "دنیای رنگی کودکان",
        "Çocukların renkli dünyası",
        "A colourful kids world",
      ),
      body: text("برای روزهای بازی", "Oyun günleri için", "For days of play"),
      tone: "kidsMint",
      source: {
        mode: "manual",
        productIds: [
          "kids-knit",
          "kids-hoodie",
          "kids-trousers",
          "kids-dress",
          "kids-set",
        ].map((key) => `seed-moda4-style-${key}`),
        limit: 5,
      },
      ctaLabel: explore,
      target: { kind: "category", id: "seed-category-kids" },
    },
    {
      ...common("seed-moda4-services", "Services"),
      title: text(
        "خرید روشن و ساده",
        "Açık ve kolay alışveriş",
        "Clear, simple shopping",
      ),
      keys: ["shipping", "returns", "prices", "support"],
    },
  ];
  await db.homepage.update({
    where: { id: home.id },
    data: { blocks: blocks as unknown as Prisma.InputJsonValue },
  });
  const fitting = await db.integration.findUniqueOrThrow({
    where: { key: "fitting-room" },
  });
  await db.integration.update({
    where: { id: fitting.id },
    data: {
      config: {
        ...(fitting.config as Prisma.JsonObject),
        instantEnabled: true,
      },
    },
  });
}
