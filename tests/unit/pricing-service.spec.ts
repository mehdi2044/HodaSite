import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => {
  const db = {
    integration: { findUnique: vi.fn() },
    market: { findFirstOrThrow: vi.fn() },
    fxOverride: { findFirst: vi.fn() },
    fxQuote: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    marketPrice: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    systemAlert: { create: vi.fn() },
    job: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { db, handler: vi.fn(), fetch: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("@/modules/jobs", () => ({ registerJobHandler: m.handler }));
import {
  acceptFxQuote,
  ensureFxRefreshScheduled,
  getDisplayPrice,
  getFxConfiguration,
  isRateStale,
  persistFxRate,
  refreshFxRates,
  registerPricingJobHandlers,
} from "@/modules/pricing/service";
const market = {
  id: "tr",
  code: "TR",
  currency: "TRY",
  fxMode: "AUTO_ACCEPT",
  fxMaxJumpPercent: "5",
  markupPercent: "0",
  roundingRule: { increment: "0.01", mode: "HALF_UP" },
};
const active = {
  id: "old",
  rate: "40",
  provider: "manual",
  acceptedAt: new Date(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NAVASAN_API_KEY", "");
  vi.stubGlobal("fetch", m.fetch);
  m.db.integration.findUnique.mockResolvedValue({
    isActive: true,
    config: { intlProvider: "manual", irtProvider: "manual" },
  });
  m.db.market.findFirstOrThrow.mockResolvedValue(market);
  m.db.fxOverride.findFirst.mockResolvedValue(null);
  m.db.fxQuote.findFirst.mockResolvedValue(active);
  m.db.fxQuote.findUniqueOrThrow.mockResolvedValue({
    id: "new",
    marketId: "tr",
  });
  m.db.fxQuote.create.mockResolvedValue({ id: "new", status: "SUGGESTED" });
  m.db.fxQuote.update.mockResolvedValue({
    id: "new",
    rate: "41",
    provider: "manual",
  });
  m.db.marketPrice.findFirst.mockResolvedValue(null);
  m.db.$transaction.mockImplementation(
    async (fn: (db: typeof m.db) => Promise<unknown>) => fn(m.db),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses defaults for missing or invalid provider configuration", async () => {
  m.db.integration.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ config: { refreshHours: -3 } });
  expect(await getFxConfiguration()).toMatchObject({
    refreshHours: 6,
    isActive: true,
    intlProvider: "frankfurter",
  });
  expect((await getFxConfiguration()).refreshHours).toBe(6);
});
it("keeps the last rate active when a suggested rate jumps too much", async () => {
  await persistFxRate({
    base: "USD",
    quote: "TRY",
    rate: "60",
    provider: "manual",
    fetchedAt: new Date(),
  });
  expect(m.db.fxQuote.update).not.toHaveBeenCalled();
  expect(m.db.systemAlert.create).toHaveBeenCalled();
});
it("activates safe rates with an audited transaction", async () => {
  await persistFxRate({
    base: "USD",
    quote: "TRY",
    rate: "41",
    provider: "frankfurter",
    fetchedAt: new Date(),
  });
  expect(m.db.fxQuote.updateMany).toHaveBeenCalled();
  expect(m.db.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ action: "fx.auto_accept" }),
    }),
  );
});
it("records approval-only Navasan quotes without activating them", async () => {
  m.db.market.findFirstOrThrow.mockResolvedValue({
    ...market,
    fxMode: "REQUIRE_APPROVAL",
  });
  await persistFxRate({
    base: "USD",
    quote: "IRT",
    rate: "41",
    provider: "navasan",
    sourceField: "usd_sell",
    fetchedAt: new Date(),
  });
  expect(m.db.fxQuote.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sourceField: "usd_sell" }),
    }),
  );
  expect(m.db.fxQuote.update).not.toHaveBeenCalled();
});
it("accepts the initial quote without requiring a previous rate", async () => {
  m.db.fxQuote.findFirst.mockResolvedValue(null);
  await persistFxRate({
    base: "USD",
    quote: "TRY",
    rate: "41",
    provider: "manual",
    fetchedAt: new Date(),
  });
  expect(m.db.auditLog.create).toHaveBeenCalled();
});
it("audits explicit acceptance with the operator", async () => {
  await acceptFxQuote("new", "operator");
  expect(m.db.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "fx.accept",
        userId: "operator",
      }),
    }),
  );
});
it("calculates effective product and variant prices with overrides", async () => {
  const product = {
    id: "p",
    basePriceAmount: "10",
    compareAtPriceAmount: "20",
  };
  const variant = { id: "v", priceOverrideUsd: "12" };
  expect((await getDisplayPrice(product, variant, market)).amount).toBe("480");
  m.db.marketPrice.findFirst.mockResolvedValueOnce({
    amount: "25",
    compareAtAmount: "30",
  });
  expect(await getDisplayPrice(product, variant, market)).toMatchObject({
    amount: "25",
    compareAtAmount: "30",
  });
  expect((await getDisplayPrice(product, null, market)).amount).toBe("400");
});
it("honors a product override when there is no variant override", async () => {
  m.db.marketPrice.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ amount: "22", compareAtAmount: null });
  expect(
    (
      await getDisplayPrice(
        { id: "p", basePriceAmount: "1", compareAtPriceAmount: null },
        { id: "v", priceOverrideUsd: null },
        market,
      )
    ).amount,
  ).toBe("22");
});
it("does not contact providers when disabled", async () => {
  m.db.integration.findUnique.mockResolvedValue({
    isActive: false,
    config: {},
  });
  expect(await refreshFxRates()).toBe(0);
  expect(m.fetch).not.toHaveBeenCalled();
});
it("records missing credentials and provider errors while preserving prices", async () => {
  m.db.integration.findUnique.mockResolvedValue({ isActive: true, config: {} });
  m.fetch.mockRejectedValue(new Error("Provider unavailable"));
  expect(await refreshFxRates()).toBe(0);
  expect(m.db.systemAlert.create).toHaveBeenCalledTimes(2);
  expect(m.db.fxQuote.update).not.toHaveBeenCalled();
});
it("refreshes international rates and authenticated Navasan rates", async () => {
  vi.stubEnv("NAVASAN_API_KEY", "test-key");
  m.db.integration.findUnique.mockResolvedValue({ isActive: true, config: {} });
  m.fetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { base: "USD", quote: "TRY", rate: 41 },
        { base: "USD", quote: "CAD", rate: 1.4 },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ usd_sell: { value: "60000" } }),
    });
  expect(await refreshFxRates()).toBe(3);
});
it("schedules refresh only when none is queued, and reschedules after running", async () => {
  m.db.job.findFirst
    .mockResolvedValueOnce({ id: "pending" })
    .mockResolvedValueOnce(null);
  await ensureFxRefreshScheduled();
  expect(m.db.job.create).not.toHaveBeenCalled();
  await ensureFxRefreshScheduled();
  expect(m.db.job.create).toHaveBeenCalledTimes(1);
  registerPricingJobHandlers();
  const handler = m.handler.mock.calls[0][1] as () => Promise<void>;
  await handler();
  expect(m.db.job.create).toHaveBeenCalledTimes(2);
});
it("checks stale thresholds including missing rates", () => {
  const at = new Date("2026-01-01");
  expect(isRateStale(null, 1, at)).toBe(true);
  expect(isRateStale(at, 1, at)).toBe(false);
  expect(isRateStale(at, 1, new Date("2026-01-02"))).toBe(true);
});
