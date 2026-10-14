import { test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { legacyHomepageBlocks } from "../../../prisma/demo-homepage";
import { styleLookBlock } from "../../../prisma/style-seed";
/** Explicit compatibility fixture, never app startup or an owner database. */
export function useLegacyHomepage() {
  let restore: (() => Promise<void>) | undefined;
  test.beforeEach(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw Error(
        "Legacy compatibility fixture requires an isolated _test database",
      );
    const db = new PrismaClient();
    const home = await db.homepage.findUniqueOrThrow({
      where: { id: "seed-homepage-global" },
    });
    restore = async () => {
      const { id, ...data } = home;
      await db.homepage.update({
        where: { id },
        data: {
          ...data,
          blocks: data.blocks as Prisma.InputJsonValue,
          draftBlocks:
            data.draftBlocks === null
              ? Prisma.DbNull
              : (data.draftBlocks as Prisma.InputJsonValue),
        },
      });
      await db.$disconnect();
    };
    const blocks = structuredClone(
      legacyHomepageBlocks,
    ) as Prisma.InputJsonObject[];
    blocks[0] = {
      ...blocks[0],
      mediaId: "seed-fashion-v2-look-women-coat",
      layout: "editorial",
      ctaUrl: "/search",
      title: {
        fa: "از یک انتخاب،\nبه یک استایل",
        tr: "Bir seçimden\nbir stile",
        en: "From a piece\nto a whole look",
      },
    };
    blocks.splice(1, 0, styleLookBlock);
    blocks[3] = { ...blocks[3], source: { mode: "latest", limit: 8 } };
    await db.homepage.update({
      where: { id: home.id },
      data: { blocks, isPublished: true, deletedAt: null },
    });
  });
  test.afterEach(async () => {
    await restore?.();
    restore = undefined;
  });
}
