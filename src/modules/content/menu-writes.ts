import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { lockMediaReferences } from "@/modules/media";
import { withMutation } from "@/lib/mutation-gate";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { isValidMenuParent, type MenuItemInput } from "./validation";

/** Persist references + presentation atomically, preserving the old item on conflict. */
export async function writeMenuItem(userId: string, input: MenuItemInput) {
  await withMutation(() =>
    db.$transaction(async (tx) => {
      const old = input.id
        ? await tx.menuItem.findUnique({ where: { id: input.id } })
        : null;
      const menuIds = [
        ...new Set(
          [input.menuId, old?.menuId].filter((id): id is string => Boolean(id)),
        ),
      ].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Menu" WHERE id IN (${Prisma.join(menuIds)}) ORDER BY id FOR SHARE`,
      );
      const menu = await tx.menu.findFirst({
        where: { id: input.menuId, deletedAt: null },
      });
      if (!menu) throw new z.ZodError([]);
      await assertCan(
        userId,
        "content.menu.write",
        menu.marketId ? { marketId: menu.marketId } : undefined,
      );
      if (old && old.menuId !== menu.id) {
        const source = await tx.menu.findUniqueOrThrow({
          where: { id: old.menuId },
        });
        await assertCan(
          userId,
          "content.menu.write",
          source.marketId ? { marketId: source.marketId } : undefined,
        );
      }
      const ids = [
        ...new Set(
          [input.id, input.parentId].filter((id): id is string => Boolean(id)),
        ),
      ].sort();
      if (ids.length)
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "MenuItem" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
        );
      const current = input.id
        ? await tx.menuItem.findFirst({
            where: { id: input.id, deletedAt: null },
            include: { children: { where: { deletedAt: null } } },
          })
        : null;
      if (
        input.id &&
        (!current ||
          !input.expectedUpdatedAt ||
          current.updatedAt.toISOString() !== input.expectedUpdatedAt)
      )
        throw new RevisionConflictError();
      const parent = input.parentId
        ? await tx.menuItem.findFirst({
            where: { id: input.parentId, deletedAt: null },
          })
        : null;
      if (
        !isValidMenuParent({
          itemId: input.id,
          menuId: menu.id,
          parentId: input.parentId,
          parentMenuId: parent?.menuId,
          parentParentId: parent?.parentId,
          currentHasChildren: Boolean(current?.children.length),
        })
      )
        throw new z.ZodError([]);
      if (input.linkType === "category" || input.linkType === "collection") {
        const rows =
          input.linkType === "category"
            ? await tx.$queryRaw<
                { id: string }[]
              >`SELECT id FROM "Category" WHERE id=${input.referenceId} AND "deletedAt" IS NULL FOR SHARE`
            : await tx.$queryRaw<
                { id: string }[]
              >`SELECT id FROM "Collection" WHERE id=${input.referenceId} AND "deletedAt" IS NULL FOR SHARE`;
        if (!rows.length) throw new z.ZodError([]);
      }
      if (input.linkType === "page") {
        await tx.$queryRaw`SELECT id FROM "Page" WHERE id=${input.pageId} FOR SHARE`;
        const page = await tx.page.findFirst({
          where: { id: input.pageId, deletedAt: null },
        });
        if (
          !page ||
          (input.enabled &&
            (page.status !== "published" ||
              (menu.marketId &&
                page.marketIds.length &&
                !page.marketIds.includes(menu.marketId))))
        )
          throw new z.ZodError([]);
      }
      await lockMediaReferences(tx, [input.presentation?.mediaId], {
        readyImages: true,
      });
      const data = {
        menuId: menu.id,
        parentId: input.parentId ?? null,
        labelI18n: input.labelI18n,
        linkType: input.linkType,
        url: input.linkType === "url" ? input.url : null,
        pageId: input.linkType === "page" ? input.pageId : null,
        referenceId: ["category", "collection"].includes(input.linkType)
          ? input.referenceId
          : null,
        target: input.target,
        enabled: input.enabled,
        visibleIn: input.visibleIn,
        sortOrder: input.sortOrder,
        presentation: input.presentation ?? Prisma.DbNull,
        ...(current
          ? {
              updatedAt: new Date(
                Math.max(Date.now(), current.updatedAt.getTime() + 1),
              ),
            }
          : {}),
      };
      const saved = current
        ? await tx.menuItem.update({ where: { id: current.id }, data })
        : await tx.menuItem.create({ data });
      const before = current ? { ...current, children: undefined } : undefined;
      await tx.auditLog.create({
        data: {
          userId,
          action: current
            ? "content.menu_item.update"
            : "content.menu_item.create",
          entityType: "MenuItem",
          entityId: saved.id,
          before: before as object | undefined,
          after: saved as object,
        },
      });
    }),
  );
}
