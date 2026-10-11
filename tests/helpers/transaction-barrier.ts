import type { Prisma, PrismaClient } from "@prisma/client";

/** Pause one actual ORM operation after its PostgreSQL locks are acquired. */
export function transactionBarrier(
  db: PrismaClient,
  delegate: "product" | "homepage" | "integration" | "fittingSession",
  method: string,
  matches: (input: unknown) => boolean,
) {
  let notify!: () => void,
    release!: () => void,
    pid = 0,
    admitted = false;
  const entered = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = db.$transaction.bind(db);
  const run = original as unknown as (
    fn: unknown,
    options?: unknown,
  ) => Promise<unknown>;
  db.$transaction = (async (fn: unknown, options?: unknown) => {
    if (typeof fn !== "function") return run(fn, options);
    return run(async (tx: Prisma.TransactionClient) => {
      const wrapped = new Proxy(tx, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          if (key !== delegate) return value;
          return new Proxy(value, {
            get(d, action) {
              const operation = Reflect.get(d, action, d);
              if (action !== method) return operation;
              return async (input: unknown) => {
                const result = await operation.call(d, input);
                if (!admitted && matches(input)) {
                  admitted = true;
                  const [backend] = await tx.$queryRaw<
                    { pid: number }[]
                  >`SELECT pg_backend_pid() AS pid`;
                  pid = backend.pid;
                  notify();
                  await gate;
                }
                return result;
              };
            },
          });
        },
      });
      return (fn as (client: Prisma.TransactionClient) => Promise<unknown>)(
        wrapped,
      );
    }, options);
  }) as typeof db.$transaction;
  return {
    entered,
    release,
    get pid() {
      return pid;
    },
    restore: () => {
      db.$transaction = original;
    },
  };
}
