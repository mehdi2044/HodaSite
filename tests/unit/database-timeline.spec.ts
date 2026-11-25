import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { traceDatabase, transactionWave } from "../helpers/database-timeline";

it("keeps transaction barriers and lock-test replacement/restoration independent of tracing", async () => {
  const tx = { $queryRaw: async () => [{ pid: 1 }] };
  const native = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const db = traceDatabase({ $transaction: native } as unknown as PrismaClient);
  expect(db.$transaction).toBe(db.$transaction);
  const original = db.$transaction.bind(db);
  const replacement = vi.fn(original) as unknown as typeof db.$transaction;
  db.$transaction = replacement;
  expect(db.$transaction).toBe(replacement);
  db.$transaction = original;
  expect(db.$transaction).toBe(original);
  const results = await transactionWave(5, () =>
    Promise.all(
      Array.from({ length: 5 }, () => db.$transaction(async () => "committed")),
    ),
  );
  expect(results).toEqual(Array(5).fill("committed"));
  expect(native).toHaveBeenCalledTimes(5);
  expect(replacement).not.toHaveBeenCalled();
});
