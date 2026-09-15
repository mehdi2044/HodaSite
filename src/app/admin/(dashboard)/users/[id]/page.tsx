import { getTranslations } from "next-intl/server";
import { ScopeFields } from "@/components/admin/security/scope-fields";
import { requireAdminPage } from "@/modules/auth/page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { updateUser } from "../actions";
import { Button, Card, Input, Select } from "@/components/ui";

export default async function EditUser({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const legacy = await getTranslations("foundationAdmin");

  await requireAdminPage("users.manage");
  const { id } = await params;
  const [user, roles] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    }),
    db.role.findMany({ orderBy: { key: "asc" } }),
  ]);
  if (!user) notFound();

  const currentRole = user.roles[0]?.role.key ?? "admin";
  const updateThisUser = updateUser.bind(null, id);

  return (
    <>
      <h1>
        {" "}
        {legacy("editUser")} <bdi dir="ltr">{user.email}</bdi>
      </h1>
      <Card className="mt-4 max-w-lg">
        <form action={updateThisUser} className="grid gap-4">
          <label className="grid gap-1">
            {" "}
            {legacy("name")}{" "}
            <Input name="name" defaultValue={user.name} required />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("role")}{" "}
            <Select
              aria-label={legacy("role")}
              name="roleKey"
              defaultValue={currentRole}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.key}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("status")}{" "}
            <Select
              aria-label={legacy("status")}
              name="isActive"
              defaultValue={String(user.isActive)}
            >
              <option value="true">{legacy("active")}</option>
              <option value="false">{legacy("inactive")}</option>
            </Select>
          </label>
          <ScopeFields
            value={
              (user.roles[0]?.scope ?? {}) as import("@/modules/access").Scope
            }
          />
          <div className="flex items-center gap-3">
            <Button type="submit">{legacy("save")}</Button>
            <Link href="/admin/users">{legacy("cancel")}</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
