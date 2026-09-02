import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { updateUser } from "../actions";

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
      <form
        action={updateThisUser}
        className="card grid"
        style={{ maxWidth: 480 }}
      >
        <label>
          نام
          <input
            className="input"
            name="name"
            defaultValue={user.name}
            required
          />
        </label>
        <label>
          نقش
          <select className="input" name="roleKey" defaultValue={currentRole}>
            {roles.map((r) => (
              <option key={r.id} value={r.key}>
                {r.key}
              </option>
            ))}
          </select>
        </label>
        <label>
          وضعیت
          <select
            className="input"
            name="isActive"
            defaultValue={String(user.isActive)}
          >
            <option value="true">فعال</option>
            <option value="false">غیرفعال</option>
          </select>
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="button" type="submit">
            ذخیره
          </button>
          <Link href="/admin/users">انصراف</Link>
        </div>
      </form>
    </>
  );
}
