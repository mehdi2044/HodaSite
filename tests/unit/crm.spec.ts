import { describe, it, expect } from "vitest";
import {
  calculateMetrics,
  metricsSchema,
  segmentSchema,
  validTransition,
} from "@/modules/crm/contracts";
import { segmentQuery } from "@/modules/crm/segment-query";
import { privateSeoPath } from "@/lib/seo-urls";
import { analyticsPublicPath } from "@/lib/consent";
const config = {
  name: "Example",
  recencyDays: [30, 60, 90, 180],
  frequency: [1, 3, 5, 10],
  monetaryUsd: ["50", "100", "250", "500"],
  churnDays: 180,
};
describe("CRM deterministic contracts", () => {
  it("preserves decimal arithmetic and classifies exact thresholds", () => {
    const result = calculateMetrics(
      { count: 3, valueUsd: "100.0001", lastPaidAt: new Date("2026-01-01") },
      config,
      new Date("2026-01-31"),
    );
    expect(result).toMatchObject({
      aovUsd: "33.3334",
      historicalClvUsd: "100.0001",
      rfm: [5, 3, 3],
      churn: "active",
      recencyDays: 30,
    });
  });
  it("uses safe unclassified defaults and zero-purchase behavior", () => {
    expect(
      calculateMetrics({ count: 0, valueUsd: "0", lastPaidAt: null }, config),
    ).toMatchObject({ aovUsd: "0.0000", rfm: null, churn: "unclassified" });
    expect(
      calculateMetrics(
        { count: 3, valueUsd: "100", lastPaidAt: new Date() },
        null,
      ).rfm,
    ).toBeNull();
  });
  it("does not infer predictions or silently sort malformed thresholds", () => {
    expect(
      metricsSchema.safeParse({ ...config, frequency: [5, 1, 3, 10] }).success,
    ).toBe(false);
    expect(
      calculateMetrics(
        { count: 1, valueUsd: "50", lastPaidAt: new Date("2026-01-01") },
        config,
        new Date("2026-06-30"),
      ).churn,
    ).toBe("atRisk");
  });
  it("rejects SQL, unknown versions, unbounded conditions, numeric floats and negative amounts", () => {
    for (const v of [
      { version: 2, rules: [] },
      { version: 1, rules: [], sql: "SELECT 1" },
      { version: 1, rules: [{ field: "value", op: "gte", value: 1.2 }] },
      { version: 1, rules: [{ field: "value", op: "gte", value: "-1" }] },
      { version: 1, rules: Array(13).fill({ field: "locale", value: "en" }) },
    ])
      expect(segmentSchema.safeParse(v).success).toBe(false);
  });
  it("binds adversarial tags as values, never SQL", () => {
    const payload = "' OR true --";
    const query = segmentQuery("TR", {
      version: 1,
      rules: [{ field: "tag", value: payload }],
    });
    expect(query.sql).not.toContain(payload);
    expect(query.values).toContain(payload);
  });
  it("review states never claim deletion fulfillment and customer cannot self-approve", () => {
    expect(validTransition("REQUESTED", "APPROVED")).toBe(false);
    expect(validTransition("IN_REVIEW", "APPROVED")).toBe(true);
    expect(validTransition("IN_REVIEW", "APPROVED", true)).toBe(false);
    expect(validTransition("APPROVED", "FULFILLED")).toBe(false);
    expect(validTransition("REQUESTED", "CANCELLED", true)).toBe(true);
  });
  it.each(["fa", "tr", "en"])(
    "keeps %s unsubscribe private and analytics-free",
    (l) => {
      expect(privateSeoPath(`/${l}/unsubscribe`)).toBe(true);
      expect(analyticsPublicPath(`/${l}/unsubscribe`)).toBe(false);
    },
  );
});
