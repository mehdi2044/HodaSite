import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { invoiceOrder } from "@/modules/orders/invoices/access";
export const dynamic = "force-dynamic";
const paramsSchema = z.object({
  number: z.string().min(1).max(100),
  id: z.string().min(1).max(100),
});
export async function GET(
  _req: Request,
  context: { params: Promise<{ number: string; id: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  const missing = () =>
    new NextResponse(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  if (!params.success) return missing();
  const order = await invoiceOrder(params.data.number);
  if (!order) return missing();
  const invoice = await db.invoice.findFirst({
    where: { id: params.data.id, orderId: order.id, status: "READY" },
    include: { media: true },
  });
  if (
    !invoice?.media ||
    invoice.media.kind !== "invoice" ||
    invoice.media.deletedAt
  )
    return missing();
  const bytes = await storage.getBytes(invoice.media.storageKey);
  if (!bytes) return missing();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename="invoice-v${invoice.version}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "referrer-policy": "no-referrer",
    },
  });
}
