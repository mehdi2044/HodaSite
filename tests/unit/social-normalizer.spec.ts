import { describe, it, expect } from "vitest";
import { normalizeSocial } from "@/lib/social";

describe("normalizeSocial", () => {
  it("passes the current per-market shape through", () => {
    const shape = {
      IR: { instagram: "https://instagram.com/a", telegram: "https://t.me/a" },
      TR: { instagram: "https://instagram.com/b" },
      CA: {},
    };
    expect(normalizeSocial(shape)).toEqual(shape);
  });

  it("fills in a missing market with an empty object", () => {
    const shape = { IR: { instagram: "https://instagram.com/a" }, TR: {} };
    expect(normalizeSocial(shape)).toEqual({
      IR: { instagram: "https://instagram.com/a" },
      TR: {},
      CA: {},
    });
  });

  it("copies a legacy flat shape to every market without losing data", () => {
    const legacy = { instagram: "https://instagram.com/stylehub" };
    expect(normalizeSocial(legacy)).toEqual({
      IR: { instagram: "https://instagram.com/stylehub" },
      TR: { instagram: "https://instagram.com/stylehub" },
      CA: { instagram: "https://instagram.com/stylehub" },
    });
  });

  it("handles null/undefined/empty input", () => {
    const empty = { IR: {}, TR: {}, CA: {} };
    expect(normalizeSocial(null)).toEqual(empty);
    expect(normalizeSocial(undefined)).toEqual(empty);
    expect(normalizeSocial({})).toEqual(empty);
  });
});
