import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { validReceiptSignature } from "@/modules/payments";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    url = new URL(req.url);
  if (
    !validReceiptSignature(
      id,
      url.searchParams.get("expires"),
      url.searchParams.get("signature"),
    )
  )
    return new Response(null, { status: 404 });
  const receipt = await db.receipt.findUnique({
    where: { id },
    include: { media: true },
  });
  if (!receipt || receipt.media.deletedAt)
    return new Response(null, { status: 404 });
  const bytes = await storage.getBytes(receipt.media.storageKey);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": receipt.media.mime,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="receipt.${receipt.media.mime === "application/pdf" ? "pdf" : receipt.media.mime === "image/png" ? "png" : "jpg"}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
