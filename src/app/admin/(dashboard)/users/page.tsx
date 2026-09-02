import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { setUserActive } from "./actions";

type UserRow = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

export default async function Users() {
  let users: UserRow[] = [];
  let loadError = false;
  try {
    users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { roles: { include: { role: true } } },
    });
  } catch {
    loadError = true;
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>کاربران</h1>
        <Link className="button" href="/admin/users/new">
          کاربر جدید
        </Link>
      </div>

      {loadError ? (
        <div className="card" role="alert" style={{ color: "var(--error)" }}>
          دیتابیس در دسترس نیست — فهرست کاربران بارگذاری نشد.
        </div>
      ) : users.length === 0 ? (
        <div className="card">هنوز کاربری وجود ندارد.</div>
      ) : (
        <div className="card grid">
          {users.map((u) => (
            <div
              key={u.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ flex: 1 }}>
                <bdi dir="ltr">{u.email}</bdi> · {u.name} ·{" "}
                <span className="muted">
                  {u.roles.map((r) => r.role.key).join("، ") || "بدون نقش"}
                </span>{" "}
                · {u.isActive ? "فعال" : "غیرفعال"}
              </span>
              <Link href={`/admin/users/${u.id}`}>ویرایش</Link>
              <form
                action={async () => {
                  "use server";
                  await setUserActive(u.id, !u.isActive);
                }}
              >
                <button className="button" type="submit">
                  {u.isActive ? "غیرفعال‌کردن" : "فعال‌کردن"}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
