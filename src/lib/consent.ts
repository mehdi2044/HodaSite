import { z } from "zod";
export const analyticsSchema = z.object({
  ga4: z
    .string()
    .trim()
    .regex(/^(G-[A-Z0-9]{4,30})?$/)
    .default(""),
  gtm: z
    .string()
    .trim()
    .regex(/^(GTM-[A-Z0-9]{4,30})?$/)
    .default(""),
  meta: z
    .string()
    .trim()
    .regex(/^[0-9]{0,30}$/)
    .default(""),
});
export type AnalyticsIds = z.infer<typeof analyticsSchema>;
export function analyticsIds(raw: unknown): AnalyticsIds {
  const result = analyticsSchema.safeParse(raw);
  return result.success ? result.data : analyticsSchema.parse({});
}
export function consentValid(
  raw: unknown,
  version: string,
  now = Date.now(),
): raw is { accepted: boolean; version: string; at: number } {
  const result = z
    .object({
      accepted: z.boolean(),
      version: z.literal(version),
      at: z
        .number()
        .int()
        .min(now - 180 * 86400000)
        .max(now),
    })
    .safeParse(raw);
  return result.success;
}
export function analyticsPublicPath(path: string) {
  return /^\/(fa|tr|en)(?:\/m\/[A-Za-z0-9_-]{1,40})?(?:\/(p|c|pages)\/[^/]+)?\/?$/.test(
    path,
  );
}
