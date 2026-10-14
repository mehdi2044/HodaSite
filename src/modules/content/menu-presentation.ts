import { z } from "zod";

export const MENU_TONES = [
  "sand",
  "background",
  "surface",
  "kidsPink",
  "kidsMint",
  "kidsSky",
] as const;
export const menuPresentationSchema = z.object({
  version: z.literal(1).default(1),
  mediaId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
  fit: z.enum(["cover", "contain"]).default("cover"),
  focalX: z.number().min(0).max(1).default(0.5),
  focalY: z.number().min(0).max(1).default(0.5),
  tone: z.enum(MENU_TONES).default("sand"),
});
export function menuPresentation(raw: unknown) {
  return (
    menuPresentationSchema.safeParse(raw).data ??
    menuPresentationSchema.parse({})
  );
}
