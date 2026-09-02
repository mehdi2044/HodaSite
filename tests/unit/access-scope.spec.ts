import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: () => findUnique() } },
}));

import { can, scopeMatches } from "@/modules/access";

describe("scopeMatches (B2)", () => {
  it("an unscoped grant covers every request", () => {
    expect(scopeMatches(null, undefined)).toBe(true);
    expect(scopeMatches(undefined, { marketId: "tr" })).toBe(true);
    expect(scopeMatches({}, { marketId: "tr" })).toBe(true);
  });

  it("a scoped grant matches only when every grant key equals the request", () => {
    expect(scopeMatches({ marketId: "tr" }, { marketId: "tr" })).toBe(true);
    expect(
      scopeMatches({ marketId: "tr" }, { marketId: "tr", section: "catalog" }),
    ).toBe(true);
    expect(
      scopeMatches(
        { marketId: "tr", section: "catalog" },
        { marketId: "tr", section: "catalog" },
      ),
    ).toBe(true);
  });

  it("a scoped grant does not match an out-of-scope or unscoped request", () => {
    expect(scopeMatches({ marketId: "tr" }, { marketId: "ca" })).toBe(false);
    expect(scopeMatches({ marketId: "tr" }, undefined)).toBe(false);
    expect(scopeMatches({ marketId: "tr" }, { section: "catalog" })).toBe(
      false,
    );
    expect(
      scopeMatches({ marketId: "tr", section: "catalog" }, { marketId: "tr" }),
    ).toBe(false);
  });
});

function user(overrides: unknown[], roles: unknown[]) {
  return { isActive: true, overrides, roles };
}

describe("can() with scope (B2)", () => {
  beforeEach(() => findUnique.mockReset());

  it("inactive users are always denied", async () => {
    findUnique.mockResolvedValue({ isActive: false, overrides: [], roles: [] });
    expect(await can("u", "catalog.product.edit")).toBe(false);
  });

  it("grants a scoped role only inside its scope", async () => {
    findUnique.mockResolvedValue(
      user(
        [],
        [
          {
            scope: { marketId: "tr" },
            role: { permissions: [{ permission: "catalog.product.edit" }] },
          },
        ],
      ),
    );
    expect(await can("u", "catalog.product.edit", { marketId: "tr" })).toBe(
      true,
    ); // positive: in scope
    expect(await can("u", "catalog.product.edit", { marketId: "ca" })).toBe(
      false,
    ); // negative: out of scope
    expect(await can("u", "catalog.product.edit")).toBe(false); // negative: request has no scope
  });

  it("an unscoped role covers every scope", async () => {
    findUnique.mockResolvedValue(
      user([], [{ scope: null, role: { permissions: [{ permission: "*" }] } }]),
    );
    expect(await can("u", "anything", { marketId: "ca" })).toBe(true);
    expect(await can("u", "anything")).toBe(true);
  });

  it("a scoped deny override blocks only inside its scope", async () => {
    findUnique.mockResolvedValue(
      user(
        [
          {
            permission: "catalog.product.edit",
            allow: false,
            scope: { marketId: "tr" },
          },
        ],
        [{ scope: null, role: { permissions: [{ permission: "*" }] } }],
      ),
    );
    expect(await can("u", "catalog.product.edit", { marketId: "tr" })).toBe(
      false,
    ); // deny wins in scope
    expect(await can("u", "catalog.product.edit", { marketId: "ca" })).toBe(
      true,
    ); // override doesn't reach here; "*" still grants
  });
});
