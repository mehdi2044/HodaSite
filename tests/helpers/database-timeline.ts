import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";

const context = new AsyncLocalStorage<{ label: string; test?: string; transaction?: number }>();
let sequence = 0;
let gate: (() => Promise<void>) | undefined;
const pending = new Set<number>();

export function timeline(event: string, detail: Record<string, unknown> = {}) {
  const file = process.env.CHECKOUT_TIMELINE_FILE;
  if (!file) return;
  appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ms: performance.now(), pid: process.pid, event, ...context.getStore(), pendingTransactions: pending.size, ...detail }) + "\n");
}

export async function phase<T>(label: string, action: () => Promise<T>): Promise<T> {
  return context.run({ ...context.getStore(), test: context.getStore()?.test ?? label, label }, async () => {
    timeline("phase.start");
    try { const result = await action(); timeline("phase.end"); return result; }
    catch (error) { timeline("phase.error", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); throw error; }
  });
}

/** Test-only barrier admits a real bounded wave, without sleeps or changing deadlines. */
export async function transactionWave<T>(size: number, action: () => Promise<T>): Promise<T> {
  let arrivals = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  gate = async () => { if (++arrivals === size) release(); await ready; };
  try { return await action(); } finally { gate = undefined; }
}

/** Preserves native model PrismaPromises, transaction options and the original client. */
export function traceDatabase(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (key === "$transaction") return (...args: unknown[]) => {
        const id = ++sequence, requested = performance.now(), callback = args[0];
        pending.add(id); timeline("transaction.request", { id });
        if (typeof callback === "function") args[0] = async (tx: Prisma.TransactionClient) => {
          const acquired = performance.now();
          return context.run({ ...context.getStore(), label: context.getStore()?.label ?? "unscoped", transaction: id }, async () => {
            timeline("transaction.acquired", { id, acquisitionAndBeginMs: acquired - requested });
            if (process.env.CHECKOUT_TIMELINE_FILE) {
              const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
              timeline("transaction.backend", { id, backendPid: backend.pid });
            }
            if (gate) await gate();
            try { return await callback(tx); } finally { timeline("transaction.callback.end", { id }); }
          });
        };
        return Promise.resolve(Reflect.apply(value, target, args)).then(
          (result: unknown) => { pending.delete(id); timeline("transaction.commit", { id, totalMs: performance.now() - requested }); return result; },
          (error: unknown) => { pending.delete(id); timeline("transaction.rollback", { id, totalMs: performance.now() - requested, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); throw error; },
        );
      };
      if (context.getStore()?.transaction && typeof key === "string" && !key.startsWith("$")) timeline("global-client-inside-transaction", { model: key });
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
