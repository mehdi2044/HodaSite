import { z } from "zod";
import { safeLinkSchema } from "@/modules/content";

const LOCALES = ["fa", "tr", "en"] as const;

export const marketInputSchema = z
  .object({
    marketId: z.string().min(1),
    isActive: z.enum(["on"]).optional(),
    salesPaused: z.enum(["on"]).optional(),
    defaultLocale: z.enum(LOCALES),
    enabledLocales: z.array(z.enum(LOCALES)).min(1),
    phone: z.string().optional().default(""),
    whatsapp: z.string().optional().default(""),
    telegram: z.string().optional().default(""),
    email: z.string().optional().default(""),
    announcementEnabled: z.enum(["on"]).optional(),
    announcementLink: z
      .union([z.literal(""), safeLinkSchema])
      .optional()
      .default(""),
    announcementFa: z.string().optional().default(""),
    announcementTr: z.string().optional().default(""),
    announcementEn: z.string().optional().default(""),
    seoTitleFa: z.string().optional().default(""),
    seoTitleTr: z.string().optional().default(""),
    seoTitleEn: z.string().optional().default(""),
    seoDescriptionFa: z.string().optional().default(""),
    seoDescriptionTr: z.string().optional().default(""),
    seoDescriptionEn: z.string().optional().default(""),
  })
  .superRefine((value, context) => {
    if (!value.enabledLocales.includes(value.defaultLocale))
      context.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "defaultLocale must be one of enabledLocales",
      });
  });
