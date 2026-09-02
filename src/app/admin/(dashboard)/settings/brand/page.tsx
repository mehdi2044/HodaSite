import { db } from "@/lib/db";
import { saveBrand } from "./actions";
export default async function Brand() {
  const s = await db.siteSettings.findUnique({ where: { id: "default" } });
  const b = (s?.brand ?? {}) as Record<string, string>;
  return (
    <>
      <h1>هویت برند</h1>
      <form action={saveBrand} className="card grid">
        {["fa", "tr", "en"].map((x) => (
          <label key={x}>
            نام سایت ({x})
            <input className="input" name={x} defaultValue={b[x]} required />
          </label>
        ))}
        <label>
          لوگو
          <input className="input" type="file" disabled />
        </label>
        <small>آپلود لوگو در فاز ۰۱ فعال می‌شود.</small>
        <button className="button">ذخیره</button>
      </form>
    </>
  );
}
