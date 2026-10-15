import { cache } from "react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, evaluateAccess, ForbiddenError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { returnPolicySchema } from "@/modules/returns/validation";
import { localizedTextSchema } from "./validation";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const SERVICE_KEYS = [
  "shipping",
  "returns",
  "prices",
  "support",
] as const;
const copy = z
  .object({ title: localizedTextSchema, body: localizedTextSchema })
  .strict();
export const servicePolicySchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0).max(2147483646),
    announcement: z.boolean(),
    shippingRuleIds: z
      .array(id)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length),
    faqPageId: id.optional(),
    shipping: copy,
    returns: copy,
    prices: copy,
    support: copy,
  })
  .strict();
export type ServicePolicy = z.infer<typeof servicePolicySchema>;
export async function saveServicePolicy(actorId: string, raw: unknown) {
  const input = z
    .object({
      marketId: id,
      expectedRevision: z.number().int().min(0).max(2147483645),
      policy: servicePolicySchema.omit({ revision: true }),
    })
    .strict()
    .parse(raw);
  const scope = { marketId: input.marketId };
  await assertCan(actorId, "markets.edit", scope);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Market" WHERE id=${input.marketId} FOR UPDATE`;
      const market = await tx.market.findUniqueOrThrow({
        where: { id: input.marketId },
      });
      const previous = servicePolicySchema.safeParse(market.servicePolicy);
      if (
        input.expectedRevision !==
        (previous.success ? previous.data.revision : 0)
      )
        throw new RevisionConflictError();
      const ids = [...input.policy.shippingRuleIds].sort();
      if (ids.length) {
        const rules = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "FeeRule" WHERE id IN (${Prisma.join(ids)}) AND "marketId"=${market.id} AND type='SHIPPING' ORDER BY id FOR SHARE`,
        );
        if (rules.length !== ids.length) throw new z.ZodError([]);
      }
      if (input.policy.faqPageId) {
        await tx.$queryRaw`SELECT id FROM "Page" WHERE id=${input.policy.faqPageId} FOR SHARE`;
        const page = await tx.page.findFirst({
          where: {
            id: input.policy.faqPageId,
            status: "published",
            deletedAt: null,
            OR: [
              { marketIds: { has: market.id } },
              { marketIds: { isEmpty: true } },
            ],
          },
        });
        if (!page) throw new z.ZodError([]);
      }
      const user = await tx.user.findUnique({
        where: { id: actorId },
        include: {
          overrides: true,
          roles: { include: { role: { include: { permissions: true } } } },
        },
      });
      if (!evaluateAccess(user, "markets.edit", scope))
        throw new ForbiddenError("markets.edit", scope);
      const policy = { ...input.policy, revision: input.expectedRevision + 1 };
      await tx.market.update({
        where: { id: market.id },
        data: { servicePolicy: policy as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "markets.service-policy.updated",
          entityType: "Market",
          entityId: market.id,
          before: market.servicePolicy ?? Prisma.DbNull,
          after: policy as Prisma.InputJsonValue,
        },
      });
      return policy.revision;
    }),
  );
}
/** One current market source: no entered shipping amount/threshold/return-window duplicate. */
export const currentServicePolicy = cache(async (marketId: string) => {
  const market = await db.market.findUnique({ where: { id: marketId } });
  if (!market?.isActive) return null;
  const parsed = servicePolicySchema.safeParse(market.servicePolicy);
  const policy = parsed.success ? parsed.data : null;
  const [clock] = await db.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  const rules = policy?.shippingRuleIds.length
    ? await db.feeRule.findMany({
        where: {
          id: { in: policy.shippingRuleIds },
          marketId,
          type: "SHIPPING",
          isActive: true,
          validFrom: { lte: clock.now },
          OR: [{ validUntil: null }, { validUntil: { gt: clock.now } }],
        },
        orderBy: [{ priority: "desc" }, { id: "asc" }],
      })
    : [];
  const returns = returnPolicySchema.safeParse(market.returnSettings);
  return {
    code: market.code,
    policy,
    returns: returns.success ? returns.data : null,
    support: market.supportChannels,
    rules: rules.map((rule) => ({
      id: rule.id,
      label: rule.labelI18n,
      currency: rule.currency,
      minAmount: rule.minAmount?.toFixed(4) ?? null,
      maxAmount: rule.maxAmount?.toFixed(4) ?? null,
      absorbed: rule.absorb,
      conditional: Boolean(
        rule.province ||
        rule.city ||
        rule.postalPrefix ||
        rule.categoryIds.length ||
        rule.selectable,
      ),
    })),
  };
});
