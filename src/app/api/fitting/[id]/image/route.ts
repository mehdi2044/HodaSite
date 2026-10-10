import { currentCustomer } from "@/modules/customers";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const c = await currentCustomer();
  if (!c) return new Response(null, { status: 404 });
  const s = await db.fittingSession.findFirst({
    where: { id: (await params).id, customerId: c.id, status: "DONE" },
  });
  if (!s?.storageKey) return new Response(null, { status: 404 });
  const b = await storage.getBytes(s.storageKey);
  if (!b) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(b), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
