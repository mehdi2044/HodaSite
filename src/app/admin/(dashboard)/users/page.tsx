import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { setUserActive } from "./actions";

type UserRow = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

export default async function Users() {
  const legacy = await getTranslations("foundationAdmin");

  await requireAdminPage("users.view");
  let users: UserRow[] = [];
  let loadError = false;
  try {
    users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { roles: { include: { role: true } } },
    });
  } catch (err) {
    console.error("[admin/users] failed to load users:", err);
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
        <h1>{legacy("users")}</h1>
        <Link className="button" href="/admin/users/new">
          {" "}
          {legacy("newUser")}{" "}
        </Link>
      </div>

      {loadError ? (
        <div className="card" role="alert" style={{ color: "var(--error)" }}>
          {" "}
          {legacy("usersLoadError")}{" "}
        </div>
      ) : users.length === 0 ? (
        <div className="card">{legacy("noUsers")}</div>
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
                  {u.roles.map((r) => r.role.key).join("، ") ||
                    legacy("noRole")}
                </span>{" "}
                · {u.isActive ? legacy("active") : legacy("inactive")}
              </span>
              <Link href={`/admin/users/${u.id}`}>{legacy("edit")}</Link>
              <form
                action={async () => {
                  "use server";
                  await setUserActive(u.id, !u.isActive);
                }}
              >
                <button className="button" type="submit">
                  {u.isActive ? legacy("deactivate") : legacy("activate")}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
