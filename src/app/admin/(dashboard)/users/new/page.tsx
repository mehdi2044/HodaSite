import Link from "next/link";
import { db } from "@/lib/db";
import { createUser } from "../actions";

export default async function NewUser() {
  const roles = await db.role.findMany({ orderBy: { key: "asc" } });

  return (
    <>
      <h1>کاربر جدید</h1>
      <form action={createUser} className="card grid" style={{ maxWidth: 480 }}>
        <label>
          ایمیل
          <input className="input" type="email" name="email" required />
        </label>
        <label>
          نام
          <input className="input" name="name" required />
        </label>
        <label>
          رمز عبور (حداقل ۸ نویسه)
          <input
            className="input"
            type="password"
            name="password"
            minLength={8}
            required
          />
        </label>
        <label>
          نقش
          <select
            className="input"
            name="roleKey"
            required
            defaultValue="admin"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.key}>
                {r.key}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="button" type="submit">
            ساخت کاربر
          </button>
          <Link href="/admin/users">انصراف</Link>
        </div>
      </form>
    </>
  );
}
