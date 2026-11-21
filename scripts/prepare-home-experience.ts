// Explicit, opt-in configuration of this task's new database only. No seed/deploy hook.
import { db } from "../src/lib/db";
import {
  saveHomepageDraft,
  publishHomepageRevision,
} from "../src/modules/content/publication";
import { homepageBlocksSchema } from "../src/modules/content/homepage";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (
    database !== "moda4_home_experience" ||
    process.argv[2] !== database ||
    process.argv[3] !== "slice1"
  )
    throw new Error("Exact new homepage database and explicit slice required");
  const owner = await db.user.findFirstOrThrow({
    where: { isActive: true, roles: { some: { role: { key: "owner" } } } },
    select: { id: true },
  });
  const home = await db.homepage.findFirstOrThrow({
    where: { marketId: null, deletedAt: null },
  });
  const blocks = homepageBlocksSchema.parse(home.blocks);
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
      configured: "slice1",
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
