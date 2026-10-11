import { unseal } from "@/lib/secure-tokens";
import { currentCustomer } from "@/modules/customers";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const c = await currentCustomer();
  if (!c?.isActive || c.isGuest) return new Response(null, { status: 404 });
  const s = await db.fittingSession.findFirst({
    where: { id: (await params).id, customerId: c.id, status: "DONE" },
  });
  if (!s?.storageKey) return new Response(null, { status: 404 });
  const b = await storage.getBytes(s.storageKey);
  if (!b) return new Response(null, { status: 404 });
  let image: Buffer;
  try {
    const payload = unseal(b.toString("utf8")) as {
      kind?: string;
      sessionId?: string;
      webp?: string;
    };
    if (
      payload.kind !== "fitting-image" ||
      payload.sessionId !== s.id ||
      typeof payload.webp !== "string"
    )
      return new Response(null, { status: 404 });
    image = Buffer.from(payload.webp, "base64");
  } catch {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(image), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
