import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
vi.mock("next/cache", () => ({
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
import { db } from "@/lib/db";
import { setMaintenanceFlag } from "@/modules/settings";
import {
  homepageBlocksSchema,
  type HomepageBlock,
} from "@/modules/content/homepage";
import { blockScenes, mapBlockScenes } from "@/modules/content/block-scenes";
import { sceneReferenceFingerprint } from "@/modules/content/scenes/references";
import {
  saveHomepageDraft,
  publishHomepageRevision,
} from "@/modules/content/publication";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "new market PHOTO proof inherits only the public global page",
  () => {
    let owner: string,
      market: string,
      global: Awaited<ReturnType<typeof db.homepage.findFirstOrThrow>>,
      previous: Awaited<ReturnType<typeof db.homepage.findFirst>>,
      blocks: HomepageBlock[];
    beforeAll(async () => {
      setMaintenanceFlag(false);
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      market = (await db.market.findUniqueOrThrow({ where: { code: "CA" } }))
        .id;
      global = await db.homepage.findFirstOrThrow({
        where: { marketId: null, deletedAt: null, isPublished: true },
      });
      blocks = homepageBlocksSchema.parse(global.blocks);
      expect(blockScenes(blocks).some((s) => s.mode === "PHOTO")).toBe(true);
      previous = await db.homepage.findUnique({ where: { marketId: market } });
      if (previous) await db.homepage.delete({ where: { id: previous.id } });
    });
    beforeEach(async () => {
      await db.homepage.deleteMany({ where: { marketId: market } });
    });
    afterEach(async () => {
      await db.homepage.deleteMany({ where: { marketId: market } });
      await db.homepage.update({
        where: { id: global.id },
        data: {
          blocks: global.blocks as Prisma.InputJsonValue,
          draftBlocks:
            global.draftBlocks === null
              ? Prisma.DbNull
              : (global.draftBlocks as Prisma.InputJsonValue),
          isPublished: global.isPublished,
          updatedAt: global.updatedAt,
        },
      });
    });
    afterAll(async () => {
      if (previous)
        await db.homepage.create({
          data: {
            ...previous,
            blocks: previous.blocks as Prisma.InputJsonValue,
            draftBlocks:
              previous.draftBlocks === null
                ? Prisma.DbNull
                : (previous.draftBlocks as Prisma.InputJsonValue),
          },
        });
    });
    const save = (value: HomepageBlock[]) =>
      saveHomepageDraft(owner, {
        marketId: market,
        expectedVersion: 0,
        blocks: value,
      });
    const publish = (s: Awaited<ReturnType<typeof save>>) =>
      publishHomepageRevision(owner, {
        homepageId: s.id,
        revisionId: s.revisionId,
        expectedVersion: s.version,
      });
    it("publishes an unchanged inherited PHOTO scene after an ordinary text edit without new confirmation", async () => {
      const edited = blocks.map((b) =>
        b.type === "NewIn"
          ? {
              ...b,
              title: {
                fa: "عنوان آزمون",
                tr: "Test",
                en: "Inherited text edit",
              },
            }
          : b,
      );
      const s = await save(edited);
      const draft = homepageBlocksSchema.parse(
        (await db.homepage.findUniqueOrThrow({ where: { id: s.id } }))
          .draftBlocks,
      );
      for (const scene of blockScenes(draft).filter((s) => s.mode === "PHOTO"))
        expect(scene.match?.fingerprint).toBe(
          await sceneReferenceFingerprint(scene, [market]),
        );
      await publish(s);
      const row = await db.homepage.findUniqueOrThrow({ where: { id: s.id } });
      expect(row.isPublished).toBe(true);
      expect(row.publishedRevisionId).toBe(s.revisionId);
      expect(JSON.stringify(row.blocks)).toContain("Inherited text edit");
    });
    it("ignores even a mathematically valid client proof for changed scene imagery", async () => {
      const first = blockScenes(blocks).find((s) => s.mode === "PHOTO")!;
      const other = await db.media.findFirstOrThrow({
        where: {
          kind: "image",
          status: "READY",
          deletedAt: null,
          id: { notIn: [first.desktop.mediaId, first.mobile.mediaId] },
        },
      });
      const changed = {
        ...first,
        desktop: { ...first.desktop, mediaId: other.id },
      };
      const forged = {
        ...changed,
        match: {
          fingerprint: await sceneReferenceFingerprint(changed, [market]),
          confirmedAt: new Date().toISOString(),
        },
      };
      const s = await save(
        mapBlockScenes(blocks, (scene) =>
          scene.id === first.id ? forged : scene,
        ),
      );
      const row = await db.homepage.findUniqueOrThrow({ where: { id: s.id } });
      expect(
        blockScenes(homepageBlocksSchema.parse(row.draftBlocks)).find(
          (scene) => scene.id === first.id,
        )?.match,
      ).toBeUndefined();
      await expect(publish(s)).rejects.toBeInstanceOf(z.ZodError);
      expect(
        (await db.homepage.findUniqueOrThrow({ where: { id: s.id } }))
          .isPublished,
      ).toBe(false);
    });
    it("does not inherit an unpublished global page's confirmation", async () => {
      await db.homepage.update({
        where: { id: global.id },
        data: { isPublished: false },
      });
      const s = await save(blocks);
      await expect(publish(s)).rejects.toBeInstanceOf(z.ZodError);
    });
    it("does not treat an unexposed global draft as a public confirmation", async () => {
      await db.homepage.update({
        where: { id: global.id },
        data: {
          blocks: [],
          draftBlocks: blocks as unknown as Prisma.InputJsonValue,
        },
      });
      const s = await save(blocks);
      await expect(publish(s)).rejects.toBeInstanceOf(z.ZodError);
    });
  },
);
