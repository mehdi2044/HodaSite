import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { upgradeStyleComposition } from "../../prisma/style-seed";
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
  return {
    db: {
      homepage: { findUnique: async () => home, updateMany },
    } as unknown as PrismaClient,
    updateMany,
  };
}
describe("prepared demo composition upgrade", () => {
  it("moves depth below the main campaign, with optimistic revision protection", async () => {
    const { db, updateMany } = fixture(original());
    await upgradeStyleComposition(db);
    const args = updateMany.mock.calls[0][0] as {
      where: { updatedAt: Date };
      data: { blocks: Array<{ type: string; layout?: string }> };
    };
    expect(args.where.updatedAt).toEqual(new Date(0));
    expect(args.data.blocks[0].layout).toBe("editorial");
    expect(args.data.blocks[1].type).toBe("ShopLook");
    const second = fixture(args.data.blocks);
    await upgradeStyleComposition(second.db);
    expect(second.updateMany).not.toHaveBeenCalled();
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
