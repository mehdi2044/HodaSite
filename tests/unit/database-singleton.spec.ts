import { expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({ constructors: 0 }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    readonly instance = ++observed.constructors;
  },
}));

it.each(["production", "development", "test"])(
  "%s shares one Prisma client across independently evaluated server modules",
  async (environment) => {
    const singleton = globalThis as unknown as { prisma?: unknown };
    const previous = singleton.prisma;
    delete singleton.prisma;
    observed.constructors = 0;
    vi.stubEnv("NODE_ENV", environment);
    try {
      vi.resetModules();
      const first = await import("@/lib/db");
      vi.resetModules();
      const second = await import("@/lib/db");
      expect(observed.constructors).toBe(1);
      expect(second.db).toBe(first.db);
    } finally {
      if (previous === undefined) delete singleton.prisma;
      else singleton.prisma = previous;
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  },
);
