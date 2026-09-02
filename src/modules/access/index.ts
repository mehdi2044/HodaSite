import { db } from "@/lib/db";
export async function can(userId: string, permission: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!user?.isActive) return false;
  const override = user.overrides.find((x) => x.permission === permission);
  if (override) return override.allow;
  return user.roles.some((x) =>
    x.role.permissions.some(
      (p) => p.permission === "*" || p.permission === permission,
    ),
  );
}
export async function assertCan(userId: string, permission: string) {
  if (!(await can(userId, permission))) throw new Error("FORBIDDEN");
}
