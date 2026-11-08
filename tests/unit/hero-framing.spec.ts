import { describe, expect, it } from "vitest";
import {
  heroFramingSchema,
  heroFramingStyle,
} from "@/modules/content/hero-framing";
import { normalizeHeroLayout } from "@/modules/content/hero-layout";

describe("Hero responsive framing contract", () => {
  it("keeps old slides free of camera overrides", () => {
    expect(
      heroFramingStyle(normalizeHeroLayout({ textSide: "end" }).framing),
    ).toEqual({});
  });
  it("retains independent physical focal positions per viewport", () => {
    const framing = heroFramingSchema.parse({
      compact: { focal: { x: 0.7, y: 0 }, zoom: 1.2 },
      desktop: { focal: { x: 0.3, y: 0.2 }, zoom: 1 },
    });
    expect(
      normalizeHeroLayout({ layout: { copySide: "left", framing } }).framing,
    ).toEqual(framing);
    expect(heroFramingStyle(framing)).toEqual({
      "--camera-compact-x": 0.7,
      "--camera-compact-y": 0,
      "--camera-compact-zoom": 1.2,
      "--camera-desktop-x": 0.3,
      "--camera-desktop-y": 0.2,
      "--camera-desktop-zoom": 1,
    });
  });
  it.each([
    { compact: { focal: { x: -0.1, y: 0 }, zoom: 1 } },
    { mobile: { focal: { x: 0.5, y: 1.1 }, zoom: 1 } },
    { desktop: { focal: { x: 0.5, y: 0 }, zoom: -1 } },
    { wideMobile: { focal: { x: 0.5, y: 0 }, zoom: 2.1 } },
    { desktop: { focal: { x: 0.5, y: 0 }, zoom: 1, transform: "scaleX(-1)" } },
  ])("rejects unsafe, mirrored or out-of-range framing %j", (input) => {
    expect(heroFramingSchema.safeParse(input).success).toBe(false);
  });
});
