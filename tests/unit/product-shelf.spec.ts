import { afterAll, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductShelf } from "@/components/storefront/product-shelf";
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
  describe(`${locale} department artwork disclosure`, () => {
    for (const originalName of [
      "demo-fashion-v1-coat.webp",
      "demo-fashion-v2-women-tee.webp",
      "merchant.webp",
    ]) {
      it(`labels only illustrative artwork: ${originalName}`, () => {
        const html = renderToStaticMarkup(
          createElement(ProductShelf, {
            title: "Department",
            ordinal: 1,
            locale,
            browseLabel: "Browse",
            emptyLabel: "Empty",
            demoLabel: messages.shopping.demoImage,
            empty: true,
            children: null,
            department: {
              id: "department",
              media: {
                url: "/cover.webp",
                variants: {},
                width: 800,
                height: 1000,
                blurDataUrl: null,
                altI18n: {},
                originalName,
              },
            },
          }),
        );
        if (originalName.startsWith("demo-")) {
          expect(html).toContain(
            `>${messages.shopping.demoImage}</figcaption>`,
          );
        } else {
          expect(html).not.toContain("figcaption");
          expect(html).not.toContain(messages.shopping.demoImage);
        }
      });
    }
  });
}
