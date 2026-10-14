import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
const state = vi.hoisted(() => ({
  token: "",
  market: {} as { id: string; currency: string },
}));
vi.mock("@/modules/auth", () => ({ auth: async () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.token }), set: vi.fn() }),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: state.market }),
}));
vi.mock("next/cache", () => ({
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
import { addShoppableScene } from "@/modules/content/scenes/purchase";
import {
  saveHomepageDraft,
  publishHomepageRevision,
} from "@/modules/content/publication";
import { setMaintenanceFlag } from "@/modules/settings";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "PHOTO cart: actual PostgreSQL quotes and complete-batch validation",
  () => {
    const ids = [
      "seed-style-v2-women-coat-m",
      "seed-style-v2-women-tee-charcoal-m",
    ];
    let cartId = "",
      homeId = "";
    let previous: Awaited<ReturnType<typeof db.homepage.findFirst>>;
    const cart = () =>
      db.cart.findUniqueOrThrow({
        where: { id: cartId },
        include: { items: true },
      });
    beforeAll(async () => {
      setMaintenanceFlag(false);
      state.market = await db.market.findUniqueOrThrow({
        where: { code: "TR" },
      });
      previous = await db.homepage.findFirst({
        where: { marketId: state.market.id },
      });
      const owner = await db.user.findUniqueOrThrow({
        where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
      });
      const variants = await db.variant.findMany({
        where: { id: { in: ids } },
        include: { media: true, product: { include: { media: true } } },
      });
      const saved = await saveHomepageDraft(owner.id, {
        marketId: state.market.id,
        expectedVersion: previous?.version ?? 0,
        confirmSceneIds: ["scene-cart-proof"],
        blocks: [
          {
            type: "Hero",
            body: { fa: "", tr: "", en: "" },
            ctaLabel: { fa: "", tr: "", en: "" },
            title: { fa: "ست آزمون", tr: "Test", en: "Test" },
            scene: {
              version: 1,
              id: "scene-cart-proof",
              mode: "PHOTO",
              title: { fa: "ست آزمون", tr: "Test", en: "Test" },
              alt: { fa: "ست آزمون", tr: "Test", en: "Test" },
              desktop: { mediaId: "seed-fashion-v2-look-women-coat" },
              mobile: { mediaId: "seed-fashion-v2-look-women-coat" },
              pieces: variants.map((v, i) => ({
                id: `piece-${i}`,
                productId: v.productId,
                colorId: v.colorId,
                referenceMediaId: (v.media[0] ?? v.product.media[0]).mediaId,
                desktop: { x: 0.5, y: 0.4 },
                mobile: { x: 0.5, y: 0.4 },
              })),
            },
          },
        ],
      });
      homeId = saved.id;
      await publishHomepageRevision(owner.id, {
        homepageId: saved.id,
        revisionId: saved.revisionId,
        expectedVersion: saved.version,
      });
      state.token = `scene-cart-${crypto.randomUUID()}`;
      cartId = (
        await db.cart.create({
          data: {
            tokenHash: tokenHash(state.token),
            marketId: state.market.id,
            currency: state.market.currency,
            locale: "tr",
            expiresAt: new Date(Date.now() + 86400000),
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (cartId) await db.cart.delete({ where: { id: cartId } });
      if (previous) {
        const { id, createdAt, updatedAt, ...rest } = previous;
        void createdAt;
        void updatedAt;
        await db.homepage.update({
          where: { id },
          data: {
            ...rest,
            blocks: rest.blocks as Prisma.InputJsonValue,
            draftBlocks:
              rest.draftBlocks === null
                ? Prisma.DbNull
                : (rest.draftBlocks as Prisma.InputJsonValue),
          },
        });
      } else if (homeId) await db.homepage.delete({ where: { id: homeId } });
    });
    it("rejects missing, unrelated and duplicate size selections without any partial cart write", async () => {
      for (const variantIds of [
        [ids[0]],
        [ids[0], "seed-style-v2-women-trousers-m"],
        [ids[0], ids[0]],
      ]) {
        await expect(
          addShoppableScene("tr", { sceneId: "scene-cart-proof", variantIds }),
        ).rejects.toThrow();
        expect((await cart()).items).toHaveLength(0);
        expect((await cart()).revision).toBe(0);
      }
    });
    it("serializes two complete scene additions through the existing fresh quote transaction", async () => {
      await Promise.all([
        addShoppableScene("tr", {
          sceneId: "scene-cart-proof",
          variantIds: ids,
        }),
        addShoppableScene("tr", {
          sceneId: "scene-cart-proof",
          variantIds: ids,
        }),
      ]);
      const actual = await cart();
      expect(actual.items).toHaveLength(2);
      expect(actual.items.every((i) => i.quantity === 2)).toBe(true);
      expect(actual.revision).toBe(2);
    });
    it("rejects the whole batch if stock or photographed references change after selection", async () => {
      const before = await cart();
      const stock = await db.stockItem.findMany({
        where: { variantId: ids[1] },
      });
      try {
        await db.stockItem.updateMany({
          where: { variantId: ids[1] },
          data: { onHand: 0, reserved: 0 },
        });
        await expect(
          addShoppableScene("tr", {
            sceneId: "scene-cart-proof",
            variantIds: ids,
          }),
        ).rejects.toThrow();
        expect(await cart()).toEqual(before);
      } finally {
        for (const item of stock)
          await db.stockItem.update({
            where: { id: item.id },
            data: { onHand: item.onHand, reserved: item.reserved },
          });
      }
      const media = await db.media.findUniqueOrThrow({
        where: { id: "seed-fashion-v2-look-women-coat" },
      });
      try {
        await db.media.update({
          where: { id: media.id },
          data: { status: "PROCESSING" },
        });
        await expect(
          addShoppableScene("tr", {
            sceneId: "scene-cart-proof",
            variantIds: ids,
          }),
        ).rejects.toThrow();
        expect(await cart()).toEqual(before);
      } finally {
        await db.media.update({
          where: { id: media.id },
          data: { status: media.status },
        });
      }
    });
  },
);
