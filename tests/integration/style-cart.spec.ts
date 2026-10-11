vi.mock("@/modules/orders", () => ({
  CommerceError: class CommerceError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));
vi.mock("@/modules/auth", () => ({ auth: vi.fn() }));
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
const state = vi.hoisted(() => ({
  token: "",
  market: {} as { id: string; currency: string },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.token }), set: vi.fn() }),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: state.market }),
}));
vi.mock("@/lib/mutation-gate", () => ({
  withMutation: (work: () => Promise<unknown>) => work(),
}));
import { addCartItems } from "@/modules/cart";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "prepared look cart transaction (real PostgreSQL)",
  () => {
    let cartId = "";
    const ids = ["seed-style-v2-women-tee-m", "seed-style-v2-women-trousers-m"];
    beforeAll(async () => {
      const market = await db.market.findFirstOrThrow({
        where: { code: "TR" },
      });
      state.market = market;
      state.token = `style-cart-${Date.now()}-${Math.random()}`;
      const cart = await db.cart.create({
        data: {
          tokenHash: tokenHash(state.token),
          marketId: market.id,
          currency: market.currency,
          locale: "tr",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      cartId = cart.id;
    });
    afterAll(async () => {
      if (cartId) await db.cart.delete({ where: { id: cartId } });
    });
    it("rejects the complete batch without writes if one variant is unavailable", async () => {
      await expect(
        addCartItems("tr", [ids[0], "nonexistent-style-variant"]),
      ).rejects.toThrow();
      expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
      expect(
        (await db.cart.findUniqueOrThrow({ where: { id: cartId } })).revision,
      ).toBe(0);
    });
    it("serializes simultaneous batches without lost increments or partial items", async () => {
      await Promise.all([addCartItems("tr", ids), addCartItems("tr", ids)]);
      const cart = await db.cart.findUniqueOrThrow({
        where: { id: cartId },
        include: { items: true },
      });
      expect(cart.items).toHaveLength(2);
      expect(cart.items.every((item) => item.quantity === 2)).toBe(true);
      expect(cart.revision).toBe(2);
    });
  },
);
