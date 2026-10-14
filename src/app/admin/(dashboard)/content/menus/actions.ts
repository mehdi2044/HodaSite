"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { writeMenuItem, menuItemInputSchema } from "@/modules/content";

const bool = (value: FormDataEntryValue | null) => value === "on";
const values = (data: FormData, key: string) => data.getAll(key).map(String);

export async function createMenuOverride(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const parsed = z
      .object({
        key: z.enum(["header", "mobile", "footer"]),
        marketId: z.string().min(1),
      })
      .parse({ key: data.get("key"), marketId: data.get("marketId") });
    await assertCan(session.user.id, "content.menu.write", {
      marketId: parsed.marketId,
    });
    const [market, existing] = await Promise.all([
      db.market.findUnique({ where: { id: parsed.marketId } }),
      db.menu.findFirst({ where: { ...parsed, deletedAt: null } }),
    ]);
    if (!market || existing) throw new z.ZodError([]);
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const menu = await tx.menu.create({ data: parsed });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.menu.create_override",
            entityType: "Menu",
            entityId: menu.id,
            after: menu as object,
          },
        });
      }),
    );
    revalidateTag("menus");
    revalidatePath("/admin/content/menus");
  });
}

export async function saveMenuItem(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const selectedMenu = await db.menu.findFirst({
      where: { id: String(data.get("menuId") ?? ""), deletedAt: null },
    });
    await assertCan(
      session.user.id,
      "content.menu.write",
      selectedMenu?.marketId ? { marketId: selectedMenu.marketId } : undefined,
    );
    const input = menuItemInputSchema.parse({
      id: String(data.get("id") || "") || undefined,
      menuId: String(data.get("menuId") || ""),
      parentId: String(data.get("parentId") || "") || undefined,
      labelI18n: {
        fa: String(data.get("labelFa") || ""),
        tr: String(data.get("labelTr") || ""),
        en: String(data.get("labelEn") || ""),
      },
      linkType: String(data.get("linkType") || "url"),
      url: String(data.get("url") || "") || undefined,
      pageId: String(data.get("pageId") || "") || undefined,
      referenceId: String(data.get("referenceId") || "") || undefined,
      target: String(data.get("target") || "_self"),
      enabled: bool(data.get("enabled")),
      visibleIn: values(data, "visibleIn"),
      sortOrder: Number(data.get("sortOrder") || 0),
      expectedUpdatedAt:
        String(data.get("expectedUpdatedAt") || "") || undefined,
      presentation: {
        version: 1,
        mediaId: String(data.get("mediaId") || "") || undefined,
        fit: String(data.get("imageFit") || "contain"),
        tone: String(data.get("imageTone") || "sand"),
        focalX: Number(data.get("focalX") ?? 0.5),
        focalY: Number(data.get("focalY") ?? 0.5),
      },
    });

    await writeMenuItem(session.user.id, input);
    revalidateTag("menus");
    revalidatePath("/admin/content/menus");
  });
}

export async function deleteMenuItem(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const id = z.string().min(1).parse(data.get("id"));
    const before = await db.menuItem.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    const menu = await db.menu.findUniqueOrThrow({
      where: { id: before.menuId },
    });
    await assertCan(
      session.user.id,
      "content.menu.write",
      menu.marketId ? { marketId: menu.marketId } : undefined,
    );
    await withMutation(() =>
      db.$transaction([
        db.menuItem.updateMany({
          where: { OR: [{ id }, { parentId: id }], deletedAt: null },
          data: { deletedAt: new Date() },
        }),
        db.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.menu_item.delete",
            entityType: "MenuItem",
            entityId: id,
            before: before as object,
          },
        }),
      ]),
    );
    revalidateTag("menus");
    revalidatePath("/admin/content/menus");
  });
}

export async function reorderMenuItems(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const parsed = z
      .object({
        menuId: z.string().min(1),
        parentId: z.string().optional(),
        orderedIds: z.array(z.string().min(1)).min(1).max(200),
      })
      .parse({
        menuId: data.get("menuId"),
        parentId: String(data.get("parentId") || "") || undefined,
        orderedIds: parseJson(String(data.get("orderedIds") || "[]")),
      });
    const menu = await db.menu.findUniqueOrThrow({
      where: { id: parsed.menuId },
    });
    await assertCan(
      session.user.id,
      "content.menu.write",
      menu.marketId ? { marketId: menu.marketId } : undefined,
    );
    if (new Set(parsed.orderedIds).size !== parsed.orderedIds.length)
      throw new z.ZodError([]);
    const [count, parentCount] = await Promise.all([
      db.menuItem.count({
        where: {
          id: { in: parsed.orderedIds },
          menuId: parsed.menuId,
          parentId: parsed.parentId ?? null,
          deletedAt: null,
        },
      }),
      parsed.parentId
        ? db.menuItem.count({
            where: {
              id: parsed.parentId,
              menuId: parsed.menuId,
              parentId: null,
              deletedAt: null,
            },
          })
        : Promise.resolve(1),
    ]);
    if (count !== parsed.orderedIds.length || parentCount !== 1)
      throw new z.ZodError([]);
    await withMutation(() =>
      db.$transaction([
        ...parsed.orderedIds.map((id, sortOrder) =>
          db.menuItem.update({ where: { id }, data: { sortOrder } }),
        ),
        db.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.menu.reorder",
            entityType: "Menu",
            entityId: parsed.menuId,
            after: {
              parentId: parsed.parentId ?? null,
              orderedIds: parsed.orderedIds,
            },
          },
        }),
      ]),
    );
    revalidateTag("menus");
    revalidatePath("/admin/content/menus");
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
