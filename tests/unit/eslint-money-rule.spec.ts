import { describe, it, expect } from "vitest";

// Fix-order B1: assert the ESLint config carries the no-float rule for the
// money domains. Structural check against the exported flat config, not a
// text grep.
describe("ESLint money rule (B1)", () => {
  it("blocks Number(), parseFloat() and .toNumber() under src/modules/{pricing,fees,orders,finance}", async () => {
    // eslint.config.mjs is an untyped ESM module — dynamic specifier keeps tsc
    // from trying (and failing) to resolve its types.
    const specifier = "../../eslint.config.mjs";
    const mod = (await import(specifier)) as { default: unknown };
    const config = mod.default as Array<{
      files?: string[];
      rules?: Record<string, unknown>;
    }>;

    const entry = config.find(
      (c) =>
        Array.isArray(c.files) &&
        c.files.some((f) => f.includes("src/modules/pricing")) &&
        c.files.some((f) => f.includes("src/modules/fees")) &&
        c.files.some((f) => f.includes("src/modules/orders")) &&
        c.files.some((f) => f.includes("src/modules/finance")),
    );
    expect(entry, "no config entry scoped to the money modules").toBeDefined();

    const rule = entry!.rules?.["no-restricted-syntax"];
    expect(
      rule,
      "no-restricted-syntax not set for the money modules",
    ).toBeDefined();

    const serialized = JSON.stringify(rule);
    expect(serialized).toContain("'Number'");
    expect(serialized).toContain("parseFloat");
    expect(serialized).toContain("toNumber");
    expect(serialized.startsWith('["error"')).toBe(true);
  });
});
