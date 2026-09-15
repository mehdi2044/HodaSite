import { getTranslations } from "next-intl/server";
import { ScopeFields } from "@/components/admin/security/scope-fields";
import { requireAdminPage } from "@/modules/auth/page";
import Link from "next/link";
import { db } from "@/lib/db";
import { createUser } from "../actions";
import { Button, Card, Input, Select } from "@/components/ui";

export default async function NewUser() {
  const legacy = await getTranslations("foundationAdmin");

  await requireAdminPage("users.manage");
  const roles = await db.role.findMany({ orderBy: { key: "asc" } });

  return (
    <>
      <h1>{legacy("newUser")}</h1>
      <Card className="mt-4 max-w-lg">
        <form action={createUser} className="grid gap-4">
          <label className="grid gap-1">
            {" "}
            {legacy("email")} <Input type="email" name="email" required />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("name")} <Input name="name" required />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("password")}{" "}
            <Input type="password" name="password" minLength={8} required />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("role")}{" "}
            <Select
              aria-label={legacy("role")}
              name="roleKey"
              required
              defaultValue="admin"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.key}
                </option>
              ))}
            </Select>
          </label>
          <ScopeFields />
          <div className="flex items-center gap-3">
            <Button type="submit">{legacy("createUser")}</Button>
            <Link href="/admin/users">{legacy("cancel")}</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
