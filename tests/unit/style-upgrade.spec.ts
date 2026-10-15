import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { styleProducts } from "../../prisma/style-products";
import {
  upgradeStyleComposition,
  previousStyleComposition,
} from "../../prisma/style-seed";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import {
  legacyHomepageBlocks,
  spatialCampaignTitle,
} from "../../prisma/demo-homepage";

const original = () =>
  legacyHomepageBlocks.map((block, index) =>
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
function fixture(blocks: unknown, extras = {}) {
  const home = {
    id: "seed-homepage-global",
    marketId: null,
    deletedAt: null,
    updatedAt: new Date(0),
    blocks,
    ...extras,
  };
  const updateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>(
    async () => ({ count: 1 }),
  );
  const products = styleProducts.map(([key]) => ({
    id: `seed-style-v2-${key}`,
    categoryId: `seed-category-${key.split("-")[0]}`,
    marketIds: ["ir", "tr", "ca"],
    status: "ACTIVE",
    deletedAt: null as Date | null,
    coinPackCoins: null as Prisma.Decimal | null,
    media: [
      {
        media: {
          kind: "image",
          status: "READY",
          deletedAt: null as Date | null,
        },
      },
    ],
  }));
  const categories = ["women", "men", "kids", "accessories"].map((key) => ({
    id: `seed-category-${key}`,
    parentId: null as string | null,
    deletedAt: null,
    media: { kind: "image", status: "READY", deletedAt: null } as {
      kind: string;
      status: string;
      deletedAt: Date | null;
    } | null,
  }));
  const tx = {
    homepage: { findUnique: async () => home, updateMany },
    product: { findMany: async () => products },
    category: { findMany: async () => categories },
    market: { findMany: async () => ["ir", "tr", "ca"].map((id) => ({ id })) },
  };
  const transaction = vi.fn(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  return {
    db: {
      $transaction: transaction,
    } as unknown as PrismaClient,
    updateMany,
    products,
    categories,
    transaction,
  };
}
describe("prepared demo composition upgrade", () => {
  it.each(["missing", "deleted", "processing", "failed", "video"])(
    "preserves the homepage when a department cover is %s",
    async (change) => {
      const f = fixture(previousStyleComposition());
      const root = f.categories[0];
      if (change === "deleted") root.media!.deletedAt = new Date();
      if (change === "processing") root.media!.status = "PROCESSING";
      if (change === "failed") root.media!.status = "FAILED";
      if (change === "video") root.media!.kind = "video";
      if (change === "missing") root.media = null;
      expect(await upgradeStyleComposition(f.db)).toBe("incomplete");
      expect(f.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    "category",
    "status",
    "deletion",
    "market",
    "root",
    "missing-image",
    "trashed-image",
    "processing-image",
    "failed-image",
    "video",
    "coin-pack",
  ])(
    "preserves the homepage on seed/reseed after a merchant changes %s",
    async (change) => {
      const f = fixture(previousStyleComposition());
      if (change === "category") f.products[0].categoryId = "seed-category-men";
      if (change === "status") f.products[0].status = "DRAFT";
      if (change === "deletion") f.products[0].deletedAt = new Date();
      if (change === "market") f.products[0].marketIds = ["ir", "ca"];
      if (change === "root") f.categories[0].parentId = "seed-category-men";
      if (change === "missing-image") f.products[0].media = [];
      if (change === "trashed-image")
        f.products[0].media[0].media.deletedAt = new Date();
      if (change === "processing-image")
        f.products[0].media[0].media.status = "PROCESSING";
      if (change === "failed-image")
        f.products[0].media[0].media.status = "FAILED";
      if (change === "video") f.products[0].media[0].media.kind = "video";
      if (change === "coin-pack")
        f.products[0].coinPackCoins = new Prisma.Decimal("100");
      expect(await upgradeStyleComposition(f.db)).toBe("incomplete");
      expect(f.updateMany).not.toHaveBeenCalled();
      expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
      });
    },
  );
  it("moves depth below the main campaign, with optimistic revision protection", async () => {
    const { db, updateMany } = fixture(original());
    await upgradeStyleComposition(db);
    const args = updateMany.mock.calls[0][0] as {
      where: { updatedAt: Date };
      data: {
        blocks: Array<{
          type: string;
          layout?: string;
          source?: { mode: string; referenceId: string; limit: number };
        }>;
      };
    };
    expect(args.where.updatedAt).toEqual(new Date(0));
    expect(args.data.blocks[0].layout).toBe("editorial");
    expect(args.data.blocks[1].type).toBe("CategoryCards");
    expect(args.data.blocks.slice(2, 6).map((block) => block.source)).toEqual(
      ["women", "men", "kids", "accessories"].map((department) => ({
        mode: "category",
        referenceId: `seed-category-${department}`,
        limit: 5,
      })),
    );
    expect(args.data.blocks[6].type).toBe("ShopLook");
    expect(homepageBlocksSchema.safeParse(args.data.blocks).success).toBe(true);
    const second = fixture(args.data.blocks);
    await upgradeStyleComposition(second.db);
    expect(second.updateMany).not.toHaveBeenCalled();
  });
  it("upgrades the exact previous style demo while preserving a reordered or edited one", async () => {
    const pristine = fixture(previousStyleComposition());
    await upgradeStyleComposition(pristine.db);
    expect(pristine.updateMany).toHaveBeenCalledOnce();
    const reordered = previousStyleComposition();
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    const changedOrder = fixture(reordered);
    await upgradeStyleComposition(changedOrder.db);
    expect(changedOrder.updateMany).not.toHaveBeenCalled();
    const edited = previousStyleComposition();
    edited[3] = { ...edited[3], source: { mode: "latest", limit: 5 } };
    const changedLimit = fixture(edited);
    await upgradeStyleComposition(changedLimit.db);
    expect(changedLimit.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ marketId: "merchant-market" }, { deletedAt: new Date() }])(
    "preserves market overrides and deleted content: %j",
    async (extras) => {
      const { db, updateMany } = fixture(original(), extras);
      await upgradeStyleComposition(db);
      expect(updateMany).not.toHaveBeenCalled();
    },
  );
  it("preserves even a single merchant copy edit", async () => {
    const blocks = original() as Array<Record<string, unknown>>;
    blocks[0] = {
      ...blocks[0],
      title: { fa: "عنوان مالک", tr: "Özel", en: "Custom" },
    };
    const { db, updateMany } = fixture(blocks);
    await upgradeStyleComposition(db);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
