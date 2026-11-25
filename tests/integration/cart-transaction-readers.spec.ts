import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const state = vi.hoisted(() => ({
  requests: undefined as
    import("node:async_hooks").AsyncLocalStorage<string> | undefined,
  market: {} as { id: string; currency: string },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: state.requests!.getStore() }),
    set: () => {
      throw Error("Fixture cart must already exist");
    },
  }),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("@/modules/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: state.market }),
}));
vi.mock("@/lib/db", async (original) => {
  const module = await original<typeof import("@/lib/db")>();
  const { traceDatabase } = await import("../helpers/database-timeline");
  return { ...module, db: traceDatabase(module.db) };
});
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
import { changeCart, changeCartMarket, addCartItems } from "@/modules/cart";
import { transactionWave } from "../helpers/database-timeline";
import { fingerprint } from "../helpers/permission-subjects";
import { FixtureLifecycle } from "../helpers/fixture-lifecycle";
const lifecycle = new FixtureLifecycle();
const financial = [
  "Order",
  "Payment",
  "Reservation",
  "StockMovement",
  "StoreCredit",
  "JournalEntry",
  "JournalLine",
  "PromotionRedemption",
];
const variantId = "seed-style-v2-women-tee-m";
async function fixtures(items: boolean) {
  const market = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
  state.market = market;
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const token = "cart-reader-" + randomUUID();
    const cart = await db.cart.create({
      data: {
        tokenHash: tokenHash(token),
        marketId: market.id,
        currency: market.currency,
        locale: "tr",
        expiresAt: new Date("2099-01-01"),
        checkout: { fixture: true },
        ...(items ? { items: { create: { variantId, quantity: 1 } } } : {}),
      },
    });
    rows.push({ token, cart });
  }
  return rows;
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "actual cart mutations keep quote readers on their transaction",
  () => {
    beforeAll(() => {
      state.requests = new AsyncLocalStorage<string>();
    });
    beforeEach(() => lifecycle.ready());
    afterEach(() => lifecycle.ready());
    afterAll(async () => {
      await lifecycle.ready();
      await db.$disconnect();
    });
    it(
      "five admitted add operations preserve native five-connection pool and financial rows",
      lifecycle.track(async () => {
        const carts = await fixtures(false),
          before = await fingerprint(financial);
        const results = await transactionWave(5, () =>
          Promise.allSettled(
            carts.map(({ token }) =>
              state.requests!.run(token, () =>
                changeCart("tr", variantId, 1, true),
              ),
            ),
          ),
        );
        expect(results.map((r) => r.status)).toEqual(
          Array(5).fill("fulfilled"),
        );
        for (const { cart } of carts) {
          const current = await db.cart.findUniqueOrThrow({
            where: { id: cart.id },
            include: { items: true },
          });
          expect(current.revision).toBe(1);
          expect(
            current.items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          ).toEqual([{ variantId, quantity: 1 }]);
        }
        expect(await fingerprint(financial)).toEqual(before);
      }),
    );
    it(
      "five admitted market changes preserve items, clear checkout and commit atomically",
      lifecycle.track(async () => {
        const carts = await fixtures(true),
          before = await fingerprint(financial);
        const target = await db.market.findUniqueOrThrow({
          where: { code: "CA" },
        });
        state.market = target;
        const results = await transactionWave(5, () =>
          Promise.allSettled(
            carts.map(({ token }) =>
              state.requests!.run(token, () => changeCartMarket("en")),
            ),
          ),
        );
        expect(results.map((r) => r.status)).toEqual(
          Array(5).fill("fulfilled"),
        );
        for (const { cart } of carts) {
          const current = await db.cart.findUniqueOrThrow({
            where: { id: cart.id },
            include: { items: true },
          });
          expect(current).toMatchObject({
            marketId: target.id,
            currency: target.currency,
            locale: "en",
            revision: 1,
            checkout: {},
          });
          expect(
            current.items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          ).toEqual([{ variantId, quantity: 1 }]);
        }
        expect(await fingerprint(financial)).toEqual(before);
      }),
    );
    it(
      "an unavailable member rejects the full batch without changing cart or financial rows",
      lifecycle.track(async () => {
        const [{ cart, token }] = await fixtures(false);
        const before = await db.cart.findUniqueOrThrow({
            where: { id: cart.id },
            include: { items: true },
          }),
          money = await fingerprint(financial);
        await expect(
          state.requests!.run(token, () =>
            addCartItems("tr", [variantId, "missing-cart-reader-variant"]),
          ),
        ).rejects.toThrow("unavailable");
        expect(
          await db.cart.findUniqueOrThrow({
            where: { id: cart.id },
            include: { items: true },
          }),
        ).toEqual(before);
        expect(await fingerprint(financial)).toEqual(money);
      }),
    );
  },
);
