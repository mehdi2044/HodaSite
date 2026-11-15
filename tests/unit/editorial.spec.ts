import { describe, expect, it } from "vitest";
import {
  editorialContent,
  entrySlugs,
  istanbulTime,
} from "@/modules/editorial/contracts";
import { galleryFilters, withinPrice } from "@/modules/editorial/gallery";
import { parseSeoPath, seoPath } from "@/lib/seo-urls";

const text = { fa: "استایل بهاری", tr: "İlkbahar kombini", en: "Spring look" };
const look = {
  kind: "LOOK",
  title: text,
  summary: text,
  mediaId: "media-1",
  audience: "WOMEN",
  season: "SPRING",
  occasion: "WORK",
  style: "CLASSIC",
  color: "PASTEL",
  marketIds: ["IR"],
  featured: true,
  tags: [],
  items: [
    { productId: "product-1", variantId: "variant-1", mobile: { x: 1, y: 0 } },
  ],
};
describe("editorial contracts", () => {
  it("uses one market route with translated slugs and list/detail pages", () => {
    const path = seoPath("fa", "IR", "looks", "استایل-بهاری");
    expect(decodeURIComponent(parseSeoPath(path)!.target)).toBe(
      "/fa/looks/استایل-بهاری",
    );
    expect(parseSeoPath("/tr/m/TR/magazine")?.target).toBe("/tr/magazine");
    expect(parseSeoPath("/en/m/CA/looks/one/more")).toBeNull();
    expect(
      entrySlugs.safeParse({
        fa: "استایل-بهاری",
        tr: "ilkbahar",
        en: "spring-look",
      }).success,
    ).toBe(true);
    expect(
      entrySlugs.safeParse({ fa: "استایل", tr: "ilkbahar", en: "../spring" })
        .success,
    ).toBe(false);
  });
  it("rejects repeated products, forged IDs and out-of-frame hotspots", () => {
    expect(editorialContent.safeParse(look).success).toBe(true);
    expect(
      editorialContent.safeParse({
        ...look,
        items: [
          ...look.items,
          { productId: "product-1", variantId: "variant-2" },
        ],
      }).success,
    ).toBe(false);
    expect(
      editorialContent.safeParse({
        ...look,
        items: [
          {
            productId: "product-1",
            variantId: "<script>",
            desktop: { x: 0, y: 1.01 },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      editorialContent.safeParse({
        ...look,
        items: [
          {
            productId: "product-1",
            variantId: "variant-1",
            desktop: { x: 0, y: 1.01 },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("has no raw HTML or free-form href block and keeps literal text for React to escape", () => {
    const {
      items: _items,
      season: _season,
      color: _color,
      style: _style,
      occasion: _occasion,
      ...base
    } = look;
    const article = {
      ...base,
      kind: "ARTICLE",
      category: "STYLING",
      author: "Test editor",
    };
    expect(
      editorialContent.safeParse({
        ...article,
        blocks: [{ type: "HTML", html: "<script>alert(1)</script>" }],
      }).success,
    ).toBe(false);
    expect(
      editorialContent.safeParse({
        ...article,
        blocks: [{ type: "PRODUCT", id: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(
      editorialContent.safeParse({
        ...article,
        blocks: [{ type: "PARAGRAPH", text }],
      }).success,
    ).toBe(true);
  });
  it("uses exact market amounts for combined price bounds and Istanbul civil time for schedules", () => {
    expect(
      galleryFilters.parse({
        audience: "GIRLS",
        season: "SPRING",
        min: "10.0001",
        max: "20.0002",
      }),
    ).toMatchObject({
      audience: "GIRLS",
      season: "SPRING",
      sort: "newest",
      page: 1,
    });
    expect(withinPrice("10.0001", { min: "10.0001", max: "20.0002" })).toBe(
      true,
    );
    expect(withinPrice("20.0003", { min: "10.0001", max: "20.0002" })).toBe(
      false,
    );
    expect(withinPrice(null, { min: "0" })).toBe(false);
    expect(galleryFilters.parse({ min: "۱٬۰۰۰", max: "٢٥٠٠٫٣" })).toMatchObject(
      { min: "1000", max: "2500.3" },
    );
    expect(istanbulTime.parse("2028-03-01T00:01").toISOString()).toBe(
      "2028-02-29T21:01:00.000Z",
    );
    expect(istanbulTime.safeParse("2027-02-29T12:00").success).toBe(false);
  });
});
