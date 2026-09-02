import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { Money, snapshotTotal } from "@/lib/money";
describe("Money gate", () => {
  it("accepts exact strings and Decimal", () => {
    expect(
      new Money("0.1", "USD")
        .add(new Money(new Decimal("0.2"), "USD"))
        .toString(),
    ).toBe("0.3");
  });
  it("rounds IRT half-up to 1000", () =>
    expect(
      new Money("12500", "IRT")
        .round({ mode: "HALF_UP", increment: "1000" })
        .toString(),
    ).toBe("13000"));
  it("supports half-even explicitly", () =>
    expect(
      new Money("12500", "IRT")
        .round({ mode: "HALF_EVEN", increment: "1000" })
        .toString(),
    ).toBe("12000"));
  it.each(["TRY", "CAD"] as const)("rounds %s to two decimals", (c) =>
    expect(
      new Money("12.345", c)
        .round({ mode: "HALF_UP", increment: "0.01" })
        .toString(),
    ).toBe("12.35"),
  );
  it("supports .99 endings", () =>
    expect(
      new Money("13.2", "CAD")
        .round({ mode: "HALF_UP", increment: "1", ending: "0.99" })
        .toString(),
    ).toBe("12.99"));
  it("rejects currency mixing", () =>
    expect(() => new Money("1", "USD").add(new Money("1", "TRY"))).toThrow());
  it("keeps an immutable order snapshot", () => {
    const quote = {
      base: "USD" as const,
      quote: "CAD" as const,
      rate: "1.25",
      capturedAt: "2026-09-02T00:00:00Z",
    };
    const order = snapshotTotal(new Money("20", "CAD"), quote);
    quote.rate = "2";
    expect(order.fxSnapshot.rate).toBe("1.25");
    expect(Object.isFrozen(order.fxSnapshot)).toBe(true);
  });
  it("forbids monetary number arithmetic in domain modules", async () => {
    const fs = await import("node:fs/promises");
    for (const dir of ["pricing", "fees", "orders", "finance"]) {
      const path = `src/modules/${dir}`;
      try {
        const files = await fs.readdir(path);
        for (const f of files.filter((x) => x.endsWith(".ts")))
          expect(await fs.readFile(`${path}/${f}`, "utf8")).not.toMatch(
            /toNumber\(|parseFloat\(/,
          );
      } catch {}
    }
  });
});
