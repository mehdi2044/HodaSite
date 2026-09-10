"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { acceptFxQuote, refreshFxRates } from "@/modules/pricing";

const positive = z
  .string()
  .trim()
  .refine((x) => /^\d+(\.\d+)?$/.test(x) && Number(x) > 0);
const schema = z.object({
  marketId: z.string().min(1),
  rate: positive,
  confirm: z.literal("on"),
});

async function user(permission = "pricing.fx.manage") {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, permission);
  return session.user.id;
}

export async function refreshRates(): Promise<ActionResult> {
  return runAction(async () => {
    await user();
    await withMutation(async () => {
      await refreshFxRates();
    });
    revalidatePath("/admin/pricing/fx");
  });
}

export async function saveFxConfiguration(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user();
    const parsed = z
      .object({
        intlProvider: z.enum(["frankfurter", "manual"]),
        irtProvider: z.enum(["navasan", "manual"]),
        navasanField: z.enum(["usd_sell", "usd_buy"]),
        refreshHours: z.coerce.number().int().min(1).max(168),
        isActive: z.string().optional(),
      })
      .parse(Object.fromEntries(data));
    await withMutation(async () => {
      const before = await db.integration.findUnique({ where: { key: "fx" } });
      const config = {
        intlProvider: parsed.intlProvider,
        irtProvider: parsed.irtProvider,
        navasanField: parsed.navasanField,
        refreshHours: parsed.refreshHours,
      };
      const integration = await db.integration.upsert({
        where: { key: "fx" },
        update: {
          provider: "multi",
          config,
          isActive: parsed.isActive === "on",
        },
        create: {
          key: "fx",
          provider: "multi",
          config,
          isActive: parsed.isActive === "on",
        },
      });
      await db.auditLog.create({
        data: {
          userId,
          action: "fx.configuration.update",
          entityType: "Integration",
          entityId: integration.id,
          before: before
            ? { config: before.config, isActive: before.isActive }
            : undefined,
          after: { config, isActive: integration.isActive },
        },
      });
    });
    revalidatePath("/admin/pricing/fx");
  });
}

export async function acceptRate(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user();
    const id = z.string().min(1).parse(data.get("id"));
    await withMutation(async () => {
      await acceptFxQuote(id, userId);
    });
    revalidatePath("/admin/pricing/fx");
  });
}

export async function saveManualRate(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user();
    const parsed = schema.parse(Object.fromEntries(data));
    await withMutation(async () => {
      const market = await db.market.findUniqueOrThrow({
        where: { id: parsed.marketId },
      });
      const quote = await db.fxQuote.create({
        data: {
          marketId: market.id,
          quoteCurrency: market.currency,
          rate: parsed.rate,
          provider: "manual",
        },
      });
      await acceptFxQuote(quote.id, userId);
      await db.auditLog.create({
        data: {
          userId,
          action: "fx.manual",
          entityType: "FxQuote",
          entityId: quote.id,
          after: { rate: parsed.rate, currency: market.currency },
        },
      });
    });
    revalidatePath("/admin/pricing/fx");
  });
}

export async function saveOverride(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user();
    const parsed = schema
      .extend({
        note: z.string().trim().min(3),
        validFrom: z.coerce.date(),
        validUntil: z.union([z.literal(""), z.coerce.date()]),
      })
      .parse(Object.fromEntries(data));
    await withMutation(async () => {
      const row = await db.fxOverride.create({
        data: {
          marketId: parsed.marketId,
          rate: parsed.rate,
          note: parsed.note,
          validFrom: parsed.validFrom,
          validUntil: parsed.validUntil || null,
          createdBy: userId,
        },
      });
      await db.auditLog.create({
        data: {
          userId,
          action: "fx.override.create",
          entityType: "FxOverride",
          entityId: row.id,
          after: { rate: parsed.rate, note: parsed.note },
        },
      });
    });
    revalidateTag("pricing");
    revalidatePath("/admin/pricing/fx");
  });
}

export async function saveMarketPricing(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user();
    const parsed = z
      .object({
        marketId: z.string(),
        markupPercent: z.coerce.number().min(0).max(1000),
        fxMaxJumpPercent: z.coerce.number().positive().max(100),
        fxStaleHours: z.coerce.number().int().positive(),
        volumetricDivisor: z.coerce.number().int().positive(),
        roundingMode: z.enum(["HALF_UP", "HALF_EVEN", "NEAREST", "UP", "DOWN"]),
        roundingIncrement: positive,
        roundingEnding: z.string().optional(),
        taxIncluded: z.string().optional(),
      })
      .parse(Object.fromEntries(data));
    await withMutation(async () => {
      const before = await db.market.findUniqueOrThrow({
        where: { id: parsed.marketId },
      });
      const roundingRule = {
        mode: parsed.roundingMode,
        increment: parsed.roundingIncrement,
        ...(parsed.roundingEnding ? { ending: parsed.roundingEnding } : {}),
      };
      await db.market.update({
        where: { id: parsed.marketId },
        data: {
          markupPercent: parsed.markupPercent.toString(),
          fxMaxJumpPercent: parsed.fxMaxJumpPercent.toString(),
          fxStaleHours: parsed.fxStaleHours,
          volumetricDivisor: parsed.volumetricDivisor,
          roundingRule,
          priceIncludesTax: parsed.taxIncluded === "on",
        },
      });
      await db.auditLog.create({
        data: {
          userId,
          action: "pricing.market.update",
          entityType: "Market",
          entityId: parsed.marketId,
          before: {
            markupPercent: before.markupPercent.toString(),
            roundingRule: before.roundingRule,
          },
          after: { markupPercent: parsed.markupPercent, roundingRule },
        },
      });
    });
    revalidateTag("pricing");
    revalidatePath("/admin/pricing/fx");
  });
}

export async function saveMarketPrice(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("pricing.sale_price.edit");
    const parsed = z
      .object({
        marketId: z.string(),
        targetType: z.enum(["product", "variant"]),
        targetId: z.string(),
        amount: positive,
        compareAtAmount: z.string().optional(),
        validFrom: z.coerce.date(),
        validUntil: z.union([z.literal(""), z.coerce.date()]),
      })
      .parse(Object.fromEntries(data));
    const market = await db.market.findUniqueOrThrow({
      where: { id: parsed.marketId },
    });
    await withMutation(async () => {
      const row = await db.marketPrice.create({
        data: {
          marketId: market.id,
          ...(parsed.targetType === "product"
            ? { productId: parsed.targetId }
            : { variantId: parsed.targetId }),
          amount: parsed.amount,
          compareAtAmount: parsed.compareAtAmount || null,
          currency: market.currency,
          validFrom: parsed.validFrom,
          validUntil: parsed.validUntil || null,
        },
      });
      await db.auditLog.create({
        data: {
          userId,
          action: "pricing.override.create",
          entityType: "MarketPrice",
          entityId: row.id,
          after: { amount: parsed.amount, currency: market.currency },
        },
      });
    });
    revalidateTag("pricing");
  });
}

export async function endMarketPrice(
  _p: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await user("pricing.sale_price.edit");
    const id = z.string().min(1).parse(data.get("id"));
    await withMutation(async () => {
      const before = await db.marketPrice.findUniqueOrThrow({ where: { id } });
      await db.marketPrice.update({ where: { id }, data: { isActive: false } });
      await db.auditLog.create({
        data: {
          userId,
          action: "pricing.override.end",
          entityType: "MarketPrice",
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive: false },
        },
      });
    });
    revalidateTag("pricing");
    revalidatePath("/admin/pricing/fx");
  });
}
