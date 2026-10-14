import { describe, it, expect } from "vitest";
import { initialProductVariant } from "@/modules/catalog/selection";
import {
  NEW_ARRIVAL_TAG,
  hasNewArrival,
  merchandisingTags,
} from "@/modules/catalog/merchandising";
const variant = (
  id: string,
  colorId: string,
  onHand: number,
  reserved = 0,
  isActive = true,
) => ({ id, colorId, isActive, stockItems: [{ onHand, reserved }] });
describe("R5 actual initial variant and explicit merchandising", () => {
  it("chooses a stocked actual size in the explicitly requested color, rather than another SKU's price", () => {
    const choices = [
      variant("ivory-m", "ivory", 10),
      variant("charcoal-m", "charcoal", 1, 1),
      variant("charcoal-l", "charcoal", 3),
    ];
    expect(initialProductVariant(choices, "charcoal")?.id).toBe("charcoal-l");
  });
  it("keeps the requested sold-out color explicit and cannot select an inactive variant", () => {
    const choices = [
      variant("disabled", "red", 20, 0, false),
      variant("red-real", "red", 0),
      variant("blue-stocked", "blue", 5),
    ];
    expect(initialProductVariant(choices, "red")?.id).toBe("red-real");
  });
  it("invalid color falls back to a real active stocked choice; no active variants stays unavailable", () => {
    expect(
      initialProductVariant(
        [variant("empty", "red", 0), variant("stocked", "blue", 4)],
        "forged",
      )?.id,
    ).toBe("stocked");
    expect(
      initialProductVariant([variant("inactive", "red", 20, 0, false)]),
    ).toBeUndefined();
  });
  it("legacy payloads do not reinterpret tags; explicit checkbox removes only the merchandising flag", () => {
    const tags = ["owner-tag", NEW_ARRIVAL_TAG, "sale"];
    expect(merchandisingTags(tags)).toEqual(tags);
    expect(merchandisingTags(tags, false)).toEqual(["owner-tag", "sale"]);
    expect(
      merchandisingTags([NEW_ARRIVAL_TAG, NEW_ARRIVAL_TAG, "owner-tag"], true),
    ).toEqual(["owner-tag", NEW_ARRIVAL_TAG]);
    expect(hasNewArrival(["new", "seed"])).toBe(false);
    expect(hasNewArrival(tags)).toBe(true);
  });
});
