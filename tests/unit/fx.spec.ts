import { describe, expect, it } from "vitest";
import {
  exceedsJumpGuard,
  jumpPercent,
  parseFrankfurterV1,
  parseFrankfurterV2,
  parseNavasan,
  ManualFxProvider,
  isRateStale,
} from "@/modules/pricing";

describe("FX providers", () => {
  it("parses Frankfurter v2 rows", () => {
    const rates = parseFrankfurterV2([
      { date: "2026-09-09", base: "USD", quote: "TRY", rate: 41.25 },
      { date: "2026-09-09", base: "USD", quote: "CAD", rate: "1.38" },
    ]);
    expect(rates.map((x) => [x.quote, x.rate])).toEqual([
      ["TRY", "41.25"],
      ["CAD", "1.38"],
    ]);
  });

  it("parses the legacy fallback", () => {
    expect(parseFrankfurterV1({ rates: { TRY: 41, CAD: 1.4 } })).toHaveLength(
      2,
    );
  });

  it("keeps Navasan usd_sell in Toman without a Rial conversion", () => {
    expect(parseNavasan({ usd_sell: { value: "98500" } }).rate).toBe("98500");
  });

  it("blocks a 12% jump when the guard is 5%", () => {
    expect(jumpPercent("100", "112")).toBe("12");
    expect(exceedsJumpGuard("100", "112", "5")).toBe(true);
    expect(exceedsJumpGuard("100", "104.99", "5")).toBe(false);
  });

  it("rejects non-positive provider values", () => {
    expect(() =>
      parseFrankfurterV2([{ base: "USD", quote: "TRY", rate: 0 }]),
    ).toThrow();
    expect(() => parseFrankfurterV1({ rates: { TRY: -1 } })).toThrow();
    expect(() => parseNavasan({ usd_sell: { value: "0" } })).toThrow();
  });

  it("supports the manual provider and stale threshold", async () => {
    const rate = parseNavasan(
      { usd_buy: "90000" },
      "usd_buy",
      new Date("2026-01-01"),
    );
    expect(rate.sourceField).toBe("usd_buy");
    expect(await new ManualFxProvider([rate]).fetchRates()).toEqual([rate]);
    expect(
      isRateStale(
        new Date("2026-01-01T00:00:00Z"),
        6,
        new Date("2026-01-01T07:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isRateStale(
        new Date("2026-01-01T00:00:00Z"),
        6,
        new Date("2026-01-01T05:00:00Z"),
      ),
    ).toBe(false);
    expect(isRateStale(null, 6)).toBe(true);
  });
});
