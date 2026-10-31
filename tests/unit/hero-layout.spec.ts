import { describe, expect, it } from "vitest";
import {
  displayTitleText,
  heroFocalX,
  heroMode,
  heroViolations,
  normalizeHeroLayout,
  projectCover,
  splitDisplayTitle,
} from "@/modules/content/hero-layout";
import { modaHeroSlideSchema } from "@/modules/content/moda4-contracts";
import { scenePriceRange } from "@/modules/content/scenes/prices";

describe("M4-01 hero layout", () => {
  it("compares hero float quotes exactly at numeric(18,4) precision", () => {
    expect(
      scenePriceRange(["99999999999999.0002", "99999999999999.0001"]),
    ).toEqual({ min: "99999999999999.0001", max: "99999999999999.0002" });
  });
  it("reads legacy textSide as the Persian-authored physical side", () => {
    expect(normalizeHeroLayout({ textSide: "start" }).copySide).toBe("right");
    expect(normalizeHeroLayout({ textSide: "end" }).copySide).toBe("left");
    expect(
      normalizeHeroLayout({
        textSide: "start",
        layout: { copySide: "left", subject: { x0: 0.6, x1: 0.72 } },
      }),
    ).toEqual({ copySide: "left", subject: { x0: 0.6, x1: 0.72 } });
  });
  it("rejects a degenerate subject and falls back to the copy-opposite half", () => {
    expect(
      normalizeHeroLayout({
        layout: { copySide: "right", subject: { x0: 0.5, x1: 0.4 } },
      }).subject,
    ).toEqual({ x0: 0.18, x1: 0.42 });
  });
  it("keeps the subject on its own half through object-position", () => {
    expect(
      heroFocalX({ copySide: "right", subject: { x0: 0.2, x1: 0.39 } }),
    ).toBeCloseTo(0.295);
    expect(
      heroFocalX({ copySide: "left", subject: { x0: 0.6, x1: 0.72 } }),
    ).toBeCloseTo(0.66);
    expect(
      heroFocalX({ copySide: "right", subject: { x0: 0.6, x1: 0.8 } }),
    ).toBe(0.5);
  });
  it("projects like CSS object-fit:cover with object-position", () => {
    // 2:1 banner into 1440×864 → rendered 1728 wide, 288px overflow, 30% → −86.4px
    const p = projectCover(
      { x: 0.2, y: 0.5 },
      { width: 2400, height: 1200 },
      { width: 1440, height: 864 },
      { x: 0.3, y: 0 },
    );
    expect(p.x).toBeCloseTo(0.2 * 1728 - 86.4, 1);
    expect(p.y).toBeCloseTo(432, 1);
  });
  it("classifies the four composition modes", () => {
    expect(heroMode(390, true)).toBe("A");
    expect(heroMode(768, true)).toBe("B");
    expect(heroMode(1024, false)).toBe("C");
    expect(heroMode(1440, false)).toBe("D");
  });
  it("splits display titles by weight, never by italics", () => {
    expect(splitDisplayTitle("City Layers")).toEqual({
      strong: "City",
      light: "Layers",
    });
    expect(splitDisplayTitle("From the rail|to you.")).toEqual({
      strong: "From the rail",
      light: "to you.",
    });
    expect(displayTitleText("Try before|you buy")).toBe("Try before you buy");
  });
  it("accepts the new optional contract fields and keeps old records valid", () => {
    const layout = modaHeroSlideSchema.shape.layout;
    expect(layout.safeParse(undefined).success).toBe(true);
    expect(
      layout.safeParse({ copySide: "left", subject: { x0: 0.6, x1: 0.72 } })
        .success,
    ).toBe(true);
    expect(
      layout.safeParse({ copySide: "start", subject: { x0: 0.6, x1: 0.72 } })
        .success,
    ).toBe(false);
    expect(
      layout.safeParse({ copySide: "left", subject: { x0: 0.6, x1: 0.62 } })
        .success,
    ).toBe(false);
  });
});

describe("M4-01 collision rules", () => {
  const ok = {
    mode: "D" as const,
    width: 1440,
    height: 864,
    copy: { l: 780, t: 200, r: 1340, b: 700 },
    subject: { l: 260, t: 0, r: 590, b: 864 },
    header: { l: 0, t: -9999, r: 1440, b: 108 },
    controls: { l: 48, t: 790, r: 1392, b: 840 },
    title: { clipped: false, fontSize: 106, weight: "400" },
    pins: [
      {
        dot: { l: 470, t: 360, r: 500, b: 390 },
        label: { l: 320, t: 350, r: 450, b: 400 },
      },
      {
        dot: { l: 300, t: 520, r: 330, b: 550 },
        label: { l: 150, t: 510, r: 280, b: 560 },
      },
    ],
    float: { l: 560, t: 420, r: 700, b: 640 },
    strip: { visible: false, items: 2, clipped: false },
    ctas: [{ l: 1100, t: 600, r: 1340, b: 654 }],
  };
  it("passes the reference composition", () => {
    expect(heroViolations(ok)).toEqual([]);
  });
  it("H-01 copy over the person", () => {
    expect(heroViolations({ ...ok, copy: { ...ok.copy, l: 560 } })).toContain(
      "H-01",
    );
  });
  it("H-03 bold title (the FID-6 defect)", () => {
    expect(
      heroViolations({ ...ok, title: { ...ok.title, weight: "700" } }),
    ).toContain("H-03");
  });
  it("H-04 label under the copy", () => {
    const pins = [
      { dot: ok.pins[0].dot, label: { l: 760, t: 350, r: 900, b: 400 } },
      ok.pins[1],
    ];
    expect(heroViolations({ ...ok, pins })).toContain("H-04");
  });
  it("H-05 float on tablet", () => {
    expect(heroViolations({ ...ok, mode: "C" })).toContain("H-05");
  });
  it("H-06 a collapsed label requires the price strip", () => {
    const pins = [{ dot: ok.pins[0].dot, label: null }, ok.pins[1]];
    expect(heroViolations({ ...ok, pins })).toContain("H-06");
    expect(
      heroViolations({
        ...ok,
        pins,
        strip: { visible: true, items: 2, clipped: false },
      }),
    ).toEqual([]);
  });
  it("H-07 short CTA", () => {
    expect(
      heroViolations({ ...ok, ctas: [{ l: 1100, t: 600, r: 1340, b: 630 }] }),
    ).toContain("H-07");
  });
});
