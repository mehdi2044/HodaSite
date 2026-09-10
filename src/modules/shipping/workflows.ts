import { db } from "@/lib/db";
import { assertCan, can, ForbiddenError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { workflowSchema, ShippingError } from "./validation";
export async function shippingMarkets(
  userId: string,
  permission = "shipping.workflow.manage",
) {
  const markets = await db.market.findMany({ orderBy: { code: "asc" } });
  const result = [];
  for (const m of markets)
    if (await can(userId, permission, { marketId: m.id })) result.push(m);
  return result;
}
export async function saveWorkflow(userId: string, raw: unknown) {
  const input = workflowSchema.parse(raw);
  await assertCan(userId, "shipping.workflow.manage", {
    marketId: input.marketId,
  });
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Market" WHERE id=${input.marketId} FOR UPDATE`;
      await assertCan(userId, "shipping.workflow.manage", {
        marketId: input.marketId,
      });
      const before = input.id
        ? await tx.shippingWorkflow.findUnique({
            where: { id: input.id },
            include: { legs: true },
          })
        : null;
      if (input.id && (!before || before.marketId !== input.marketId))
        throw new ForbiddenError("shipping.workflow.manage");
      if (before && before.version !== input.version)
        throw new ShippingError("SHIPPING_STALE");
      if (input.isDefault && !input.isActive)
        throw new ShippingError("SHIPPING_DEFAULT");
      if (
        !input.isDefault &&
        (before?.isDefault ||
          !(await tx.shippingWorkflow.count({
            where: {
              marketId: input.marketId,
              isActive: true,
              isDefault: true,
            },
          })))
      )
        throw new ShippingError("SHIPPING_DEFAULT");
      if (input.isDefault)
        await tx.shippingWorkflow.updateMany({
          where: {
            marketId: input.marketId,
            isDefault: true,
            id: { not: input.id ?? "" },
          },
          data: { isDefault: false, version: { increment: 1 } },
        });
      const data = {
        nameI18n: input.nameI18n,
        isActive: input.isActive,
        isDefault: input.isDefault,
      };
      const after = before
        ? await tx.shippingWorkflow.update({
            where: { id: before.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.shippingWorkflow.create({
            data: { ...data, marketId: input.marketId },
          });
      await tx.shippingLegTemplate.deleteMany({
        where: { workflowId: after.id },
      });
      await tx.shippingLegTemplate.createMany({
        data: input.legs.map((l, sortOrder) => ({
          ...l,
          sortOrder,
          workflowId: after.id,
        })),
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "shipping.workflow.updated",
          entityType: "ShippingWorkflow",
          entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: input,
        },
      });
      return after.id;
    }),
  );
}
