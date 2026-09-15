import { describe, it, expect } from "vitest";
import { analyticsIds, analyticsPublicPath, consentValid } from "@/lib/consent";
import { contrastRatio, themeContrastFailures } from "@/lib/contrast";
import {
  schemaOffer,
  productGraph,
  jsonLdText,
} from "@/modules/seo/structured";
import {
  applyLaunchEvidence,
  launchEvidenceInput,
  type Evidence,
} from "@/modules/launch/evidence";
const now = new Date("2026-09-15T12:00:00Z");
describe("privacy, evidence and structured data", () => {
  it("rejects malformed tracking IDs and defaults to disabled", () => {
    expect(analyticsIds({ ga4: '"><script>' })).toEqual({
      ga4: "",
      gtm: "",
      meta: "",
    });
    expect(analyticsIds({ ga4: "G-ABCD1234" }).ga4).toBe("G-ABCD1234");
  });
  it.each([
    "/en/account",
    "/fa/cart",
    "/tr/checkout",
    "/admin",
    "/en/login",
    "/en/m/TR/account",
    "/en/search",
  ])("never tracks private route %s", (path) =>
    expect(analyticsPublicPath(path)).toBe(false),
  );
  it.each(["/en", "/fa/m/IR/p/لباس", "/tr/c/elbise"])(
    "recognizes public route %s",
    (path) => expect(analyticsPublicPath(path)).toBe(true),
  );
  it("requires current explicit consent, rejects stale and future timestamps", () => {
    expect(
      consentValid(
        { accepted: true, version: "v1", at: now.getTime() },
        "v1",
        now.getTime(),
      ),
    ).toBe(true);
    for (const value of [
      null,
      {},
      { accepted: "yes", version: "v1", at: now.getTime() },
      { accepted: true, version: "v0", at: now.getTime() },
      { accepted: true, version: "v1", at: now.getTime() + 1 },
      { accepted: true, version: "v1", at: now.getTime() - 181 * 86400000 },
    ])
      expect(consentValid(value, "v1", now.getTime())).toBe(false);
  });
  it("converts toman exactly, retaining original CAD/TRY values", () => {
    expect(schemaOffer("123.4567", "IRT", true)).toMatchObject({
      price: "1234.567",
      priceCurrency: "IRR",
      availability: "https://schema.org/InStock",
    });
    expect(schemaOffer("0.0001", "CAD", false)).toMatchObject({
      price: "0.0001",
      priceCurrency: "CAD",
    });
  });
  it("omits empty aggregate ratings and escapes script termination", () => {
    const graph = productGraph({
      name: "</script>",
      description: "",
      images: [],
      category: { name: "x" },
      offers: [],
      rating: { count: 0, rating: null },
    });
    expect(graph["@graph"][0]).not.toHaveProperty("aggregateRating");
    expect(jsonLdText(graph)).not.toContain("</script>");
    expect(jsonLdText(graph)).toContain("\\u003c");
  });
  it("computes WCAG luminance with validated hex values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(
      themeContrastFailures({
        background: "#ffffff",
        surface: "#ffffff",
        text: "#ffffff",
      }).length,
    ).toBeGreaterThan(0);
  });
  const target = {
    origin: "https://staging.example.com",
    revision: "a".repeat(40),
  };
  const row: Evidence = {
    id: "e1",
    gate: "restoreDrill",
    environment: "staging",
    ...target,
    result: "PASS",
    testedAt: now,
    createdAt: now,
    reference: "report-fixture",
    notes: "Verified sample restore against its checksums.",
  };
  const check = {
    id: "restoreDrill",
    kind: "manual" as const,
    status: "pending" as const,
  };
  it("requires target origin, revision, real environment and fresh evidence", () => {
    expect(applyLaunchEvidence([check], [row], target, now)[0].status).toBe(
      "pass",
    );
    for (const change of [
      { environment: "local" as const },
      { environment: "ci" as const },
      { origin: "https://other.example.com" },
      { revision: "b".repeat(40) },
      { testedAt: new Date(now.getTime() + 1) },
      { testedAt: new Date(now.getTime() - 31 * 86400000) },
    ])
      expect(
        applyLaunchEvidence([check], [{ ...row, ...change }], target, now)[0]
          .status,
      ).toBe("pending");
  });
  it("a newer failure cannot be hidden behind a prior successful test", () => {
    expect(
      applyLaunchEvidence(
        [check],
        [
          row,
          {
            ...row,
            id: "e2",
            result: "FAIL",
            createdAt: new Date(now.getTime() + 1),
          },
        ],
        target,
        now,
      )[0].status,
    ).toBe("blocked");
  });
  it("rejects invented gates, credential-bearing origins and incomplete revisions", () => {
    for (const change of [
      { gate: "all" },
      { origin: "https://user:pass@example.com" },
      { revision: "latest" },
    ])
      expect(launchEvidenceInput.safeParse({ ...row, ...change }).success).toBe(
        false,
      );
  });
});
