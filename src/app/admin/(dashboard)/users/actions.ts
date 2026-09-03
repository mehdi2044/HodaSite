"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";

async function actingUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  await assertCan(session.user.id, "users.manage");
  return session.user.id;
}

async function audit(
  userId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await db.auditLog.create({
    data: {
      userId,
      action,
      entityType: "User",
      entityId,
      before: (before ?? undefined) as object | undefined,
      after: (after ?? undefined) as object | undefined,
    },
  });
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  roleKey: z.string().min(1),
});

export async function createUser(data: FormData) {
  const actor = await actingUser();
  const input = createSchema.parse(Object.fromEntries(data));
  await withMutation(async () => {
    const role = await db.role.findUniqueOrThrow({
      where: { key: input.roleKey },
    });
    const user = await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 12),
        roles: { create: { roleId: role.id } },
      },
    });
    await audit(actor, "users.create", user.id, null, {
      email: user.email,
      name: user.name,
      role: input.roleKey,
    });
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

const updateSchema = z.object({
  name: z.string().min(1),
  roleKey: z.string().min(1),
  isActive: z.enum(["true", "false"]),
});

export async function updateUser(id: string, data: FormData) {
  const actor = await actingUser();
  const input = updateSchema.parse(Object.fromEntries(data));
  await withMutation(async () => {
    const before = await db.user.findUniqueOrThrow({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    const role = await db.role.findUniqueOrThrow({
      where: { key: input.roleKey },
    });
    await db.$transaction([
      db.userRole.deleteMany({ where: { userId: id } }),
      db.user.update({
        where: { id },
        data: {
          name: input.name,
          isActive: input.isActive === "true",
          roles: { create: { roleId: role.id } },
        },
      }),
    ]);
    await audit(
      actor,
      "users.update",
      id,
      {
        name: before.name,
        isActive: before.isActive,
        roles: before.roles.map((r) => r.role.key),
      },
      {
        name: input.name,
        isActive: input.isActive === "true",
        role: input.roleKey,
      },
    );
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function setUserActive(id: string, active: boolean) {
  const actor = await actingUser();
  await withMutation(async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    if (before.isActive === active) return;
    await db.user.update({ where: { id }, data: { isActive: active } });
    await audit(
      actor,
      active ? "users.reactivate" : "users.deactivate",
      id,
      { isActive: before.isActive },
      { isActive: active },
    );
  });
  revalidatePath("/admin/users");
}
