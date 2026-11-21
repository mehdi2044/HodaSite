// Explicit, opt-in configuration of this task's new database only. No seed/deploy hook.
import { db } from "../src/lib/db";
import {
  saveHomepageDraft,
  publishHomepageRevision,
} from "../src/modules/content/publication";
import {
  saveEditorialDraft,
  publishEditorial,
} from "../src/modules/editorial/publication";
import { editorialContent } from "../src/modules/editorial/contracts";
import { matchingFittingPhoto } from "../src/modules/content/scenes/contracts";
import { sceneReferenceSnapshot } from "../src/modules/content/scenes/references";
import { homepageBlocksSchema } from "../src/modules/content/homepage";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (
    database !== "moda4_home_experience" ||
    process.argv[2] !== database ||
    !["slice1", "slice2", "slice3", "slice4"].includes(process.argv[3])
  )
    throw new Error("Exact new homepage database and explicit slice required");
  const owner = await db.user.findFirstOrThrow({
    where: { isActive: true, roles: { some: { role: { key: "owner" } } } },
    select: { id: true },
  });
  const home = await db.homepage.findFirstOrThrow({
    where: { marketId: null, deletedAt: null },
  });
  let blocks = homepageBlocksSchema.parse(home.blocks);
  if (process.argv[3] === "slice1") {
    const titles = [
      { fa: "زنانه", tr: "Kadın", en: "Women" },
      { fa: "مردانه", tr: "Erkek", en: "Men" },
      { fa: "بچگانه", tr: "Çocuk", en: "Kids" },
      { fa: "اکسسوری", tr: "Aksesuar", en: "Accessories" },
    ];
    const descriptions = [
      {
        fa: "ترکیب‌هایی برای هر روز، هر فصل و هر سلیقه.",
        tr: "Her güne, her mevsime ve her tarza eşlik eden parçalar.",
        en: "Thoughtful pieces for every day, every season, every mood.",
      },
      {
        fa: "خطوط ساده و انتخاب‌هایی که با روز تو همراه می‌شوند.",
        tr: "Gününe uyum sağlayan yalın çizgiler ve rahat seçimler.",
        en: "Clean lines and easy pieces that move with your day.",
      },
      {
        fa: "برای پسرها و دخترها؛ سبک، رنگی و آمادهٔ بازی.",
        tr: "Kızlar ve oğlanlar için hafif, renkli ve oyuna hazır.",
        en: "For girls and boys: light, colourful and ready to play.",
      },
      {
        fa: "جزئیات کوچک، تفاوت‌های بزرگ در استایل تو.",
        tr: "Stilinde fark yaratan küçük detaylar.",
        en: "The finishing details that make a look your own.",
      },
    ];
    for (const block of blocks)
      if (block.type === "Bands") block.speed = { first: 7.9, second: 5.6 };
    for (const block of blocks)
      if (block.type === "WorldsPrism") {
        block.faces = block.faces.map((face, index) => ({
          ...face,
          title: titles[index],
          subtitle: {
            fa: titles[index].en,
            tr: titles[index].en,
            en: titles[index].en,
          },
          description: descriptions[index],
        }));
      }
  }
  if (process.argv[3] === "slice2") {
    // Reuse the approved girl photograph and exactly its photographed products.
    // This is an isolated CMS content revision, not a new image/price/product.
    const fitting = blocks.find((block) => block.type === "FittingAd");
    const girl =
      fitting?.type === "FittingAd"
        ? fitting.looks.find((look) => look.scene.modelId === "girl")
        : undefined;
    const photo = girl?.finalPhoto;
    if (!girl || !photo || !matchingFittingPhoto(girl.scene, photo))
      throw new Error("Approved girl photo identity missing");
    const markets = await db.market.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const market of markets) {
      const snapshot = await sceneReferenceSnapshot(photo, [market.id]);
      if (snapshot.fingerprint !== photo.match?.fingerprint)
        throw new Error("Approved girl photo fingerprint mismatch");
    }
    const entry = await db.editorialEntry.findUniqueOrThrow({
      where: { id: "fixture-editorial-little-worlds" },
      include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
    });
    const old = editorialContent.parse(entry.revisions[0]?.body);
    if (old.kind !== "LOOK" || old.audience !== "GIRLS")
      throw new Error("Unexpected girl content identity");
    const selected = await Promise.all(
      girl.scene.pieces.map(async (piece) => {
        const variant = await db.variant.findFirstOrThrow({
          where: {
            productId: piece.productId,
            colorId: piece.colorId,
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
          orderBy: { id: "asc" },
          select: { id: true, colorId: true },
        });
        return {
          productId: piece.productId,
          variantId: variant.id,
          colorId: variant.colorId,
        };
      }),
    );
    const body = editorialContent.parse({
      ...old,
      mediaId: photo.desktop.mediaId,
      mobileMediaId: photo.mobile.mediaId,
      items: selected.map(({ productId, variantId }) => ({
        productId,
        variantId,
      })),
      visual: {
        mode: "PHOTO",
        mediaId: photo.desktop.mediaId,
        mobileMediaId: photo.mobile.mediaId,
        pieces: selected.map(({ variantId, colorId }) => ({
          variantId,
          colorId,
        })),
      },
    });
    if (JSON.stringify(old) !== JSON.stringify(body)) {
      if (entry.version !== 1)
        throw new Error(
          "Refuse to replace an unexpected later editorial revision",
        );
      const saved = await saveEditorialDraft(owner.id, {
        id: entry.id,
        version: entry.version,
        body,
      });
      const revision = await db.editorialRevision.findFirstOrThrow({
        where: { entryId: saved.id, number: saved.version },
      });
      await publishEditorial(owner.id, {
        id: saved.id,
        version: saved.version,
        revisionId: revision.id,
      });
      console.log(
        JSON.stringify({
          isolatedGirlRevision: true,
          reusedApprovedMediaId: photo.desktop.mediaId,
          fingerprintVerified: true,
          productsCreated: 0,
        }),
      );
    }

    for (const block of blocks)
      if (block.type === "ShopLook") {
        block.curatedLookIds = [
          "soft-forms",
          "easy-days",
          "sunday-colour",
          "play-date",
        ].map((slug) => `fixture-editorial-${slug}`);
        block.title = {
          fa: "خرید ست کامل",
          tr: "Kombini satın al",
          en: "Shop the Look",
        };
        block.body = {
          fa: "استایل را انتخاب کن؛ قطعات و سایزهای دلخواهت را با قیمت روز به سبد ببر.",
          tr: "Stilini seç; parçaları ve bedenleri güncel fiyatlarıyla sepetine ekle.",
          en: "Choose a look. Find your size, explore each piece and make it yours.",
        };
      }
  }
  if (process.argv[3] === "slice3") {
    for (const block of blocks)
      if (block.type === "Lookbook")
        block.curatedLookIds = [
          "evening-line",
          "slow-morning",
          "off-duty",
          "ready-to-play",
          "after-school",
        ].map((slug) => `fixture-editorial-${slug}`);
  }
  if (process.argv[3] === "slice4") {
    if (!blocks.some((block) => block.type === "EditorialSpotlight"))
      blocks.push({
        id: "home-editorial-spotlight",
        type: "EditorialSpotlight",
        version: 1,
        enabled: true,
        title: {
          fa: "این هفته در MODA4",
          tr: "MODA4’te bu hafta",
          en: "This week at MODA4",
        },
      });
    const order = [
      "HeroSlider",
      "Bands",
      "WorldsPrism",
      "EditorialSpotlight",
      "ShopLook",
      "NewIn",
      "FittingAd",
      "Lookbook",
      "KidsWorld",
      "Services",
    ];
    blocks = blocks
      .map((block, index) => ({ block, index }))
      .sort((a, b) => {
        const rank = (type: string) => {
          const index = order.indexOf(type);
          return index < 0 ? order.length : index;
        };
        return rank(a.block.type) - rank(b.block.type) || a.index - b.index;
      })
      .map(({ block }) => block);
  }
  const saved = await saveHomepageDraft(owner.id, {
    marketId: null,
    expectedVersion: home.version,
    blocks,
  });
  await publishHomepageRevision(owner.id, {
    homepageId: saved.id,
    revisionId: saved.revisionId,
    expectedVersion: saved.version,
  });
  console.log(
    JSON.stringify({
      configured: process.argv[3],
      authorizedWriter: true,
      existingReferencesPreserved: true,
    }),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Homepage preparation failed",
    );
    process.exitCode = 1;
  });
