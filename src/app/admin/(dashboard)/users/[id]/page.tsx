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
        ویرایش کاربر: <bdi dir="ltr">{user.email}</bdi>
      </h1>
      <Card className="mt-4 max-w-lg">
        <form action={updateThisUser} className="grid gap-4">
          <label className="grid gap-1">
            نام
            <Input name="name" defaultValue={user.name} required />
          </label>
          <label className="grid gap-1">
            نقش
            <Select name="roleKey" defaultValue={currentRole}>
              {roles.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.key}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1">
            وضعیت
            <Select name="isActive" defaultValue={String(user.isActive)}>
              <option value="true">فعال</option>
              <option value="false">غیرفعال</option>
            </Select>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit">ذخیره</Button>
            <Link href="/admin/users">انصراف</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
