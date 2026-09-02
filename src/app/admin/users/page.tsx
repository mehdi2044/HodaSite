import { db } from "@/lib/db";
export default async function Users() {
  let users: Awaited<ReturnType<typeof db.user.findMany>> = [];
  try {
    users = await db.user.findMany();
  } catch {}
  return (
    <>
      <h1>کاربران</h1>
      {users.length ? (
        <div className="card">
          {users.map((u) => (
            <p key={u.id}>
              <bdi dir="ltr">{u.email}</bdi> · {u.isActive ? "فعال" : "غیرفعال"}
            </p>
          ))}
        </div>
      ) : (
        <div className="card">هنوز کاربری وجود ندارد.</div>
      )}
      <button className="button" style={{ marginTop: 16 }}>
        کاربر جدید
      </button>
    </>
  );
}
