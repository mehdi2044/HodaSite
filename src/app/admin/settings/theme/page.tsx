import { db } from "@/lib/db";
import { saveTheme } from "./actions";
export default async function Theme() {
  const t = await db.themeSettings.findUnique({ where: { id: "default" } });
  const c = (t?.colors ?? {}) as Record<string, string>;
  return (
    <>
      <h1>پوسته</h1>
      <form action={saveTheme} className="card grid">
        <label>
          رنگ اصلی
          <input
            name="primary"
            type="color"
            defaultValue={c.primary ?? "#E8792A"}
          />
        </label>
        <div
          style={{
            padding: 32,
            background: c.primary,
            color: "white",
            borderRadius: 12,
          }}
        >
          پیش‌نمایش زنده رنگ برند
        </div>
        <button className="button">ذخیره</button>
      </form>
    </>
  );
}
