import { db } from "@/lib/db";
import { saveBrand } from "./actions";
import { Button, Card, Input } from "@/components/ui";

export default async function Brand() {
  const s = await db.siteSettings.findUnique({ where: { id: "default" } });
  const b = (s?.brand ?? {}) as Record<string, string>;
  return (
    <>
      <h1>هویت برند</h1>
      <Card className="mt-4 max-w-lg">
        <form action={saveBrand} className="grid gap-4">
          {["fa", "tr", "en"].map((x) => (
            <label key={x} className="grid gap-1">
              نام سایت ({x})
              <Input name={x} defaultValue={b[x]} required />
            </label>
          ))}
          <label className="grid gap-1">
            لوگو
            <Input type="file" disabled />
          </label>
          <small className="text-muted">
            آپلود لوگو در فاز ۰۱ فعال می‌شود.
          </small>
          <Button type="submit">ذخیره</Button>
        </form>
      </Card>
    </>
  );
}
