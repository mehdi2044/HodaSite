import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ quote: vi.fn(), override: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    fxQuote: { findFirst: mock.quote },
    fxOverride: { findFirst: mock.override },
  },
}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) =>
      JSON.parse(JSON.stringify(await fn(...args))),
}));
vi.mock("@/modules/jobs", () => ({ registerJobHandler: vi.fn() }));
import {
  findEffectiveRate,
  getRateAt,
  getActiveRate,
} from "@/modules/pricing/service";
beforeEach(() => {
  vi.resetAllMocks();
  mock.override.mockResolvedValue(null);
  mock.quote.mockResolvedValue(null);
});
it("uses accepted historical quotes rather than the current active status", async () => {
  const date = new Date("2026-01-05T13:22:34Z");
  mock.quote.mockResolvedValue({
    rate: "30",
    provider: "manual",
    acceptedAt: new Date("2026-01-01"),
  });
  expect((await getRateAt({ id: "TR", code: "TR" }, date)).rate).toBe("30");
  expect(mock.quote).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        marketId: "TR",
        status: { in: ["ACTIVE", "SUPERSEDED"] },
        acceptedAt: { lte: date },
      },
    }),
  );
});
it("fails explicitly if historical data is unavailable instead of using today's rate", async () => {
  await expect(
    getRateAt({ id: "TR", code: "TR" }, new Date("2020-01-01")),
  ).rejects.toThrow("No historical FX rate");
});
it("applies an override at the exact timestamp and exposes its source for the admin", async () => {
  const at = new Date("2026-01-05T13:22:34Z");
  mock.override.mockResolvedValue({ rate: "42", validFrom: at });
  expect(await findEffectiveRate("TR", at, true)).toEqual({
    rate: "42",
    source: "override",
    at,
  });
  expect(mock.quote).not.toHaveBeenCalled();
  expect(mock.override).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        marketId: "TR",
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
    }),
  );
});
it("keeps current pricing restricted to the active quote", async () => {
  const at = new Date();
  mock.quote.mockResolvedValue({
    rate: "50",
    provider: "manual",
    acceptedAt: null,
    fetchedAt: at,
  });
  expect(await getActiveRate({ id: "TR", code: "TR" })).toEqual({
    rate: "50",
    source: "manual",
    at,
  });
  expect(mock.quote).toHaveBeenCalledWith(
    expect.objectContaining({ where: { marketId: "TR", status: "ACTIVE" } }),
  );
});
it("fails explicitly if current rates are missing", async () => {
  await expect(getActiveRate({ id: "TR", code: "TR" })).rejects.toThrow(
    "No active FX rate",
  );
});

it("restores dates from the serialized cache before checking staleness", async () => {
  const acceptedAt = new Date("2026-09-10T10:00:00.123Z");
  mock.quote.mockResolvedValue({
    rate: "40",
    provider: "manual",
    acceptedAt,
    fetchedAt: acceptedAt,
  });
  const rate = await getActiveRate({ id: "TR", code: "TR" });
  expect(rate.at).toBeInstanceOf(Date);
  expect(rate.at.getTime()).toBe(acceptedAt.getTime());
});
