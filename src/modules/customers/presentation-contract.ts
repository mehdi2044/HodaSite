import { z } from "zod";
export const PROFILE_THEMES = ["ROSE", "SLATE", "SAND"] as const;
const ids = z
  .array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
  .max(20)
  .transform((values) => [...new Set(values)]);
export const stylePreferencesSchema = z
  .object({ version: z.literal(1), sizeIds: ids, categoryIds: ids })
  .strict();
export function readStylePreferences(value: unknown) {
  return (
    stylePreferencesSchema.safeParse(value).data ?? {
      version: 1 as const,
      sizeIds: [],
      categoryIds: [],
    }
  );
}
export const profileTheme = (value: unknown) =>
  z.enum(PROFILE_THEMES).safeParse(value).data ?? null;
export const presentationInputSchema = z
  .object({
    expectedVersion: z.number().int().min(0).max(2147483646),
    theme: z.enum(PROFILE_THEMES).nullable(),
    sizeIds: ids,
    categoryIds: ids,
    clear: z.boolean().default(false),
  })
  .strict();
