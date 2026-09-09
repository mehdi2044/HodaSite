import { describe, expect, it } from "vitest";
import { slugsAreUnique } from "@/modules/catalog";

describe("localized catalog slug uniqueness", () => {
  const existing = [
    { fa: "پیراهن-کتان", tr: "keten-gomlek", en: "linen-shirt" },
  ];

  it("accepts a completely new localized slug set", () => {
    expect(
      slugsAreUnique(
        { fa: "شلوار-راسته", tr: "duz-pantolon", en: "straight-trousers" },
        existing,
      ),
    ).toBe(true);
  });

  it("rejects a collision in any locale", () => {
    expect(
      slugsAreUnique(
        { fa: "شلوار-راسته", tr: "keten-gomlek", en: "straight-trousers" },
        existing,
      ),
    ).toBe(false);
  });
});
