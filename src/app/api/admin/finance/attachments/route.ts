import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { financeActor } from "@/modules/finance/operations";
import { storage } from "@/modules/integrations/storage";
export async function POST(request: Request) {
  const user = (await auth())?.user?.id;
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const q = new URL(request.url).searchParams,
    marketId = q.get("marketId") ?? "";
  if (!marketId || !(await can(user, "finance.expense.create", { marketId })))
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  return withMutation(async () => {
    const file = (await request.formData()).get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    )
      return Response.json({ error: "VALIDATION" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer()),
      type = await fileTypeFromBuffer(bytes);
    if (type?.mime !== "application/pdf")
      return Response.json({ error: "VALIDATION" }, { status: 400 });
    const now = new Date(),
      id = randomUUID(),
      key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.pdf`;
    await storage.put(key, bytes, type.mime);
    try {
      await db.$transaction(async (tx) => {
        const actor = await financeActor(
          tx,
          "finance.expense.create",
          marketId,
        );
        await tx.media.create({
          data: {
            id,
            kind: "expense",
            storageKey: key,
            url: `/api/admin/finance/attachments/${id}`,
            originalName: file.name.slice(0, 255),
            bytes: file.size,
            mime: type.mime,
            uploadedBy: actor,
            tags: [`expense-market:${marketId}`],
            status: "READY",
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor,
            action: "finance.expense.document",
            entityType: "Media",
            entityId: id,
            after: { marketId },
          },
        });
      });
    } catch (error) {
      await storage.delete(key).catch(() => {});
      throw error;
    }
    return Response.json(
      { id },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
