import { db } from "@/lib/db";
import { saveTheme } from "./actions";
import { Button, Card } from "@/components/ui";

export default async function Theme() {
  const t = await db.themeSettings.findUnique({ where: { id: "default" } });
  const c = (t?.colors ?? {}) as Record<string, string>;
  return (
    <>
      <h1>پوسته</h1>
      <Card className="mt-4 max-w-lg">
        <form action={saveTheme} className="grid gap-4">
          <label className="grid gap-1">
            رنگ اصلی
            <input
              name="primary"
              type="color"
              defaultValue={c.primary ?? "#E8792A"}
              className="h-11 w-full rounded-[10px] border border-black/15"
            />
          </label>
          <div
            className="rounded-token p-8 text-white"
            style={{ background: c.primary ?? "#E8792A" }}
          >
            پیش‌نمایش زندهٔ رنگ برند
          </div>
          <Button type="submit">ذخیره</Button>
        </form>
      </Card>
    </>
  );
}
