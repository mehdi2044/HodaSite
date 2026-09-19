import { afterAll, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mediaPresentation,
  mediaPresentationSchema,
} from "@/modules/media/presentation";
import { ResponsiveImage } from "@/components/storefront/responsive-image";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("reusable media presentation", () => {
  it("rejects invalid crop inputs and falls back safely for old or malformed rows", () => {
    for (const value of [
      { focalX: -0.1 },
      { focalY: 1.1 },
      { focalX: NaN },
      { fit: "stretch" },
      { focalY: "25%" },
    ]) {
      expect(mediaPresentationSchema.safeParse(value).success).toBe(false);
      expect(mediaPresentation(value, "catalog")).toEqual({
        objectFit: "cover",
        objectPosition: "50% 0%",
      });
    }
    expect(mediaPresentation(null, "gallery")).toEqual(
      mediaPresentation({}, "gallery"),
    );
  });
  it("uses editable focus consistently for cards, gallery and thumbnails but never crops full view", () => {
    const frame = { fit: "cover", focalX: 0, focalY: 1 };
    for (const role of [
      "catalog",
      "gallery",
      "thumbnail",
      "editorial",
      "hero",
    ] as const)
      expect(mediaPresentation(frame, role)).toEqual({
        objectFit: "cover",
        objectPosition: "0% 100%",
      });
    expect(mediaPresentation(frame, "full")).toEqual({
      objectFit: "contain",
      objectPosition: "50% 50%",
    });
    expect(mediaPresentation({ fit: "contain" }, "thumbnail").objectFit).toBe(
      "contain",
    );
  });
  it("preserves responsive image formats, alt text and dimensions while applying framing", () => {
    const html = renderToStaticMarkup(
      createElement(ResponsiveImage, {
        media: {
          url: "/image.jpg",
          width: 800,
          height: 1000,
          blurDataUrl: null,
          altI18n: { fa: "لباس" },
          presentation: { focalY: 0 },
          variants: {
            webp: { "640": { url: "/640.webp" } },
            avif: { "320": { url: "/320.avif" } },
          },
        },
        locale: "fa",
        role: "gallery",
        sizes: "50vw",
      }),
    );
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('srcSet="/640.webp 640w"');
    expect(html).toContain("object-position:50% 0%");
    expect(html).toContain('width="800"');
    expect(html).toContain('alt="لباس"');
  });
});
