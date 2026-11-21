import { describe, expect, it } from "vitest";
import { modaWorldFaceSchema } from "@/modules/content/moda4-contracts";
import { homepageBlocksSchema } from "@/modules/content/homepage";

const text = { fa: "متن", tr: "Metin", en: "Copy" };
const image = {
  mediaId: "approved-media",
  aspect: "3:4",
  fit: "cover",
  focal: { x: 0.5, y: 0 },
};
const face = {
  id: "world",
  categoryId: "category",
  title: text,
  subtitle: text,
  desktop: image,
  mobile: image,
};
const bands = {
  id: "ribbons",
  type: "Bands",
  version: 1,
  first: [text],
  second: [text],
  durationSeconds: 30,
};

describe("backward-compatible homepage presentation", () => {
  it("reads legacy worlds without adding description or replacing their imagery", () => {
    const parsed = modaWorldFaceSchema.parse(face);
    expect(parsed.description).toBeUndefined();
    expect(parsed.desktop).toEqual(image);
    expect(parsed.subtitle).toEqual(text);
  });
  it("keeps body copy separate from the photographed face caption", () => {
    const description = { fa: "توضیح", tr: "Açıklama", en: "Description" };
    const parsed = modaWorldFaceSchema.parse({ ...face, description });
    expect(parsed.description).toEqual(description);
    expect(parsed.subtitle).toEqual(face.subtitle);
    expect(parsed.desktop).toEqual(face.desktop);
  });
  it("reads a legacy duration without silently opting it into constant speed", () => {
    const [parsed] = homepageBlocksSchema.parse([bands]);
    expect(parsed.type).toBe("Bands");
    if (parsed.type !== "Bands") throw new Error("Wrong block");
    expect(parsed.durationSeconds).toBe(30);
    expect(parsed.speed).toBeUndefined();
  });
  it("retains explicit editor-configured pixel speeds", () => {
    const [parsed] = homepageBlocksSchema.parse([
      { ...bands, speed: { first: 7.9, second: 5.6 } },
    ]);
    if (parsed.type !== "Bands") throw new Error("Wrong block");
    expect(parsed.speed).toEqual({ first: 7.9, second: 5.6 });
  });
  it.each([NaN, 0, 121])(
    "rejects unsafe motion speed %s at the CMS contract",
    (first) => {
      expect(
        homepageBlocksSchema.safeParse([
          { ...bands, speed: { first, second: 5.6 } },
        ]).success,
      ).toBe(false);
    },
  );
});

describe("curated homepage references", () => {
  const shop = { type: "ShopLook", title: text, body: text, looks: [] };
  it("allows an explicit empty curated selection without inventing prepared products", () => {
    const [block] = homepageBlocksSchema.parse([
      { ...shop, curatedLookIds: [] },
    ]);
    expect(block.type).toBe("ShopLook");
    if (block.type !== "ShopLook") throw new Error("Wrong block");
    expect(block.curatedLookIds).toEqual([]);
    expect(block.looks).toEqual([]);
  });
  it("still rejects an empty legacy shop", () => {
    expect(homepageBlocksSchema.safeParse([shop]).success).toBe(false);
  });
  it("rejects duplicate curated identities at the existing CMS boundary", () => {
    expect(
      homepageBlocksSchema.safeParse([
        { ...shop, curatedLookIds: ["same", "same"] },
      ]).success,
    ).toBe(false);
  });
});

describe("lookbook empty and identity contracts", () => {
  const book = {
    id: "book",
    type: "Lookbook",
    version: 1,
    title: text,
    scenes: [],
  };
  it("allows an explicit empty curated allocation without placeholder scene media", () => {
    expect(
      homepageBlocksSchema.safeParse([{ ...book, curatedLookIds: [] }]).success,
    ).toBe(true);
  });
  it("keeps the legacy requirement for at least one scene", () => {
    expect(homepageBlocksSchema.safeParse([book]).success).toBe(false);
  });
  it("rejects repeated LookIDs instead of creating filler cards", () => {
    expect(
      homepageBlocksSchema.safeParse([
        { ...book, curatedLookIds: ["city", "city"] },
      ]).success,
    ).toBe(false);
  });
});
