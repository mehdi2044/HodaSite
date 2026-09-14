import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Referrer-Policy": "no-referrer",
  };
  const user = (await auth())?.user?.id;
  if (!user) return new Response(null, { status: 404, headers });
  const row = await db.media.findFirst({
    where: {
      id: (await params).id,
      kind: "expense",
      deletedAt: null,
      status: "READY",
    },
  });
  const marketId = row?.tags
    .find((t) => t.startsWith("expense-market:"))
    ?.slice(15);
  if (!row || !marketId) return new Response(null, { status: 404, headers });
  const linked = await db.expense.findMany({
    where: { attachmentId: row.id },
    select: { isGlobal: true },
  });
  const scope = linked.some((e) => e.isGlobal) ? {} : { marketId };
  const allowed =
    (linked.length > 0 && (await can(user, "finance.report.view", scope))) ||
    (row.uploadedBy === user &&
      (await can(user, "finance.expense.create", scope)));
  if (!allowed) return new Response(null, { status: 404, headers });
  const bytes = await storage.getBytes(row.storageKey);
  if (!bytes) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="expense.pdf"',
    },
  });
}
