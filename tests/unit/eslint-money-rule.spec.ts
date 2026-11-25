import { describe, it, expect } from "vitest";
import { ESLint, type Linter } from "eslint";

// Fix-order B1: assert the ESLint config carries the no-float rule for the
// money domains. Structural check against the exported flat config, not a
// text grep.
describe("ESLint money rule (B1)", () => {
  it("blocks Number(), parseFloat() and .toNumber() under src/modules/{pricing,fees,orders,finance,shipping}", async () => {
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
        c.files.some((f) => f.includes("src/modules/finance")) &&
        c.files.some((f) => f.includes("src/modules/shipping")),
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

  it.each(["pricing", "fees", "orders", "finance", "shipping", "promotions"])(
    "rejects every unsafe numeric conversion with the real linter in %s",
    async (domain) => {
      const specifier = "../../eslint.config.mjs";
      const config = (await import(specifier)) as { default: Linter.Config[] };
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: config.default,
      });
      const [result] = await eslint.lintText(
        "Number(amount); parseFloat(amount); amount.toNumber();",
        { filePath: `src/modules/${domain}/__money_regression.ts` },
      );
      expect(result.errorCount).toBe(3);
      expect(result.messages.map((message) => message.ruleId)).toEqual(
        Array(3).fill("no-restricted-syntax"),
      );
    },
  );

  it.each([
    ["src/modules/pricing/__decimal_regression.ts", "amount.plus(other);"],
    [
      "src/lib/__ordinary_number_regression.ts",
      "Number(amount); parseFloat(amount); amount.toNumber();",
    ],
  ])("retains the allowed numeric behavior in %s", async (filePath, code) => {
    const specifier = "../../eslint.config.mjs";
    const config = (await import(specifier)) as { default: Linter.Config[] };
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: config.default,
    });
    const [result] = await eslint.lintText(code, { filePath });
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });
});
