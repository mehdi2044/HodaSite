import { reviewPhotoBytes } from "@/modules/engagement/photos";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (id.length > 100) return new Response(null, { status: 404 });
  const bytes = await reviewPhotoBytes(id);
  return new Response(bytes ? new Uint8Array(bytes) : null, {
    status: bytes ? 200 : 404,
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });
}
