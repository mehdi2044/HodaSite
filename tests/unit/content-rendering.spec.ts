import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentBlocks } from "@/components/storefront/content-blocks";

describe("CMS page rendering", () => {
  it("renders localized rich text, FAQ and a sandboxed allowlisted embed", async () => {
    const html = renderToStaticMarkup(
      await ContentBlocks({
        locale: "fa",
        blocks: [
          {
            type: "RichText",
            html: {
              fa: '<p dir="rtl">کد <bdi dir="ltr">SH-MW-1023</bdi> موجود است</p>',
              tr: "<p>TR</p>",
              en: "<p>EN</p>",
            },
          },
          {
            type: "FAQ",
            items: [
              {
                question: { fa: "پرسش", tr: "Soru", en: "Question" },
                answer: {
                  fa: "<p>پاسخ</p>",
                  tr: "<p>Yanıt</p>",
                  en: "<p>Answer</p>",
                },
              },
            ],
          },
          {
            type: "Embed",
            title: { fa: "ویدئو", tr: "Video", en: "Video" },
            url: "https://www.youtube.com/embed/example",
          },
        ],
      }),
    );
    expect(html).toContain('<bdi dir="ltr">SH-MW-1023</bdi>');
    expect(html).toContain("<summary");
    expect(html).toContain("https://www.youtube.com/embed/example");
    expect(html).toContain(
      'sandbox="allow-scripts allow-same-origin allow-presentation"',
    );
    expect(html).not.toContain("TR");
  });
});
