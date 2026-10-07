import { describe, expect, it } from "vitest";
import { computeFees, type FeeRuleInput } from "@/modules/fees";
import {
  promotionOrderAmounts,
  orderDiscountLines,
} from "@/modules/promotions";
import { returnAmount } from "@/modules/returns/validation";
import { invoiceHtml } from "@/modules/orders/invoices/document";
import { invoiceDocument } from "../helpers/invoice";

const rules: FeeRuleInput[] = [
  {
    id: "shipping",
    type: "SHIPPING",
    method: "FIXED",
    params: { amount: "20" },
    taxable: true,
  },
  {
    id: "customs",
    type: "CUSTOMS",
    method: "PERCENT",
    params: { percent: "5" },
  },
  {
    id: "tax",
    type: "TAX",
    method: "PERCENT",
    params: { percent: "10", of: "subtotal_plus_shipping" },
  },
].map((r) => ({
  priority: 0,
  isActive: true,
  validFrom: new Date("2020-01-01"),
  ...r,
})) as FeeRuleInput[];
const ctx = {
  currency: "CAD",
  volumetricDivisor: "5000",
  items: [{ quantity: 2, unitPrice: "50", weightGrams: 100 }],
};
const order = () => ({
  currency: "CAD",
  discountAmount: "55",
  items: [
    { id: "a", variantId: "va", lineTotalAmount: "30" },
    { id: "b", variantId: "vb", lineTotalAmount: "20" },
  ],
  fees: [{ id: "s", type: "SHIPPING", absorbed: false, amount: "40" }],
  promotionEvaluation: {
    result: {
      discountTotal: "55",
      lines: [
        {
          target: "MERCHANDISE",
          currency: "CAD",
          amount: "15",
          allocations: [{ variantId: "va", amount: "15" }],
        },
        { target: "SHIPPING", currency: "CAD", amount: "40", allocations: [] },
      ],
    },
  },
});
describe("D73 tax, returns and public evidence", () => {
  it("keeps gross merchandise and customs but taxes net merchandise and charged shipping", () => {
    const q = computeFees(rules, {
      ...ctx,
      promotionTax: { merchandise: "25", shipping: "20" },
    });
    expect(q.subtotal).toBe("100");
    expect(q.lines.map((l) => l.amount)).toEqual(["20", "5", "7.5"]);
    expect(q.total).toBe("132.5"); // subtract explicit 45 discount at quote boundary
  });
  it("retains no-promotion fee behavior", () => {
    expect(computeFees(rules, ctx)).toEqual(
      computeFees(rules, {
        ...ctx,
        promotionTax: { merchandise: "0", shipping: "0" },
      }),
    );
  });
  it.each(["subtotal_plus_shipping", "subtotal_plus_shipping_customs"])(
    "excludes absorbed shipping from the promotion tax base %s",
    (of) => {
      const configured = rules.map((r) =>
        r.type === "SHIPPING"
          ? { ...r, absorb: true }
          : r.type === "CUSTOMS"
            ? { ...r, taxable: true }
            : { ...r, params: { ...r.params, of } },
      );
      for (const merchandise of ["0", "25"]) {
        const q = computeFees(configured, {
          ...ctx,
          promotionTax: { merchandise, shipping: "0" },
        });
        expect(q.lines[0]).toMatchObject({
          amount: "20",
          chargedAmount: "0",
          absorbed: true,
        });
        const tax =
          merchandise === "25"
            ? of.endsWith("customs")
              ? "8"
              : "7.5"
            : of.endsWith("customs")
              ? "10.5"
              : "10";
        expect(q.lines.at(-1)?.amount).toBe(tax);
        expect(q.lines[1].amount).toBe("5");
      }
      // The legacy standalone fee contract still taxes configured amounts.
      expect(computeFees(configured, ctx).lines.at(-1)?.amount).toBe(
        of.endsWith("customs") ? "12.5" : "12",
      );
    },
  );
  it("does not reduce a fixed tax or add a shipping deduction when shipping is not taxable", () => {
    expect(
      computeFees(
        rules.map((r) =>
          r.type === "SHIPPING" ? { ...r, taxable: false } : r,
        ),
        { ...ctx, promotionTax: { merchandise: "25", shipping: "20" } },
      ).lines.at(-1)?.amount,
    ).toBe("7.5");
    expect(
      computeFees(
        rules.map((r) =>
          r.type === "TAX"
            ? { ...r, method: "FIXED", params: { amount: "12" } }
            : r,
        ),
        { ...ctx, promotionTax: { merchandise: "25", shipping: "20" } },
      ).lines.at(-1)?.amount,
    ).toBe("12");
  });
  it("keeps merchandise return budgets independent of shipping and selected-item allocation", () => {
    const p = promotionOrderAmounts(order())!;
    expect(p.merchandise.toFixed(4)).toBe("15.0000");
    expect(p.netItems.get("a")?.toFixed(4)).toBe("15.0000");
    expect(p.netItems.get("b")?.toFixed(4)).toBe("20.0000");
    expect(p.netShipping.get("s")?.toFixed(4)).toBe("0.0000");
  });
  it("conserves partial-return remainders and zero gift budgets", () => {
    const first = returnAmount("10", 3, 0, "0", 1);
    const second = returnAmount("10", 3, 1, first, 1);
    const last = returnAmount("10", 3, 2, first.add(second), 1);
    expect(first.add(second).add(last).toFixed(4)).toBe("10.0000");
    expect(last.toFixed(4)).toBe("3.3334");
    expect(returnAmount("0", 1, 0, "0", 1).toFixed(4)).toBe("0.0000");
  });
  it("does not reinterpret legacy orders", () => {
    expect(
      promotionOrderAmounts({ ...order(), promotionEvaluation: null }),
    ).toBeNull();
  });
  it.each(["currency", "amount", "allocation", "shipping", "variant"])(
    "fails closed on corrupt %s evidence",
    (kind) => {
      const o = order();
      if (kind === "currency")
        o.promotionEvaluation.result.lines[0].currency = "TRY";
      if (kind === "amount") o.discountAmount = "54";
      if (kind === "allocation")
        o.promotionEvaluation.result.lines[0].allocations[0].amount = "14";
      if (kind === "shipping") o.fees[0].amount = "39";
      if (kind === "variant")
        o.promotionEvaluation.result.lines[0].allocations[0].variantId =
          "unknown";
      expect(() => promotionOrderAmounts(o)).toThrow();
    },
  );
  it.each(["fa", "tr", "en"] as const)(
    "renders escaped immutable %s invoice discounts",
    (locale) => {
      const lines = orderDiscountLines(
        [
          {
            id: "d",
            snapshot: {
              amount: "10.5000",
              titleI18n: { fa: "<تخفیف>", tr: "<İndirim>", en: "<Discount>" },
            },
          },
        ],
        locale,
      );
      const html = invoiceHtml(
        { ...invoiceDocument(locale), discounts: lines },
        1,
        "",
      );
      expect(html).toContain("&lt;");
      expect(html).toContain(
        locale === "fa" ? "تخفیف" : locale === "tr" ? "İndirim" : "Discount",
      );
      expect(html).not.toContain("<Discount>");
    },
  );
});
