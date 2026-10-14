import { describe, expect, it } from "vitest";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import {
  blockScenes,
  bindBlockVideoScenes,
} from "@/modules/content/block-scenes";
const text = { fa: "آزمون", tr: "Deneme", en: "Fixture" };
const scene = (id: string) => ({
  id,
  version: 1,
  mode: "PHOTO",
  title: text,
  alt: text,
  desktop: { mediaId: "photo" },
  mobile: { mediaId: "photo" },
  pieces: [
    {
      id: "piece",
      productId: "product",
      colorId: "color",
      referenceMediaId: "image",
      desktop: { x: 0.5, y: 0.5 },
      mobile: { x: 0.5, y: 0.5 },
    },
  ],
});
describe("R3b backwards-compatible editable block references", () => {
  it("retains old blocks and recognizes nested hero/look/final scenes without changing catalog identities", () => {
    const blocks = homepageBlocksSchema.parse([
      { type: "RichText", text },
      {
        id: "hero",
        version: 1,
        type: "HeroSlider",
        slides: [
          {
            id: "slide",
            eyebrow: text,
            scene: scene("nested"),
            body: text,
            ctaLabel: text,
            target: { kind: "catalog" },
          },
        ],
      },
      {
        id: "lookbook",
        version: 1,
        type: "Lookbook",
        title: text,
        scenes: [scene("look")],
      },
    ]);
    expect(blockScenes(blocks).map((scene) => scene.id)).toEqual([
      "nested",
      "look",
    ]);
    expect(blocks[0]).toEqual({ type: "RichText", text });
    expect(
      homepageBlocksSchema.safeParse([{ ...blocks[1] }, { ...blocks[1] }])
        .success,
    ).toBe(false);
  });
  it("binds a video scene to its actual clip and strips caller video contexts from other blocks", () => {
    const blocks = homepageBlocksSchema.parse([
      {
        id: "video",
        version: 1,
        type: "VideoBanner",
        title: text,
        body: text,
        videoMediaId: "clip",
        desktop: { mediaId: "photo" },
        mobile: { mediaId: "photo" },
        scene: { ...scene("video-scene"), relatedVideoMediaId: "forged" },
        ctaLabel: text,
        target: { kind: "catalog" },
      },
      {
        type: "Hero",
        title: text,
        body: text,
        ctaLabel: text,
        scene: { ...scene("hero"), relatedVideoMediaId: "forged" },
      },
    ]);
    expect(
      blockScenes(bindBlockVideoScenes(blocks)).map(
        (scene) => scene.relatedVideoMediaId,
      ),
    ).toEqual(["clip", undefined]);
  });
});
