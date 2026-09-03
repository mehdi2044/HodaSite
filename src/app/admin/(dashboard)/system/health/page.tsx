import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";

export default async function Health() {
  let ok = true;
  let lastBackup: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    lastBackup =
      (
        await db.backup.findFirst({
          where: { status: "DONE" },
          orderBy: { finishedAt: "desc" },
        })
      )?.finishedAt?.toISOString() ?? null;
  } catch (err) {
    console.error("[admin/system/health] database check failed:", err);
    ok = false;
  }

  return (
    <>
      <h1>سلامت سیستم</h1>
      <Card className="mt-4 grid max-w-lg gap-2">
        <p>
          دیتابیس:{" "}
          {ok ? (
            <Badge tone="success">سالم</Badge>
          ) : (
            <Badge tone="error">در دسترس نیست</Badge>
          )}
        </p>
        <p>ذخیره‌سازی: {process.env.STORAGE_PROVIDER ?? "local"}</p>
        <p>
          آخرین بکاپ:{" "}
          {lastBackup ? <bdi dir="ltr">{lastBackup}</bdi> : "هنوز بکاپی نیست"}
        </p>
        <p>آخرین نرخ ارز: در فاز ۰۳</p>
      </Card>
    </>
  );
}
