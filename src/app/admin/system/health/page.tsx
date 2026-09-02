import { db } from "@/lib/db";
export default async function Health() {
  let ok = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    ok = false;
  }
  return (
    <>
      <h1>سلامت سیستم</h1>
      <div className="card">
        <p>دیتابیس: {ok ? "سالم" : "در دسترس نیست"}</p>
        <p>ذخیره‌سازی: {process.env.STORAGE_DRIVER ?? "local"}</p>
        <p>آخرین بکاپ: هنوز بکاپی نیست</p>
        <p>آخرین نرخ ارز: در فاز ۰۳</p>
      </div>
    </>
  );
}
