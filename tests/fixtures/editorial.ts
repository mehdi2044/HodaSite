import { Prisma, type PrismaClient } from "@prisma/client";
import { editorialContent } from "../../src/modules/editorial/contracts";

const samples = [
  [
    "WOMEN",
    "city-layers",
    "لایه‌های شهری",
    "Şehir katmanları",
    "City Layers",
    ["women-coat", "accessories-bag"],
    "look-women-coat",
  ],
  [
    "WOMEN",
    "soft-forms",
    "فرم‌های نرم",
    "Yumuşak formlar",
    "Soft Forms",
    ["women-knit", "women-trousers", "accessories-bag"],
    "look-women-knit",
  ],
  [
    "WOMEN",
    "evening-line",
    "خط شب",
    "Akşam çizgisi",
    "Evening Line",
    ["women-dress", "accessories-scarf"],
  ],
  [
    "MEN",
    "easy-days",
    "روزهای راحت",
    "Rahat günler",
    "Easy Days",
    ["men-shirt", "men-tee", "men-chino"],
    "look-men",
  ],
  [
    "MEN",
    "slow-morning",
    "صبح آرام",
    "Sakin sabah",
    "Slow Morning",
    ["men-knit", "men-chino"],
  ],
  [
    "MEN",
    "off-duty",
    "وقت آزاد",
    "Serbest zaman",
    "Off Duty",
    ["men-hoodie", "men-chino"],
  ],
  [
    "GIRLS",
    "little-worlds",
    "دنیاهای کوچک",
    "Küçük dünyalar",
    "Little Worlds",
    ["kids-dress"],
    "look-girl",
  ],
  [
    "GIRLS",
    "soft-weekend",
    "آخرهفتهٔ نرم",
    "Yumuşak hafta sonu",
    "Soft Weekend",
    ["kids-set"],
  ],
  [
    "GIRLS",
    "sunday-colour",
    "رنگ یکشنبه",
    "Pazar rengi",
    "Sunday Colour",
    ["kids-dress", "accessories-bag"],
  ],
  [
    "BOYS",
    "play-date",
    "قرار بازی",
    "Oyun günü",
    "Play Date",
    ["kids-knit", "kids-trousers"],
    "look-kids",
  ],
  [
    "BOYS",
    "ready-to-play",
    "آمادهٔ بازی",
    "Oyuna hazır",
    "Ready to Play",
    ["kids-hoodie", "kids-trousers"],
  ],
  [
    "BOYS",
    "after-school",
    "بعد از مدرسه",
    "Okul sonrası",
    "After School",
    ["kids-knit", "kids-trousers", "accessories-cap"],
  ],
] as const;

const slugTr = (text: string) =>
  text.normalize("NFC").toLowerCase().replaceAll(" ", "-");
const slugFa = (text: string) =>
  text.replace(/[\u200cٔ]/g, "").replaceAll(" ", "-");
const summary = {
  fa: "چند قطعه از کاتالوگ آزمایشی برای ساختن این استایل انتخاب شده‌اند. رنگ و سایز هر قطعه را جداگانه ببینید.",
  tr: "Bu kombin, deneme kataloğundan seçilen parçalarla hazırlandı. Her parçanın rengini ve bedenini ayrı ayrı keşfedin.",
  en: "Pieces from the demo catalogue make up this preview look. Explore the colours and sizes of each piece.",
};

export async function seedEditorialFixtures(db: PrismaClient) {
  const owner = await db.user.findFirstOrThrow({
    where: { isActive: true, roles: { some: { role: { key: "owner" } } } },
    select: { id: true },
  });
  const products = await db.product.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            samples.flatMap((sample) =>
              sample[5].map((key) => "seed-moda4-style-" + key),
            ),
          ),
        ],
      },
    },
    include: {
      variants: {
        where: { isActive: true, stockItems: { some: { onHand: { gt: 0 } } } },
        orderBy: { sku: "asc" },
      },
      media: {
        where: { media: { status: "READY", deletedAt: null } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const images = await db.media.findMany({
    where: {
      id: {
        in: samples.flatMap((sample) => {
          const photo = sample[6];
          return photo
            ? ["seed-moda4-wide-" + photo, "seed-fashion-v2-" + photo]
            : [];
        }),
      },
      status: "READY",
      deletedAt: null,
    },
    select: { id: true },
  });
  const visibleFrom = new Date("2020-01-01T00:00:00Z");
  await db.$transaction(
    async (tx) => {
      for (const [audience, slug, fa, tr, en, keys, photo] of samples) {
        const selected = keys.map((key) =>
          products.find((product) => product.id === "seed-moda4-style-" + key),
        );
        if (selected.some((product) => !product?.variants.length))
          throw new Error("Missing seed catalog for " + slug);
        const mediaId =
          images.find((image) => image.id === "seed-moda4-wide-" + photo)?.id ??
          selected[0]?.media[0]?.mediaId;
        const mobileMediaId = images.find(
          (image) => image.id === "seed-fashion-v2-" + photo,
        )?.id;
        const body = editorialContent.parse({
          kind: "LOOK",
          audience,
          title: { fa, tr, en },
          summary,
          mediaId,
          mobileMediaId,
          marketIds: [],
          featured: slug === "easy-days",
          tags: ["preview"],
          season: "SPRING",
          occasion: "EVERYDAY",
          style: "CASUAL",
          color: "NEUTRAL",
          items: selected.map((product, index) => ({
            productId: product!.id,
            variantId: product!.variants[0].id,
            ...(slug === "easy-days"
              ? {
                  desktop: { x: 0.45 + index * 0.1, y: 0.4 + index * 0.14 },
                  mobile: { x: 0.35 + index * 0.15, y: 0.33 + index * 0.14 },
                }
              : {}),
          })),
        });
        const id = "fixture-editorial-" + slug;
        await tx.editorialEntry.upsert({
          where: { id },
          update: {},
          create: {
            id,
            kind: "LOOK",
            slugFa: slugFa(fa),
            slugTr: slugTr(tr),
            slugEn: slug,
            revisions: {
              create: {
                number: 1,
                body: body as Prisma.InputJsonObject,
                authorId: owner.id,
                approvedBy: owner.id,
                visibleFrom,
                items: {
                  create: (body.kind === "LOOK" ? body.items : []).map(
                    ({ productId }, position) => ({ productId, position }),
                  ),
                },
              },
            },
          },
        });
      }
      const id = "fixture-editorial-easy-days-story";
      const body = editorialContent.parse({
        kind: "ARTICLE",
        audience: "MEN",
        category: "STYLING",
        author: "MODA4",
        title: {
          fa: "چطور استایل روزمره بسازیم؟",
          tr: "Günlük bir kombin nasıl kurulur?",
          en: "How to build an everyday look",
        },
        summary,
        mediaId:
          images.find((image) => image.id === "seed-moda4-wide-look-men")?.id ??
          products.find((product) => product.id.endsWith("men-shirt"))?.media[0]
            ?.mediaId,
        marketIds: [],
        featured: true,
        tags: ["preview"],
        blocks: [
          {
            type: "HEADING",
            text: {
              fa: "با سه لایهٔ ساده",
              tr: "Üç sade katmanla",
              en: "Start with three simple pieces",
            },
          },
          {
            type: "PARAGRAPH",
            text: {
              fa: "تی‌شرت نخی و شلوار چینو پایهٔ این استایل‌اند. روی آن‌ها یک پیراهن سبک بپوشید.",
              tr: "Pamuklu tişört ve chino pantolon bu kombinin temelini oluşturur. Üzerine hafif bir gömlek ekleyin.",
              en: "A cotton tee and chinos form the base. Add a light overshirt for an easy layer.",
            },
          },
          { type: "LOOK", id: "fixture-editorial-easy-days" },
        ],
      });
      await tx.editorialEntry.upsert({
        where: { id },
        update: {},
        create: {
          id,
          kind: "ARTICLE",
          slugFa: "استایل-روزمره",
          slugTr: "gunluk-kombin",
          slugEn: "everyday-look",
          revisions: {
            create: {
              number: 1,
              body: body as Prisma.InputJsonObject,
              authorId: owner.id,
              approvedBy: owner.id,
              visibleFrom,
            },
          },
        },
      });
      const now = new Date();
      if (!(await tx.weeklyLookFeature.count({ where: { slot: "MAIN" } }))) {
        await tx.weeklyLookFeature.create({
          data: {
            id: "fixture-editorial-weekly",
            entryId: "fixture-editorial-easy-days",
            slot: "MAIN",
            startsAt: new Date(now.getTime() - 86400000),
            endsAt: new Date(now.getTime() + 6 * 86400000),
            authorId: owner.id,
          },
        });
      }
    },
    { timeout: 30_000 },
  );
}
