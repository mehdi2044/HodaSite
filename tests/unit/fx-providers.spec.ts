import { afterEach, expect, it, vi } from "vitest";
import {
  FrankfurterProvider,
  ManualFxProvider,
  NavasanProvider,
  parseFrankfurterV1,
  parseFrankfurterV2,
  parseNavasan,
  jumpPercent,
} from "@/modules/pricing/fx";
afterEach(() => vi.unstubAllGlobals());
it("uses v1 if the v2 provider fails or returns invalid data", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: { TRY: 40, CAD: 1.4 } }),
    });
  vi.stubGlobal("fetch", fetch);
  expect(await new FrankfurterProvider().fetchRates()).toHaveLength(2);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("throws after both international provider endpoints fail", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false, status: 503 }),
  );
  await expect(new FrankfurterProvider().fetchRates()).rejects.toThrow("503");
});
it("rejects failed Navasan responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  await expect(new NavasanProvider("test-key").fetchRates()).rejects.toThrow(
    "401",
  );
});
it("supports manual provider with no rates", async () => {
  expect(await new ManualFxProvider().fetchRates()).toEqual([]);
});
it("rejects zero or negative provider rates", () => {
  expect(() => parseFrankfurterV1({ rates: { TRY: 0 } })).toThrow(
    "non-positive",
  );
  expect(() =>
    parseFrankfurterV2([{ base: "USD", quote: "TRY", rate: -1 }]),
  ).toThrow("non-positive");
  expect(() => parseNavasan({ usd_sell: { value: 0 } })).toThrow(
    "non-positive",
  );
  expect(() => jumpPercent("0", "10")).toThrow("positive");
});
it("skips missing or unrelated international currencies", () => {
  expect(parseFrankfurterV1({ rates: {} })).toEqual([]);
  expect(parseFrankfurterV2([{ base: "EUR", quote: "TRY", rate: 40 }])).toEqual(
    [],
  );
});
