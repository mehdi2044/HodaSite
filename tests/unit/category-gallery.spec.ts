import { afterAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryGallery } from "@/components/storefront/category-gallery";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

for (const [locale, messages] of [
  ["fa", fa],
  ["tr", tr],
  ["en", en],
] as const) {
  describe(`${locale}: configurable category discovery`, () => {
    const props = {
      locale,
      title: "Catalog",
      ordinal: 2,
      intro: messages.shopping.categoryExplore,
      browseLabel: messages.shopping.browseCategory,
      demoLabel: messages.shopping.demoImage,
      emptyLabel: messages.shopping.emptyCategories,
    };
    it("keeps fifth and further categories reachable, including a category without an image", () => {
      const categories = Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        title: `Category ${i}`,
        href: `/${locale}/m/CA/c/category-${i}`,
        media:
          i === 5
            ? undefined
            : {
                url: `/image-${i}.webp`,
                originalName:
                  i === 0 ? "demo-fashion-v1-coat.webp" : "merchant.webp",
                variants: {},
                width: 800,
                height: 1000,
                blurDataUrl: null,
                altI18n: { [locale]: `Photo ${i}` },
              },
      }));
      const html = renderToStaticMarkup(
        React.createElement(CategoryGallery, { ...props, categories }),
      );
      expect(html.match(/<a /g)).toHaveLength(6);
      expect(html).toContain(`href="/${locale}/m/CA/c/category-5"`);
      expect(html).toContain("Category 5");
      expect(html).not.toContain('src="undefined"');
      expect(html.split(messages.shopping.demoImage)).toHaveLength(2);
    });
    it("keeps single-category and empty states usable", () => {
      const single = renderToStaticMarkup(
        React.createElement(CategoryGallery, {
          ...props,
          categories: [
            { id: "single", title: "Single", href: `/${locale}/m/CA/c/single` },
          ],
        }),
      );
      expect(single.match(/<a /g)).toHaveLength(1);
      expect(single).not.toContain("shop-discovery-mosaic");
      const empty = renderToStaticMarkup(
        React.createElement(CategoryGallery, { ...props, categories: [] }),
      );
      expect(empty).toContain(messages.shopping.emptyCategories);
      expect(empty).not.toContain("<a ");
    });
  });
}
