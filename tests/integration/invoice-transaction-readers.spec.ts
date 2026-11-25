import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import type { Prisma } from "@prisma/client";
const boundary = vi.hoisted(() => ({
  locks: 0,
  afterLock: undefined as
    undefined | ((tx: Prisma.TransactionClient) => Promise<void>),
}));
vi.mock("@/modules/auth", () => ({ auth: async () => null }));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/db", async (original) => {
  const module = await original<typeof import("@/lib/db")>();
  const { traceDatabase, timeline } =
    await import("../helpers/database-timeline");
  const client = module.db,
    native = client.$transaction;
  const transaction = (...args: unknown[]) => {
    const callback = args[0];
    if (typeof callback === "function")
      args[0] = (tx: Prisma.TransactionClient) =>
        callback(
          new Proxy(tx, {
            get(target, key) {
              const value = Reflect.get(target, key);
              if (key === "$queryRaw")
                return async (...values: unknown[]) => {
                  const rows = await Reflect.apply(value, target, values);
                  const text = Array.isArray(values[0])
                    ? values[0].join("?")
                    : "";
                  if (
                    text.includes('FROM "Order"') &&
                    text.includes("FOR UPDATE")
                  ) {
                    boundary.locks++;
                    timeline("invoice.order-lock-acquired", {
                      lockCount: boundary.locks,
                    });
                    if (boundary.afterLock) await boundary.afterLock(tx);
                  }
                  return rows;
                };
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
        );
    return Reflect.apply(native, client, args);
  };
  const observed = new Proxy(client, {
    get(target, key) {
      if (key === "$transaction") return transaction;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...module, db: traceDatabase(observed) };
});
import { db } from "@/lib/db";
import { regenerateInvoice } from "@/modules/orders/invoices/access";
import { INVOICE_JOB } from "@/modules/orders/invoices/queue";
import { shippingFixture, shippingActor } from "../helpers/shipping";
import { transactionWave } from "../helpers/database-timeline";
import { FixtureLifecycle } from "../helpers/fixture-lifecycle";
const ownOrderIds: string[] = [];
const lifecycle = new FixtureLifecycle();
beforeEach(() => lifecycle.ready());
afterEach(async () => {
  await lifecycle.ready();
  boundary.afterLock = undefined;
  boundary.locks = 0;
});
afterAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  await lifecycle.ready();
  // Only our synthetic queue fixtures are deferred after assertions, so an
  // unrelated queue test cannot claim these invoice-generation jobs.
  const invoices = await db.invoice.findMany({
    where: { orderId: { in: ownOrderIds } },
    select: { id: true },
  });
  if (invoices.length)
    await db.job.updateMany({
      where: {
        type: INVOICE_JOB,
        OR: invoices.map(({ id }) => ({
          payload: { path: ["invoiceId"], equals: id },
        })),
      },
      data: { runAt: new Date("2100-01-01T00:00:00.000Z") },
    });
  await db.$disconnect();
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "real invoice regeneration transaction readers",
  () => {
    it(
      "five admitted regenerations keep native pool five, real row locks and immutable financial snapshots",
      lifecycle.track(async () => {
        const actor = await shippingActor(db);
        const fixtures: Awaited<ReturnType<typeof shippingFixture>>[] = [];
        for (let i = 0; i < 5; i++) {
          const f = await shippingFixture(db);
          fixtures.push(f);
          ownOrderIds.push(f.order.id);
        }
        const before = await db.order.findMany({
          where: { id: { in: ownOrderIds } },
          include: { items: true, payments: true },
          orderBy: { id: "asc" },
        });
        const results = await transactionWave(5, () =>
          Promise.allSettled(
            fixtures.map((f) => regenerateInvoice(actor.id, f.order.id, 0)),
          ),
        );
        expect(boundary.locks).toBe(5);
        expect(results.map((r) => r.status)).toEqual(
          Array(5).fill("fulfilled"),
        );
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status !== "fulfilled") throw result.reason;
          expect(result.value.version).toBe(1);
          expect(
            await db.invoice.count({
              where: { orderId: fixtures[i].order.id },
            }),
          ).toBe(1);
          expect(
            await db.job.count({
              where: {
                type: INVOICE_JOB,
                payload: { path: ["invoiceId"], equals: result.value.id },
              },
            }),
          ).toBe(1);
        }
        expect(
          await db.order.findMany({
            where: { id: { in: ownOrderIds } },
            include: { items: true, payments: true },
            orderBy: { id: "asc" },
          }),
        ).toEqual(before);
      }),
    );
    it(
      "the actual after-lock guard observes transaction-local revocation and rolls everything back",
      lifecycle.track(async () => {
        const actor = await shippingActor(db),
          f = await shippingFixture(db);
        ownOrderIds.push(f.order.id);
        const before = await db.order.findUniqueOrThrow({
          where: { id: f.order.id },
          include: { items: true, payments: true },
        });
        boundary.afterLock = async (tx) => {
          await tx.user.update({
            where: { id: actor.id },
            data: { isActive: false },
          });
        };
        try {
          await expect(
            regenerateInvoice(actor.id, f.order.id, 0),
          ).rejects.toThrow("FORBIDDEN");
          expect(boundary.locks).toBe(1);
          expect(
            (await db.user.findUniqueOrThrow({ where: { id: actor.id } }))
              .isActive,
          ).toBe(true);
          expect(
            await db.invoice.count({ where: { orderId: f.order.id } }),
          ).toBe(0);
          expect(
            await db.order.findUniqueOrThrow({
              where: { id: f.order.id },
              include: { items: true, payments: true },
            }),
          ).toEqual(before);
        } finally {
          // If the intentionally uncorrected control fails, restore only this newly
          // created synthetic actor; never change an existing admin or financial row.
          boundary.afterLock = undefined;
          await db.user.update({
            where: { id: actor.id },
            data: { isActive: true },
          });
        }
      }),
    );
  },
);
