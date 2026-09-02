import { NextResponse } from "next/server";
import { z } from "zod";
import { storage } from "@/modules/integrations/storage";
import { db } from "@/lib/db";
import crypto from "node:crypto";
const mime = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
]);
export async function POST(req: Request) {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  const type = mime.safeParse(file.type);
  if (!type.success || file.size > 5_000_000)
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const d = new Date();
  const key = `media/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  const url = await storage.put(
    key,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  const media = await db.media.create({
    data: {
      kind: file.type === "application/pdf" ? "document" : "image",
      storageKey: key,
      originalName: file.name,
      url,
      bytes: file.size,
      mime: file.type,
    },
  });
  return NextResponse.json({ id: media.id, url }, { status: 201 });
}
