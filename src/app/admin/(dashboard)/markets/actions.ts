"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";

const LOCALES = ["fa", "tr", "en"] as const;

const schema = z
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
    announcementLink: z.string().optional().default(""),
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
  .superRefine((val, ctx) => {
    if (!val.enabledLocales.includes(val.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "defaultLocale must be one of enabledLocales",
      });
    }
  });

export async function saveMarket(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "markets.edit");
    const userId = session.user.id;

    const parsed = schema.parse({
      ...Object.fromEntries(data),
      enabledLocales: data.getAll("enabledLocales"),
    });

    const supportChannels = {
      phone: parsed.phone,
      whatsapp: parsed.whatsapp,
      telegram: parsed.telegram,
      email: parsed.email,
    };
    const announcementBar = {
      enabled: parsed.announcementEnabled === "on",
      link: parsed.announcementLink,
      text: {
        fa: parsed.announcementFa,
        tr: parsed.announcementTr,
        en: parsed.announcementEn,
      },
    };
    const seo = {
      title: {
        fa: parsed.seoTitleFa,
        tr: parsed.seoTitleTr,
        en: parsed.seoTitleEn,
      },
      description: {
        fa: parsed.seoDescriptionFa,
        tr: parsed.seoDescriptionTr,
        en: parsed.seoDescriptionEn,
      },
    };

    await withMutation(async () => {
      const current = await db.market.findUniqueOrThrow({
        where: { id: parsed.marketId },
      });
      const next = {
        isActive: parsed.isActive === "on",
        salesPaused: parsed.salesPaused === "on",
        defaultLocale: parsed.defaultLocale,
        enabledLocales: parsed.enabledLocales,
        supportChannels,
        announcementBar,
        seo,
      };
      await db.$transaction([
        db.market.update({ where: { id: parsed.marketId }, data: next }),
        db.auditLog.create({
          data: {
            userId,
            action: "markets.update",
            entityType: "Market",
            entityId: parsed.marketId,
            before: {
              isActive: current.isActive,
              salesPaused: current.salesPaused,
              defaultLocale: current.defaultLocale,
              enabledLocales: current.enabledLocales,
              supportChannels: current.supportChannels,
              announcementBar: current.announcementBar,
              seo: current.seo,
            } as object,
            after: next,
          },
        }),
      ]);
    });

    revalidateTag("markets");
  });
}
