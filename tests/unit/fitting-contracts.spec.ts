import { describe, expect, it } from "vitest";
import {
  allocate,
  configSchema,
  dayBounds,
  rewardAmount,
  requestSchema,
} from "@/modules/fitting/contracts";
import { formatServiceUnits } from "@/modules/catalog/format";
import { categoryPathLabel } from "@/modules/catalog/tree";
describe("optional fitting-room contracts", () => {
  it("starts disabled and keeps a fractional service cost", () => {
    const c = configSchema.parse({});
    expect(c.enabled).toBe(false);
    expect(c.coinSalesEnabled).toBe(false);
    expect(c.costCoins).toBe("12.5");
  });
  it.each([
    "-1",
    "0",
    "0.00000",
    "12.55555",
    "1e3",
    "99999999999",
    "",
    "invalid",
    "1.2.3",
  ])("rejects unsafe generation cost %s", (cost) => {
    expect(configSchema.safeParse({ costCoins: cost }).success).toBe(false);
  });
  it("requires confirmation, quoted charge and unique variants", () => {
    const r = {
      requestKey: "2b5c8b48-4ad6-4826-a58f-aa2433e0a443",
      modelId: "woman",
      variantIds: ["tee"],
      confirm: true,
      expectedCostCoins: "12.5",
    };
    expect(requestSchema.safeParse(r).success).toBe(true);
    expect(requestSchema.safeParse({ ...r, confirm: false }).success).toBe(
      false,
    );
    expect(
      requestSchema.safeParse({ ...r, expectedCostCoins: undefined }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...r, variantIds: ["tee", "tee"] }).success,
    ).toBe(false);
  });
  it("allocates fractional coins exactly and rejects insufficient balance", () => {
    expect(
      allocate("12.5", [
        { id: "daily", balance: "10.0001" },
        { id: "pack", balance: "100" },
      ]),
    ).toEqual([
      { grantId: "daily", amount: "10.0001" },
      { grantId: "pack", amount: "2.4999" },
    ]);
    expect(() =>
      allocate("12.5", [{ id: "daily", balance: "12.4999" }]),
    ).toThrow("INSUFFICIENT_COINS");
  });
  it("caps extreme purchase rewards within numeric(18,4) without rounding normal rewards up", () => {
    expect(rewardAmount("100", "0.0001", "9999999999")).toBe(
      "99999999999999.9999",
    );
    expect(rewardAmount("0", "0.0001", "9999999999")).toBe("0");
  });
  it("never rounds purchases up to an unearned reward", () => {
    expect(rewardAmount("199.9999", "100", "12.5")).toBe("12.5");
    expect(rewardAmount("200", "100", "12.5")).toBe("25");
  });
  it.each([
    ["2026-03-08T12:00:00Z", 23],
    ["2026-11-01T12:00:00Z", 25],
  ])(
    "expires daily credits at timezone midnight across DST: %s",
    (now, hours) => {
      const d = dayBounds(new Date(now), "America/Toronto");
      expect((d.end.getTime() - d.start.getTime()) / 3600000).toBe(hours);
      expect(new Date(now) >= d.start && new Date(now) < d.end).toBe(true);
    },
  );
  it("retains large fractional balances without floating point conversion", () => {
    expect(formatServiceUnits("99999999999999.9999", "en")).toBe(
      "99,999,999,999,999.9999",
    );
    expect(formatServiceUnits("12.5", "fa")).toBe("۱۲٫۵");
  });
  it("labels deep categories without a fixed depth limit and terminates cycles", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      parentId: i ? String(i - 1) : null,
      titleI18n: { en: String(i) },
    }));
    expect(categoryPathLabel(rows, "199", "en").split(" / ")).toHaveLength(200);
    rows[0].parentId = "199";
    expect(categoryPathLabel(rows, "199", "en").split(" / ")).toHaveLength(200);
  });
});
