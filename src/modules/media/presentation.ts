import { z } from "zod";

export const mediaPresentationSchema = z.object({
  fit: z.enum(["cover", "contain"]).optional(),
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
});
export type MediaRole =
  "catalog" | "gallery" | "thumbnail" | "editorial" | "hero" | "full";

/** Framing is independent of image identity and never enlarges/crops via transforms. */
export function mediaPresentation(value: unknown, role: MediaRole) {
  const parsed = mediaPresentationSchema.safeParse(value);
  const data = parsed.success ? parsed.data : {};
  return {
    objectFit:
      role === "full" ? ("contain" as const) : (data.fit ?? ("cover" as const)),
    objectPosition:
      role === "full"
        ? "50% 50%"
        : `${(data.focalX ?? 0.5) * 100}% ${(data.focalY ?? 0) * 100}%`,
  };
}
