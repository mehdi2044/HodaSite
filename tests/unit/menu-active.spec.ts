import { describe, expect, it } from "vitest";
import { menuLinkIsActive } from "../../src/lib/menu-active";

describe("market-aware menu active state", () => {
  it.each(["fa", "tr", "en"])(
    "keeps %s journal active for its articles",
    (locale) => {
      const journal = `/${locale}/m/IR/magazine`;
      expect(menuLinkIsActive(journal, journal + "/story")).toBe(true);
      expect(menuLinkIsActive(journal, journal + "/")).toBe(true);
      expect(menuLinkIsActive(journal, `/${locale}/magazine/story`)).toBe(true);
      expect(menuLinkIsActive(journal, `/${locale}/m/TR/magazine`)).toBe(false);
    },
  );
  it("respects segment, language and external-link boundaries", () => {
    expect(
      menuLinkIsActive("/en/m/CA/magazine", "/en/m/CA/magazine-extra"),
    ).toBe(false);
    expect(menuLinkIsActive("/en/m/CA/magazine", "/tr/m/CA/magazine")).toBe(
      false,
    );
    expect(
      menuLinkIsActive("//other.invalid/en/magazine", "/en/magazine"),
    ).toBe(false);
    expect(
      menuLinkIsActive("https://other.invalid/en/magazine", "/en/magazine"),
    ).toBe(false);
    expect(menuLinkIsActive("/en/m/CA/magazine?view=all#top", null)).toBe(
      false,
    );
    expect(
      menuLinkIsActive("/en/m/CA/magazine?view=all#top", "/en/m/CA/magazine"),
    ).toBe(true);
  });
});
