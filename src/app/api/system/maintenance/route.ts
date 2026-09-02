import { NextResponse } from "next/server";
import { db } from "@/lib/db";
function auth(r: Request) {
  return (
    r.headers.get("x-maintenance-secret") === process.env.MAINTENANCE_SECRET
  );
}
export async function GET(r: Request) {
  if (!auth(r))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await db.siteSettings.findUnique({ where: { id: "default" } });
  const m = s?.maintenance as { state?: string } | null;
  return NextResponse.json({ state: m?.state ?? "off", inFlight: 0 });
}
export async function POST(r: Request) {
  if (!auth(r))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await r.text();
  const state = new URLSearchParams(text).get("state") === "on" ? "on" : "off";
  await db.siteSettings.update({
    where: { id: "default" },
    data: { maintenance: { state } },
  });
  return NextResponse.json({ state, inFlight: 0 });
}
