import { z } from "zod";
import { db } from "@/lib/db";
import { registerJobHandler, JobDeferredError } from "@/modules/jobs";
import {
  getEmailProvider,
  renderTemplate,
  ALLOWED_TEMPLATE_VARIABLES,
} from "@/modules/notifications";
import { normalizeSeo, localized, seoPath } from "@/lib/seo";
import { normalizeBrand } from "@/lib/brand";
export async function scheduleStockAlerts() {
  // Stock predicate is inside the bounded query: unavailable rows cannot starve later alerts.
  const rows = await db.$queryRaw<{ id: string; generation: number }[]>`
    SELECT a.id, a.generation FROM "StockAlert" a
    JOIN "Customer" c ON c.id=a."customerId"
    JOIN "Market" m ON m.id=a."marketId"
    JOIN "Variant" v ON v.id=a."variantId"
    JOIN "Product" p ON p.id=v."productId"
    WHERE a.active AND a."notifiedAt" IS NULL AND c."isActive" AND NOT c."isGuest"
      AND m."isActive" AND a.locale=ANY(m."enabledLocales")
      AND v."isActive" AND p.status='ACTIVE' AND p."deletedAt" IS NULL AND m.id=ANY(p."marketIds")
      AND EXISTS (SELECT 1 FROM "StockItem" s WHERE s."variantId"=v.id AND s."onHand">s.reserved)
      AND NOT EXISTS (SELECT 1 FROM "Job" j WHERE j.id='stock-' || a.id || '-' || a.generation)
    ORDER BY a."createdAt", a.id LIMIT 100`;
  if (rows.length)
    await db.job.createMany({
      data: rows.map((r) => ({
        id: `stock-${r.id}-${r.generation}`,
        type: "stock-alert",
        payload: { id: r.id, generation: r.generation },
      })),
      skipDuplicates: true,
    });
}
export function registerStockJobs() {
  registerJobHandler("stock-alert", async (job) => {
    const input = z
      .object({ id: z.string(), generation: z.number().int() })
      .parse(job.payload);
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "StockAlert" WHERE id=${input.id} FOR UPDATE`;
        const alert = await tx.stockAlert.findUnique({
          where: { id: input.id },
          include: {
            customer: true,
            market: true,
            variant: { include: { stockItems: true, product: true } },
          },
        });
        if (
          !alert ||
          !alert.active ||
          alert.notifiedAt ||
          alert.generation !== input.generation ||
          !alert.customer.isActive ||
          alert.customer.isGuest
        )
          return;
        const p = alert.variant.product;
        if (
          !alert.market.isActive ||
          !alert.market.enabledLocales.includes(alert.locale) ||
          !alert.variant.isActive ||
          p.status !== "ACTIVE" ||
          p.deletedAt ||
          !p.marketIds.includes(alert.marketId)
        )
          return;
        if (!alert.variant.stockItems.some((s) => s.onHand > s.reserved))
          throw new JobDeferredError("STOCK_UNAVAILABLE");
        const site = await tx.siteSettings.findUnique({
            where: { id: "default" },
          }),
          seo = normalizeSeo(site?.seo);
        const template = await tx.notificationTemplate.findUnique({
          where: { key_channel: { key: "stock.available", channel: "email" } },
        });
        if (
          !seo.origin ||
          !template?.isActive ||
          !["smtp", "resend"].includes(process.env.EMAIL_PROVIDER ?? "")
        )
          throw new JobDeferredError("STOCK_DELIVERY_NOT_CONFIGURED");
        const locale = z.enum(["fa", "tr", "en"]).parse(alert.locale),
          brand = normalizeBrand(site?.brand);
        const values = {
          productName: localized(p.titleI18n, locale),
          productUrl:
            seo.origin +
            seoPath(
              locale,
              alert.market.code,
              "p",
              localized(p.slugI18n, locale),
            ),
          accountUrl: seo.origin + `/${locale}/account`,
        };
        try {
          await getEmailProvider().send({
            to: alert.customer.email,
            fromName: brand.name[locale],
            templateKey: "stock.available",
            idempotencyKey: job.id,
            subject: renderTemplate(
              localized(template.subjectI18n, locale) ||
                localized(template.subjectI18n, "en"),
              ALLOWED_TEMPLATE_VARIABLES["stock.available"],
              values,
            ),
            text: renderTemplate(
              localized(template.bodyI18n, locale) ||
                localized(template.bodyI18n, "en"),
              ALLOWED_TEMPLATE_VARIABLES["stock.available"],
              values,
            ),
          });
        } catch {
          throw new Error("STOCK_EMAIL_FAILED");
        }
        await tx.stockAlert.update({
          where: { id: alert.id },
          data: { notifiedAt: new Date(), active: false },
        });
      },
      { timeout: 30000 },
    );
  });
}
