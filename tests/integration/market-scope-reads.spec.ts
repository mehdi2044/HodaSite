import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authorizedMarketIds } from "@/modules/access";

type Fixture = {
  tx: Prisma.TransactionClient;
  actorId: string;
  marketId: string;
  inactiveIds: string[];
  subjectReads: () => number;
};

/** Real rows inside one rolled-back transaction; never grows the shared fixture. */
async function fixture(
  scope: (marketId: string) => Prisma.InputJsonValue | undefined,
  body: (value: Fixture) => Promise<void>,
) {
  const originalMarkets = await db.market.count();
  let reads = 0;
  const client = db.$extends({
    query: {
      user: {
        findUnique: ({ args, query }) => {
          reads++;
          return query(args);
        },
      },
    },
  });
  const rollback = new Error("ROLLBACK_SCOPE_FIXTURE");
  let actorId = "";
  try {
    await client.$transaction(async (tx) => {
      const template = await tx.market.findUniqueOrThrow({
        where: { code: "TR" },
      });
      const prefix = `Q${randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase()}`;
      await tx.market.createMany({
        data: Array.from({ length: 26 }, (_, index) => ({
          code: prefix + index.toString(36).toUpperCase(),
          name: "Scope fixture",
          currency: template.currency,
          isActive: false,
          defaultLocale: template.defaultLocale,
          enabledLocales: template.enabledLocales,
          roundingRule: template.roundingRule as Prisma.InputJsonValue,
          holdHours: template.holdHours,
          paymentDeadlineHours: template.paymentDeadlineHours,
          fxMode: template.fxMode,
        })),
      });
      const inactiveIds = (
        await tx.market.findMany({
          where: { code: { startsWith: prefix } },
          select: { id: true },
        })
      ).map((market) => market.id);
      expect(inactiveIds).toHaveLength(26);
      const role = await tx.role.create({
        data: {
          key: `scope-${randomUUID()}`,
          nameI18n: { fa: "آزمون", tr: "Test", en: "Test" },
          permissions: { create: { permission: "order.view" } },
        },
      });
      const grant = scope(template.id);
      const actor = await tx.user.create({
        data: {
          email: `scope-${randomUUID()}@example.test`,
          name: "Scoped test actor",
          passwordHash: "unused",
          roles: {
            create: {
              roleId: role.id,
              ...(grant === undefined ? {} : { scope: grant }),
            },
          },
        },
      });
      actorId = actor.id;
      await body({
        // This query-only observer preserves every model/result. Prisma's
        // extension generics do not structurally assign to its base Tx alias.
        tx: tx as unknown as Prisma.TransactionClient,
        actorId,
        marketId: template.id,
        inactiveIds,
        subjectReads: () => reads,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  expect(await db.market.count()).toBe(originalMarkets);
  expect(await db.user.findUnique({ where: { id: actorId } })).toBeNull();
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "fresh market-scope authorization without N+1 reads",
  () => {
    afterAll(() => db.$disconnect());

    it.each(["market", "category", "unknown-key"] as const)(
      "preserves %s grant semantics with one subject read across at least 26 extra markets",
      async (kind) => {
        await fixture(
          (marketId) =>
            kind === "market"
              ? { marketId }
              : kind === "category"
                ? { marketId, categoryId: "category-fixture" }
                : { marketId, unexpected: "invalid" },
          async ({ tx, actorId, marketId, subjectReads }) => {
            expect(
              await authorizedMarketIds(actorId, "order.view", tx),
            ).toEqual(kind === "market" ? [marketId] : []);
            expect(subjectReads()).toBe(1);
          },
        );
      },
    );

    it("matching explicit denial still wins over a scoped role", async () => {
      await fixture(
        (marketId) => ({ marketId }),
        async ({ tx, actorId, marketId, subjectReads }) => {
          await tx.userPermissionOverride.create({
            data: {
              userId: actorId,
              permission: "order.view",
              allow: false,
              scope: { marketId },
            },
          });
          expect(await authorizedMarketIds(actorId, "order.view", tx)).toEqual(
            [],
          );
          expect(subjectReads()).toBe(1);
        },
      );
    });

    it("keeps authorized inactive markets for historical financial records", async () => {
      await fixture(
        () => undefined,
        async ({ tx, actorId, inactiveIds, subjectReads }) => {
          const expected = (
            await tx.market.findMany({ select: { id: true } })
          ).map((market) => market.id);
          const allowed = await authorizedMarketIds(actorId, "order.view", tx);
          expect(allowed.toSorted()).toEqual(expected.toSorted());
          for (const id of inactiveIds) expect(allowed).toContain(id);
          expect(subjectReads()).toBe(1);
        },
      );
    });

    it("rechecks current account state on each operation and fails closed", async () => {
      await fixture(
        (marketId) => ({ marketId }),
        async ({ tx, actorId, marketId, subjectReads }) => {
          expect(await authorizedMarketIds(actorId, "order.view", tx)).toEqual([
            marketId,
          ]);
          await tx.user.update({
            where: { id: actorId },
            data: { isActive: false },
          });
          expect(await authorizedMarketIds(actorId, "order.view", tx)).toEqual(
            [],
          );
          expect(
            await authorizedMarketIds("missing-scope-actor", "order.view", tx),
          ).toEqual([]);
          expect(subjectReads()).toBe(3);
          expect(
            await authorizedMarketIds(actorId, "unknown.permission", tx),
          ).toEqual([]);
          expect(subjectReads()).toBe(3);
        },
      );
    });
  },
);
