import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", async (original) => {
  const module = await original<typeof import("@/lib/db")>();
  const { traceDatabase } = await import("../helpers/database-timeline");
  return { ...module, db: traceDatabase(module.db) };
});
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { getActiveRate, getDisplayPrice } from "@/modules/pricing";
import { transactionWave } from "../helpers/database-timeline";
import Decimal from "decimal.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "transaction-scoped permission and exchange price readers",
  () => {
    afterAll(() => db.$disconnect());

    it("five admitted transactions authorize and price without a second connection", async () => {
      const actor = await db.user.findUniqueOrThrow({
        where: { email: process.env.ADMIN_EMAIL! },
      });
      const market = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const functional = await db.market.findUniqueOrThrow({
        where: { code: "TR", currency: "TRY" },
      });
      const variant = await db.variant.findFirstOrThrow({
        include: { product: true },
      });
      const results = await transactionWave(5, () =>
        Promise.allSettled(
          Array.from({ length: 5 }, () =>
            db.$transaction(
              async (tx) => {
                await assertCan(
                  actor.id,
                  "return.manage",
                  { marketId: market.id },
                  tx,
                );
                await assertCan(
                  actor.id,
                  "payment.refund",
                  { marketId: market.id },
                  tx,
                );
                const price = await getDisplayPrice(
                  variant.product,
                  variant,
                  market,
                  tx,
                );
                const rate = await getActiveRate(functional, undefined, tx);
                return { amount: price.amount, rate: rate.rate };
              },
              { timeout: 12000 },
            ),
          ),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(5).fill("fulfilled"));
      for (const result of results) {
        if (result.status === "fulfilled") {
          expect(new Decimal(result.value.amount).gt(0)).toBe(true);
          expect(new Decimal(result.value.rate).gt(0)).toBe(true);
        }
      }
    });

    it("the transaction-scoped guard still denies a missing actor", async () => {
      await expect(
        db.$transaction((tx) =>
          assertCan("missing-actor", "return.manage", undefined, tx),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });

    it("checks an uncommitted revocation and rolls it back without changing the actor", async () => {
      const actor = await db.user.findUniqueOrThrow({
        where: { email: process.env.ADMIN_EMAIL! },
      });
      expect(actor.isActive).toBe(true);
      await expect(
        db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: actor.id },
            data: { isActive: false },
          });
          await expect(
            assertCan(actor.id, "return.manage", undefined, tx),
          ).rejects.toThrow("FORBIDDEN");
          throw new Error("ROLLBACK_PERMISSION_PROBE");
        }),
      ).rejects.toThrow("ROLLBACK_PERMISSION_PROBE");
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: actor.id } })).isActive,
      ).toBe(true);
    });
  },
);
