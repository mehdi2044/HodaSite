import { z } from "zod";

// Bounded presentation JSON; shared by CMS validation and first-paint CSS.
export const HERO_FRAME_PROFILES = [
  "compact",
  "mobile",
  "wideMobile",
  "tablet",
  "desktop",
] as const;
export const heroFrameSchema = z
  .object({
    focal: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict(),
    zoom: z.number().min(1).max(2),
  })
  .strict();
export const heroFramingSchema = z
  .object({
    compact: heroFrameSchema.optional(),
    mobile: heroFrameSchema.optional(),
    wideMobile: heroFrameSchema.optional(),
    tablet: heroFrameSchema.optional(),
    desktop: heroFrameSchema.optional(),
  })
  .strict();
export type HeroFraming = z.infer<typeof heroFramingSchema>;

export function heroFramingStyle(
  framing?: HeroFraming,
): Record<string, number> {
  const style: Record<string, number> = {};
  for (const key of HERO_FRAME_PROFILES) {
    const frame = framing?.[key];
    if (!frame) continue;
    style[`--camera-${key}-x`] = frame.focal.x;
    style[`--camera-${key}-y`] = frame.focal.y;
    style[`--camera-${key}-zoom`] = frame.zoom;
  }
  return style;
}
