import { describe, expect, it } from "vitest";
import {
  selectHomepageLooks,
  homepageVisualIdentity,
  chooseHomepageArticle,
} from "@/modules/editorial/home-selection";
const photo = (id: string, wide: string, portrait = wide) => ({
  id,
  visual: { mode: "PHOTO", desktop: { id: wide }, mobile: { id: portrait } },
});
describe("homepage editorial allocation", () => {
  it("honours CMS order, removes a real duplicate photo even under another LookID, and ignores missing references", () => {
    const entries = [
      photo("city", "city-wide", "city-mobile"),
      photo("duplicate", "different-wide", "city-mobile"),
      photo("other", "other-wide"),
    ];
    expect(
      selectHomepageLooks(
        ["other", "city", "duplicate", "missing", "city"],
        entries,
      ).map((entry) => entry.id),
    ).toEqual(["other", "city"]);
  });
  it("reserves weekly identities and their images before allocating commercial placements", () => {
    const entries = [
      photo("weekly", "weekly-wide"),
      photo("copy", "weekly-wide"),
      photo("shop", "shop-wide"),
    ];
    expect(
      selectHomepageLooks(["copy", "shop", "weekly"], entries, ["weekly"]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["shop"]);
  });
  it("renders one or zero real entries rather than cloning to reach a target card count", () => {
    expect(
      selectHomepageLooks(["missing", "only"], [photo("only", "image")]),
    ).toHaveLength(1);
    expect(selectHomepageLooks([], [photo("only", "image")])).toEqual([]);
  });
  it("does not confuse shared garment thumbnails with duplicate final model photographs", () => {
    const entries = [
      { id: "a", visual: { mode: "COMPOSITE" } },
      { id: "b", visual: { mode: "COMPOSITE" } },
    ];
    expect(selectHomepageLooks(["a", "b"], entries)).toEqual(entries);
  });
});

describe("complete composition identities", () => {
  const composite = (id: string, mediaIds: string[]) => ({
    id,
    visual: {
      mode: "COMPOSITE",
      pieces: mediaIds.map((id) => ({ image: { id } })),
    },
  });
  it("removes an identical full outfit even under another ID or reverse piece order", () => {
    const entries = [
      composite("a", ["knit", "trousers"]),
      composite("copy", ["trousers", "knit"]),
      composite("b", ["shirt", "trousers"]),
    ];
    expect(
      selectHomepageLooks(["a", "copy", "b"], entries).map((entry) => entry.id),
    ).toEqual(["a", "b"]);
    expect(homepageVisualIdentity(entries[0])).toBe("COMPOSITE:knit,trousers");
  });
  it("keeps distinct complete looks that share just one garment", () => {
    const entries = [
      composite("a", ["knit", "trousers"]),
      composite("b", ["shirt", "trousers"]),
    ];
    expect(selectHomepageLooks(["a", "b"], entries)).toEqual(entries);
  });
  it("reserves an entire composite allocation rather than just its LookID", () => {
    const entries = [
      composite("weekly", ["knit", "trousers"]),
      composite("copy", ["knit", "trousers"]),
    ];
    expect(selectHomepageLooks(["copy"], entries, ["weekly"])).toEqual([]);
  });
});

describe("article reservations", () => {
  const story = (
    id: string,
    primaryLook: string,
    mediaId: string,
    featured = true,
  ) => ({
    id,
    body: { mediaId, featured, blocks: [{ type: "LOOK", id: primaryLook }] },
  });
  const entries = [
    story("easy-story", "easy", "men-wide"),
    story("other-story", "city", "article-photo", false),
  ];
  it("chooses a real independent story after omitting the commercial topic", () => {
    expect(chooseHomepageArticle(entries, undefined, ["easy"], [])?.id).toBe(
      "other-story",
    );
  });
  it("keeps an explicit duplicated selection empty rather than substituting another article", () => {
    expect(
      chooseHomepageArticle(entries, "easy-story", ["easy"], []),
    ).toBeUndefined();
  });
  it("does not repeat allocated photography under a different article identity", () => {
    expect(
      chooseHomepageArticle(
        [story("other", "different", "men-wide")],
        undefined,
        [],
        ["men-wide"],
      ),
    ).toBeUndefined();
  });
  it("never fabricates missing content", () => {
    expect(chooseHomepageArticle([], undefined, [], [])).toBeUndefined();
    expect(chooseHomepageArticle(entries, "missing", [], [])).toBeUndefined();
  });
  it("reserves either photo size before allocating the lookbook", () => {
    expect(
      selectHomepageLooks(
        ["a"],
        [photo("a", "wide", "portrait")],
        [],
        ["portrait"],
      ),
    ).toEqual([]);
  });
});
