import { describe, expect, it } from "vitest";
import {
  chargeableWeightKg,
  computeFees,
  parseFeeRuleParams,
  type FeeRuleInput,
} from "@/modules/fees";

const active = {
  priority: 0,
  isActive: true,
  validFrom: new Date("2026-01-01"),
} as const;

describe("fees engine", () => {
  it("calculates CA 3kg: 20 to 2kg + 6 extra; customs 8%", () => {
    const rules: FeeRuleInput[] = [
      {
        ...active,
        id: "shipping",
        type: "SHIPPING",
        method: "WEIGHT_BRACKET",
        params: { brackets: [{ uptoKg: "2", amount: "20" }], extraPerKg: "6" },
      },
      {
        ...active,
        id: "customs",
        type: "CUSTOMS",
        method: "PERCENT",
        params: { percent: "8", of: "subtotal" },
      },
    ];
    const quote = computeFees(rules, {
      currency: "CAD",
      volumetricDivisor: "5000",
      items: [{ quantity: 1, unitPrice: "200", weightGrams: 3000 }],
    });
    expect(quote.lines.map((line) => [line.type, line.amount])).toEqual([
      ["SHIPPING", "26"],
      ["CUSTOMS", "16"],
    ]);
    expect(quote.total).toBe("242");
  });

  it("chooses a city rule over a country-wide rule", () => {
    const rules: FeeRuleInput[] = [
      {
        ...active,
        id: "tr",
        type: "SHIPPING",
        method: "FIXED",
        params: { amount: "150" },
      },
      {
        ...active,
        id: "istanbul",
        type: "SHIPPING",
        method: "FIXED",
        params: { amount: "90" },
        city: "Istanbul",
      },
    ];
    const result = computeFees(rules, {
      currency: "TRY",
      city: "Istanbul",
      volumetricDivisor: "5000",
      items: [{ quantity: 1, unitPrice: "1000", weightGrams: 200 }],
    });
    expect(result.lines[0]?.ruleId).toBe("istanbul");
  });

  it("turning a rule off removes it", () => {
    const quote = computeFees(
      [
        {
          ...active,
          id: "off",
          type: "SHIPPING",
          method: "FIXED",
          params: { amount: "10" },
          isActive: false,
        },
      ],
      {
        currency: "TRY",
        volumetricDivisor: "5000",
        items: [{ quantity: 1, unitPrice: "1", weightGrams: 1 }],
      },
    );
    expect(quote.lines).toHaveLength(0);
  });

  it("uses the greater of actual and volumetric weight", () => {
    expect(
      chargeableWeightKg(
        [
          {
            quantity: 1,
            unitPrice: "1",
            weightGrams: 1000,
            lengthCm: "50",
            widthCm: "40",
            heightCm: "30",
          },
        ],
        "5000",
      ).toFixed(),
    ).toBe("12");
  });

  it("returns the localized rule label and ignores another currency", () => {
    const quote = computeFees(
      [
        {
          ...active,
          id: "shipping",
          type: "SHIPPING",
          method: "FIXED",
          params: { amount: "150" },
          currency: "TRY",
          labelI18n: { fa: "ارسال", en: "Shipping" },
        },
        {
          ...active,
          id: "wrong-currency",
          type: "CUSTOMS",
          method: "FIXED",
          params: { amount: "99" },
          currency: "CAD",
        },
      ],
      {
        currency: "TRY",
        locale: "fa",
        volumetricDivisor: "5000",
        items: [{ quantity: 1, unitPrice: "100", weightGrams: 1 }],
      },
    );
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]?.label).toBe("ارسال");
  });

  it("supports percent bases, absorbed fees and deterministic ordering", () => {
    const rules: FeeRuleInput[] = [
      {
        ...active,
        id: "tax",
        type: "TAX",
        method: "PERCENT",
        params: { percent: "10", of: "subtotal_plus_shipping_customs" },
      },
      {
        ...active,
        id: "customs",
        taxable: true,
        type: "CUSTOMS",
        method: "FIXED",
        params: { amount: "20" },
        absorb: true,
      },
      {
        ...active,
        id: "shipping",
        taxable: true,
        type: "SHIPPING",
        method: "FIXED",
        params: { amount: "10" },
      },
      {
        ...active,
        id: "service",
        type: "SERVICE",
        method: "PERCENT",
        params: { percent: "5", of: "subtotal_plus_shipping" },
      },
    ];
    const quote = computeFees(rules, {
      currency: "CAD",
      volumetricDivisor: "5000",
      items: [{ quantity: 1, unitPrice: "100", weightGrams: 1 }],
    });
    expect(quote.lines.map((line) => line.type)).toEqual([
      "SHIPPING",
      "CUSTOMS",
      "SERVICE",
      "TAX",
    ]);
    expect(quote.lines.map((line) => line.amount)).toEqual([
      "10",
      "20",
      "5.5",
      "13",
    ]);
    expect(quote.total).toBe("128.5");
  });

  it("supports per-item, per-kg, value brackets and min/max caps", () => {
    const context = {
      currency: "TRY",
      volumetricDivisor: "5000",
      items: [{ quantity: 2, unitPrice: "40", weightGrams: 250 }],
    } as const;
    expect(
      computeFees(
        [
          {
            ...active,
            id: "item",
            type: "SERVICE",
            method: "PER_ITEM",
            params: { amount: "3" },
          },
        ],
        context,
      ).lines[0]?.amount,
    ).toBe("6");
    expect(
      computeFees(
        [
          {
            ...active,
            id: "kg",
            type: "SHIPPING",
            method: "PER_KG",
            params: { perKg: "8", minKg: "2" },
          },
        ],
        context,
      ).lines[0]?.amount,
    ).toBe("16");
    expect(
      computeFees(
        [
          {
            ...active,
            id: "value",
            type: "CUSTOMS",
            method: "VALUE_BRACKET",
            params: { brackets: [{ uptoAmount: "100", percent: "12.5" }] },
            minAmount: "15",
            maxAmount: "20",
          },
        ],
        context,
      ).lines[0]?.amount,
    ).toBe("15");
  });

  it("uses extra-per-kg after the last weight bracket", () => {
    const quote = computeFees(
      [
        {
          ...active,
          id: "weight",
          type: "SHIPPING",
          method: "WEIGHT_BRACKET",
          params: {
            brackets: [{ uptoKg: "2", amount: "20" }],
            extraPerKg: "6",
          },
        },
      ],
      {
        currency: "CAD",
        volumetricDivisor: "5000",
        items: [{ quantity: 1, unitPrice: "1", weightGrams: 4500 }],
      },
    );
    expect(quote.lines[0]?.amount).toBe("35");
  });

  it("honours validity, postal and category scopes", () => {
    const rules: FeeRuleInput[] = [
      {
        ...active,
        id: "expired",
        type: "SHIPPING",
        method: "FIXED",
        params: { amount: "1" },
        validUntil: new Date("2026-02-01"),
      },
      {
        ...active,
        id: "postal",
        type: "SHIPPING",
        method: "FIXED",
        params: { amount: "2" },
        postalPrefix: "34",
        categoryIds: ["cat"],
      },
    ];
    const quote = computeFees(rules, {
      currency: "TRY",
      now: new Date("2026-03-01"),
      postalCode: "34000",
      volumetricDivisor: "5000",
      items: [
        { quantity: 1, unitPrice: "1", weightGrams: 1, categoryId: "cat" },
      ],
    });
    expect(quote.lines[0]?.ruleId).toBe("postal");
  });

  it("validates every method-specific parameter contract", () => {
    expect(parseFeeRuleParams("FIXED", { amount: "10" })).toEqual({
      amount: "10",
    });
    expect(
      parseFeeRuleParams("PERCENT", { percent: "8", of: "subtotal" }),
    ).toEqual({ percent: "8", of: "subtotal" });
    expect(parseFeeRuleParams("PER_KG", { perKg: "3", minKg: "1" })).toEqual({
      perKg: "3",
      minKg: "1",
    });
    expect(
      parseFeeRuleParams("WEIGHT_BRACKET", {
        brackets: [{ uptoKg: "2", amount: "20" }],
        extraPerKg: "6",
      }),
    ).toBeTruthy();
    expect(
      parseFeeRuleParams("VALUE_BRACKET", {
        brackets: [{ uptoAmount: "100", amount: "5" }],
      }),
    ).toBeTruthy();
    expect(parseFeeRuleParams("PER_ITEM", { amount: "2" })).toEqual({
      amount: "2",
    });
    expect(() =>
      parseFeeRuleParams("VALUE_BRACKET", {
        brackets: [{ uptoAmount: "100", amount: "5", percent: "2" }],
      }),
    ).toThrow();
  });
});

describe("taxable fee settings", () => {
  it.each([false, true])("honors shipping taxable=%s", (taxable) => {
    const result = computeFees(
      [
        {
          ...active,
          id: "shipping",
          type: "SHIPPING",
          method: "FIXED",
          params: { amount: "20" },
          taxable,
        },
        {
          ...active,
          id: "customs",
          type: "CUSTOMS",
          method: "FIXED",
          params: { amount: "30" },
          taxable: false,
        },
        {
          ...active,
          id: "tax",
          type: "TAX",
          method: "PERCENT",
          params: { percent: "10", of: "subtotal_plus_shipping_customs" },
        },
      ],
      {
        currency: "CAD",
        volumetricDivisor: "5000",
        items: [{ quantity: 1, unitPrice: "100", weightGrams: 100 }],
      },
    );
    expect(result.lines.find((line) => line.type === "TAX")?.amount).toBe(
      taxable ? "12" : "10",
    );
  });
});
