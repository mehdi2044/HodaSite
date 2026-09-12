import sharp from "sharp";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { pwaPresentation, escapeHtml } from "@/modules/pwa/presentation";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; size: string }> },
) {
  const { locale, size: raw } = await params;
  if (!["180", "192", "512"].includes(raw))
    return new Response(null, { status: 404 });
  const size = Number(raw),
    p = await pwaPresentation(locale);
  const media = p.logoMediaId
    ? await db.media.findFirst({
        where: {
          id: p.logoMediaId,
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
      })
    : null;
  // Only the configured public brand asset; no caller-supplied storage key or URL.
  const bytes = media?.storageKey.startsWith("media/")
    ? await storage.getBytes(media.storageKey)
    : null;
  const inner = Math.floor(size * 0.58);
  const fallback = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="${inner * 0.68}" fill="${escapeHtml(p.colors.text)}">${escapeHtml(Array.from(p.name || "")[0] || "◈")}</text></svg>`,
  );
  const logo = await sharp(bytes || fallback, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: p.colors.background,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
