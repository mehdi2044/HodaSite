import { describe, expect, it } from "vitest";
import {
  isAllowedEmbedUrl,
  isSafeLink,
  isValidMenuParent,
  menuItemInputSchema,
  pageBlocksSchema,
  pageInputSchema,
  sanitizeRichText,
} from "@/modules/content";

const i18n = { fa: "متن", tr: "Metin", en: "Text" };

describe("Phase 01c content validation", () => {
  it("accepts internal and HTTPS links but rejects executable or protocol-relative URLs", () => {
    expect(isSafeLink("/fa/pages/about")).toBe(true);
    expect(isSafeLink("https://example.com/path")).toBe(true);
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("//attacker.example/path")).toBe(false);
    expect(isSafeLink("http://example.com")).toBe(false);
  });

  it("allows only approved HTTPS embed providers", () => {
    expect(isAllowedEmbedUrl("https://www.youtube.com/embed/example")).toBe(
      true,
    );
    expect(isAllowedEmbedUrl("https://player.vimeo.com/video/1")).toBe(true);
    expect(isAllowedEmbedUrl("https://example.com/embed/1")).toBe(false);
    expect(isAllowedEmbedUrl("http://www.youtube.com/embed/example")).toBe(
      false,
    );
  });

  it("rejects active rich text and normalizes allowed attributes", () => {
    expect(() => sanitizeRichText('<img src=x onerror="alert(1)">')).toThrow(
      "unsafe_rich_text",
    );
    expect(() => sanitizeRichText("<script>alert(1)</script>")).toThrow(
      "unsafe_rich_text",
    );
    expect(
      pageBlocksSchema.safeParse([
        {
          type: "RichText",
          html: { ...i18n, en: "<script>alert(1)</script>" },
        },
      ]).success,
    ).toBe(false);
    expect(
      sanitizeRichText(
        '<p dir="rtl" class="ignored">کد <bdi dir="ltr">SH-MW-1023</bdi></p>',
      ),
    ).toBe('<p dir="rtl">کد <bdi dir="ltr">SH-MW-1023</bdi></p>');
  });

  it("validates every supported block and rejects an unknown block", () => {
    const blocks = [
      { type: "RichText", html: i18n },
      { type: "Image", mediaId: "media-1", caption: i18n },
      { type: "Hero", title: i18n, body: i18n, ctaLabel: i18n, ctaUrl: "/" },
      { type: "TwoColumns", left: i18n, right: i18n },
      { type: "FAQ", items: [{ question: i18n, answer: i18n }] },
      { type: "CTA", title: i18n, label: i18n, url: "/contact" },
      { type: "Countdown", title: i18n, endsAt: "2030-01-01T00:00:00.000Z" },
      {
        type: "Embed",
        title: i18n,
        url: "https://www.youtube.com/embed/example",
      },
    ];
    expect(pageBlocksSchema.parse(blocks)).toHaveLength(8);
    expect(
      pageBlocksSchema.safeParse([{ type: "Script", html: "x" }]).success,
    ).toBe(false);
  });

  it("requires the target for each menu link type", () => {
    const base = {
      menuId: "menu",
      labelI18n: i18n,
      target: "_self",
      enabled: true,
      visibleIn: [],
      sortOrder: 0,
    } as const;
    expect(
      menuItemInputSchema.safeParse({ ...base, linkType: "url", url: "/about" })
        .success,
    ).toBe(true);
    expect(
      menuItemInputSchema.safeParse({ ...base, linkType: "page" }).success,
    ).toBe(false);
  });

  it("rejects cycles and nesting deeper than two levels", () => {
    expect(
      isValidMenuParent({
        menuId: "m",
        parentId: "p",
        parentMenuId: "m",
        parentParentId: null,
      }),
    ).toBe(true);
    expect(
      isValidMenuParent({
        itemId: "p",
        menuId: "m",
        parentId: "p",
        parentMenuId: "m",
        parentParentId: null,
      }),
    ).toBe(false);
    expect(
      isValidMenuParent({
        menuId: "m",
        parentId: "p",
        parentMenuId: "m",
        parentParentId: "grandparent",
      }),
    ).toBe(false);
    expect(
      isValidMenuParent({
        menuId: "m",
        parentId: "p",
        parentMenuId: "m",
        parentParentId: null,
        currentHasChildren: true,
      }),
    ).toBe(false);
  });

  it("accepts Unicode localized slugs and rejects slashes", () => {
    const input = {
      titleI18n: i18n,
      slugI18n: { fa: "درباره-ما", tr: "hakkimizda", en: "about-us" },
      type: "static",
      status: "draft",
      marketIds: [],
      seoI18n: { title: i18n, description: i18n },
      blocks: [],
    };
    expect(pageInputSchema.safeParse(input).success).toBe(true);
    expect(
      pageInputSchema.safeParse({
        ...input,
        slugI18n: { ...input.slugI18n, en: "bad/slug" },
      }).success,
    ).toBe(false);
    expect(
      pageInputSchema.safeParse({
        ...input,
        marketIds: ["market-1", "market-1"],
      }).success,
    ).toBe(false);
  });
});
