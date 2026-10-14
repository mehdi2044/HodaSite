import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { currentCustomer } from "./index";
import { CommerceError } from "@/modules/orders/state";
import { presentationInputSchema } from "./presentation-contract";
/** Identity comes only from the verified session, never a customer ID in input. */
export async function saveCustomerPresentation(raw: unknown) {
  const input = presentationInputSchema.parse(raw);
  const actor = await currentCustomer();
  if (!actor || actor.isGuest) throw new CommerceError("LOGIN_REQUIRED");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${actor.id} FOR UPDATE`;
      const current = await tx.customer.findUniqueOrThrow({
        where: { id: actor.id },
      });
      if (
        !current.isActive ||
        current.isGuest ||
        current.sessionVersion !== actor.sessionVersion
      )
        throw new CommerceError("LOGIN_REQUIRED");
      if (current.presentationVersion !== input.expectedVersion)
        throw new CommerceError("PROFILE_CONFLICT");
      if (!input.clear) {
        // Match catalog soft-delete writers while validating the chosen real IDs.
        if (input.sizeIds.length) {
          const rows = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "Size" WHERE id IN (${Prisma.join([...input.sizeIds].sort())}) AND "deletedAt" IS NULL ORDER BY id FOR SHARE`,
          );
          if (rows.length !== input.sizeIds.length)
            throw new CommerceError("VALIDATION");
        }
        if (input.categoryIds.length) {
          const rows = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "Category" WHERE id IN (${Prisma.join([...input.categoryIds].sort())}) AND "deletedAt" IS NULL ORDER BY id FOR SHARE`,
          );
          if (rows.length !== input.categoryIds.length)
            throw new CommerceError("VALIDATION");
        }
      }
      const saved = await tx.customer.update({
        where: { id: actor.id },
        data: {
          profileTheme: input.clear ? null : input.theme,
          stylePreferences: input.clear
            ? Prisma.DbNull
            : {
                version: 1,
                sizeIds: input.sizeIds,
                categoryIds: input.categoryIds,
              },
          presentationVersion: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          action: "customer.presentation.updated",
          entityType: "Customer",
          entityId: actor.id,
          after: {
            cleared: input.clear,
            themeSet: !input.clear && input.theme !== null,
            sizesCount: input.clear ? 0 : input.sizeIds.length,
            interestsCount: input.clear ? 0 : input.categoryIds.length,
          },
        },
      });
      return { version: saved.presentationVersion };
    }),
  );
}
