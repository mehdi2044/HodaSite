import { describe, expect, it } from "vitest";
import {
  assertAllocation,
  assertLegTransition,
  allItemsDelivered,
  shipmentStatus,
  trackingUrl,
  validTrackingTemplate,
  legUpdateSchema,
} from "@/modules/shipping/validation";
import { legValues } from "../helpers/shipping";
describe("shipping business invariants", () => {
  it.each([
    "javascript:alert({tracking})",
    "http://example.com/{tracking}",
    "https://{tracking}.example.com/",
    "https://user:password@example.com/{tracking}",
    "https://example.com/#/{tracking}",
    "https://example.com/track",
    "https://example.com/\\{tracking}",
    "//example.com/{tracking}",
  ])("rejects unsafe tracking template %s", (url) =>
    expect(validTrackingTemplate(url)).toBe(false),
  );
  it("escapes tracking identifiers and only permits HTTPS path/query templates", () => {
    expect(trackingUrl("https://example.com/?id={tracking}", "a/#?&x=1")).toBe(
      "https://example.com/?id=a%2F%23%3F%26x%3D1",
    );
    expect(trackingUrl("", "123")).toBeNull();
    expect(trackingUrl("https://example.com/{tracking}", "")).toBeNull();
  });
  it("allows partial allocations but rejects duplicates, foreign items and overshipment", () => {
    const ordered = [{ id: "a", quantity: 3 }],
      allocated = [{ orderItemId: "a", quantity: 1 }];
    expect(() =>
      assertAllocation(ordered, allocated, [{ orderItemId: "a", quantity: 2 }]),
    ).not.toThrow();
    for (const requested of [
      [{ orderItemId: "a", quantity: 3 }],
      [{ orderItemId: "b", quantity: 1 }],
      [
        { orderItemId: "a", quantity: 1 },
        { orderItemId: "a", quantity: 1 },
      ],
    ])
      expect(() => assertAllocation(ordered, allocated, requested)).toThrow(
        "SHIPPING_QUANTITY",
      );
  });
  it("rejects skipping departure and reversing delivered legs, but permits retry after failure", () => {
    expect(() => assertLegTransition("PENDING", "DELIVERED")).toThrow(
      "SHIPPING_STATE",
    );
    expect(() => assertLegTransition("DELIVERED", "IN_TRANSIT")).toThrow(
      "SHIPPING_STATE",
    );
    expect(() => assertLegTransition("FAILED", "IN_TRANSIT")).not.toThrow();
  });
  it("never marks partial delivery or an empty order delivered", () => {
    const items = [{ orderItemId: "a", quantity: 1 }];
    expect(
      allItemsDelivered(
        [{ id: "a", quantity: 2 }],
        [{ status: "DELIVERED", items }],
      ),
    ).toBe(false);
    expect(
      allItemsDelivered(
        [{ id: "a", quantity: 2 }],
        [
          { status: "DELIVERED", items },
          { status: "CANCELLED", items },
        ],
      ),
    ).toBe(false);
    expect(
      allItemsDelivered(
        [{ id: "a", quantity: 2 }],
        [
          { status: "DELIVERED", items },
          { status: "DELIVERED", items },
        ],
      ),
    ).toBe(true);
    expect(allItemsDelivered([], [])).toBe(false);
  });
  it("rolls up only active legs and retains failure until retry", () => {
    expect(
      shipmentStatus([
        { status: "CANCELLED", shippedAt: null },
        { status: "PENDING", shippedAt: null },
      ]),
    ).toBe("PENDING");
    expect(
      shipmentStatus([
        { status: "DELIVERED", shippedAt: new Date() },
        { status: "PENDING", shippedAt: null },
      ]),
    ).toBe("IN_TRANSIT");
    expect(shipmentStatus([{ status: "FAILED", shippedAt: new Date() }])).toBe(
      "FAILED",
    );
    expect(() =>
      shipmentStatus([{ status: "CANCELLED", shippedAt: null }]),
    ).toThrow("SHIPPING_LAST_LEG");
  });
  it.each(["-1", "NaN", "1e3", "1.00001", "100000000000000", "1,00"])(
    "rejects invalid decimal money %s",
    (costAmount) =>
      expect(
        legUpdateSchema.safeParse({ ...legValues(), costAmount }).success,
      ).toBe(false),
  );
  it("preserves four-place money strings and interprets form dates explicitly as UTC", () => {
    const data = legUpdateSchema.parse({
      ...legValues(),
      shippedAt: "2026-09-10T12:34",
    });
    expect(data.costAmount).toBe("12.3456");
    expect(data.shippedAt?.toISOString()).toBe("2026-09-10T12:34:00.000Z");
  });
});
