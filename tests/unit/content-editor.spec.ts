import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSafePagePreview,
  CONTENT_BLOCK_TYPES,
  createEmptyContentBlock,
  serializeContentBlocks,
} from "@/modules/content/editor";
import type { ContentBlock } from "@/modules/content";
import { resolveInlineCommand } from "@/modules/content/rich-text-editor";

describe("dependency-free page block editor", () => {
  it("creates and serializes all eight supported block types", () => {
    const blocks = CONTENT_BLOCK_TYPES.map(createEmptyContentBlock);
    const serialized = serializeContentBlocks(blocks);

    expect(JSON.parse(serialized)).toEqual(blocks);
    expect(blocks.map((block) => block.type)).toEqual(CONTENT_BLOCK_TYPES);
  });

  it("builds an RTL unsaved preview without executable content", () => {
    const unsafeBlocks = [
      {
        type: "RichText",
        html: {
          fa: '<script>window.parent.postMessage("owned", "*")</script><p>سلام</p>',
          tr: "",
          en: "",
        },
      },
      {
        type: "Embed",
        title: { fa: "ویدیو", tr: "Video", en: "Video" },
        url: "https://www.youtube.com/embed/example",
      },
    ] as ContentBlock[];

    const html = buildSafePagePreview(unsafeBlocks, "fa");

    expect(html).toContain('<html lang="fa" dir="rtl">');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("postMessage");
    expect(html).toContain("سلام");
  });

  it("does not expose arbitrary image URLs in preview markup", () => {
    const image = {
      type: "Image",
      mediaId: "media-1",
      caption: { fa: "تصویر", tr: "Görsel", en: "Image" },
    } satisfies ContentBlock;

    const html = buildSafePagePreview([image], "en", {
      "media-1": "https://attacker.example/tracker.png",
    });

    expect(html).not.toContain("attacker.example");
  });

  it("uses a hidden serialization field instead of a raw JSON editor", () => {
    const source = readFileSync(
      "src/components/admin/page-blocks-editor.tsx",
      "utf8",
    );

    expect(source).toContain('type="hidden"');
    expect(source).toContain('name="blocks"');
    expect(source).toContain("contentEditable");
    expect(source).not.toMatch(/<textarea[^>]+name=["']blocks["']/);
    expect(source).not.toContain("execCommand");
  });

  it("maps bold, italic and safe links without accepting active URLs", () => {
    expect(resolveInlineCommand("bold")).toEqual({ tagName: "strong" });
    expect(resolveInlineCommand("italic")).toEqual({ tagName: "em" });
    expect(resolveInlineCommand("link", "/fa/pages/about")).toEqual({
      tagName: "a",
      attributes: {
        href: "/fa/pages/about",
        rel: "noopener noreferrer",
      },
    });
    expect(resolveInlineCommand("link", "javascript:alert(1)")).toBeNull();
    expect(resolveInlineCommand("link", "http://example.com")).toBeNull();
  });
});
