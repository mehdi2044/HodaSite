import { describe, expect, it } from "vitest";
import { placementSchema } from "@/modules/catalog/cutouts/contracts";
import {
  cutoutClip,
  cutoutPlacementForView,
  cutoutViewForYaw,
  instantPlacement,
} from "@/modules/catalog/cutouts/fitting-rig";

const legacy = placementSchema.parse({
  modelId: "woman",
  x: 0.5,
  y: 0.4,
  width: 0.2,
  height: 0.2,
});
const image = (id: string) => ({
  id,
  mediaId: `seed-moda4-mannequin-${id}`,
  width: 420,
  height: 560,
});
const bag = { id: "seed-moda4-profile-accessories-bag", version: 0 };

describe("FR3.1 fitting geometry", () => {
  it("uses different positions for the actual mannequin artwork and preserves operator overrides", () => {
    const adult = instantPlacement(legacy, bag, image("woman"));
    const child = instantPlacement(
      { ...legacy, modelId: "boy" },
      bag,
      image("boy"),
    );
    expect(adult.x).toBeCloseTo(268 / 420);
    expect(child.x).toBeCloseTo(256 / 420);
    expect(child.y).toBeGreaterThan(adult.y);
    expect(
      instantPlacement(legacy, { ...bag, version: 1 }, image("woman")),
    ).toBe(legacy);
    expect(
      instantPlacement(legacy, bag, {
        ...image("woman"),
        mediaId: "other-artwork",
      }),
    ).toBe(legacy);
  });

  it("validates view overrides and keeps masks local to their authored placement", () => {
    const { modelId: _modelId, ...pose } = legacy;
    const placement = placementSchema.parse({
      ...legacy,
      views: {
        right: {
          ...pose,
          x: 0.55,
          rotation: 14,
          mask: { top: 0, bottom: 0.08 },
        },
      },
    });
    expect(cutoutViewForYaw(-24)).toBe("left");
    expect(cutoutViewForYaw(24)).toBe("right");
    expect(cutoutPlacementForView(placement, "left").x).toBe(0.5);
    const right = cutoutPlacementForView(placement, "right");
    expect(right.rotation).toBe(14);
    expect(cutoutClip(right)).toBe("inset(0% 0 8% 0)");
    expect(cutoutClip(placement)).toBeUndefined();
    expect(
      placementSchema.safeParse({ ...legacy, mask: { top: 0.6, bottom: 0 } })
        .success,
    ).toBe(false);
  });
});
