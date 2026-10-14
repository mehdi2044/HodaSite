import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { resolveContentTarget } from "@/modules/content/moda4-targets";
import { fittingConfig } from "@/modules/fitting";
import { moda4Products } from "@/modules/content/moda4-products";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b actual localized targets and ordered market-safe manual catalog source",
  () => {
    let marketId = "",
      pageId = "";
    beforeAll(async () => {
      marketId = (await db.market.findUniqueOrThrow({ where: { code: "CA" } }))
        .id;
      pageId = (
        await db.page.create({
          data: {
            titleI18n: { en: "Fixture" },
            slugI18n: { en: `content-${randomUUID()}`, fa: "آزمون" },
            status: "draft",
            marketIds: [marketId],
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (pageId)
        await db.page.update({
          where: { id: pageId },
          data: { deletedAt: new Date() },
        });
    });
    it("uses supported actual search/collection/fitting paths and never invents an SEO route", async () => {
      expect(
        await resolveContentTarget({ kind: "catalog" }, marketId, "en"),
      ).toBe("/en/search?market=CA");
      expect(
        await resolveContentTarget({ kind: "fitting" }, marketId, "en"),
      ).toBe(
        (await fittingConfig()).enabled ? "/en/fitting-room?market=CA" : null,
      );
      const collection = await db.collection.findFirst({
        where: { deletedAt: null },
      });
      if (collection)
        expect(
          await resolveContentTarget(
            { kind: "collection", id: collection.id },
            marketId,
            "en",
          ),
        ).toBe(
          `/en/search?market=CA&collectionId=${encodeURIComponent(collection.id)}`,
        );
      expect(
        await resolveContentTarget({ kind: "catalog" }, "absent", "en"),
      ).toBeNull();
    });
    it("rejects private/draft, untranslated and out-of-market pages while preserving canonical slug encoding", async () => {
      expect(
        await resolveContentTarget(
          { kind: "page", id: pageId },
          marketId,
          "en",
        ),
      ).toBeNull();
      await db.page.update({
        where: { id: pageId },
        data: { status: "published" },
      });
      expect(
        await resolveContentTarget(
          { kind: "page", id: pageId },
          marketId,
          "fa",
        ),
      ).toBe(`/fa/m/CA/pages/${encodeURIComponent("آزمون")}`);
      expect(
        await resolveContentTarget(
          { kind: "page", id: pageId },
          marketId,
          "tr",
        ),
      ).toBeNull();
      const foreign = await db.market.findUniqueOrThrow({
        where: { code: "TR" },
      });
      expect(
        await resolveContentTarget(
          { kind: "page", id: pageId },
          foreign.id,
          "en",
        ),
      ).toBeNull();
    });
    it("keeps merchant order/limit but filters soft deletion and foreign markets without leaking catalog rows", async () => {
      const productIds = [
        "seed-style-v2-women-trousers",
        "seed-style-v2-women-coat",
      ];
      const source = { mode: "manual" as const, productIds, limit: 2 };
      expect(
        (await moda4Products(marketId, "en", source)).map((row) => row.id),
      ).toEqual(productIds);
      expect(await moda4Products("foreign-market", "en", source)).toEqual([]);
      const product = await db.product.findUniqueOrThrow({
        where: { id: productIds[0] },
      });
      await db.product.update({
        where: { id: product.id },
        data: { deletedAt: new Date() },
      });
      try {
        expect(
          (await moda4Products(marketId, "en", source)).map((row) => row.id),
        ).toEqual([productIds[1]]);
      } finally {
        await db.product.update({
          where: { id: product.id },
          data: { deletedAt: product.deletedAt },
        });
      }
    });
  },
);
