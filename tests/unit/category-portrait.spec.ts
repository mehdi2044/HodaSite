import { afterAll, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryPortrait } from "@/components/storefront/category-portrait";
import fa from "../../messages/fa.json";
import tr from "../../messages/tr.json";
import en from "../../messages/en.json";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

const media = {
  url: "/category.webp",
  variants: {},
  width: 800,
  height: 1000,
  blurDataUrl: null,
  altI18n: { fa: "دسته", tr: "Kategori", en: "Category" },
};

for (const [locale, messages] of [
  ["fa", fa],
  ["tr", tr],
  ["en", en],
] as const) {
  describe(`${locale} category artwork disclosure`, () => {
    it("visibly labels both generations of seeded artwork", () => {
      for (const originalName of [
        "demo-fashion-v1-coat.webp",
        "demo-fashion-v2-women-tee.webp",
      ]) {
        const html = renderToStaticMarkup(
          createElement(CategoryPortrait, {
            media: { ...media, originalName },
            locale,
            demoLabel: messages.shopping.demoImage,
          }),
        );
        expect(html).toContain(`>${messages.shopping.demoImage}</figcaption>`);
        expect(html).toContain(`alt="${media.altI18n[locale]}"`);
        expect(html).not.toContain("aria-hidden");
      }
    });

    it("does not label merchant photography as demo artwork", () => {
      const html = renderToStaticMarkup(
        createElement(CategoryPortrait, {
          media: { ...media, originalName: "merchant-category.webp" },
          locale,
          demoLabel: messages.shopping.demoImage,
        }),
      );
      expect(html).toContain('<img src="/category.webp"');
      expect(html).not.toContain("figcaption");
      expect(html).not.toContain(messages.shopping.demoImage);
    });
  });
}
