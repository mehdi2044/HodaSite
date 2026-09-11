import { randomUUID } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db";
import { withMutation, MaintenanceError } from "@/lib/mutation-gate";
import { storage, type StorageProvider } from "@/modules/integrations/storage";
import {
  registerJobHandler,
  JobDeferredError,
  type JobContext,
} from "@/modules/jobs";
import { invoiceSnapshotSchema } from "./document";
import { renderInvoicePdf } from "./renderer";
import { INVOICE_JOB } from "./queue";
const payloadSchema = z.object({ invoiceId: z.string().min(1).max(100) });
export async function invoiceWorker(
  job: JobContext,
  target: StorageProvider = storage,
  render = renderInvoicePdf,
) {
  const { invoiceId } = payloadSchema.parse(job.payload);
  return withMutation(async () => {
    const token = randomUUID();
    const invoice = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${invoiceId} FOR UPDATE`;
      const current = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      if (current.status === "READY") return null;
      if (current.generationUntil && current.generationUntil > new Date())
        throw new JobDeferredError("Invoice generation active");
      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "PENDING",
          generationToken: token,
          generationUntil: new Date(Date.now() + 120000),
        },
      });
    });
    if (!invoice) return;
    const key = `invoices/${invoiceId}/${token}.pdf`;
    let published = false,
      publishResolved = false;
    try {
      const snapshot = invoiceSnapshotSchema.parse(invoice.snapshot);
      let logo = "";
      if (snapshot.logoMediaId) {
        const media = await db.media.findFirst({
          where: {
            id: snapshot.logoMediaId,
            kind: "image",
            deletedAt: null,
            status: "READY",
            bytes: { lte: 5_000_000 },
          },
        });
        if (media) {
          const input = await target.getBytes(media.storageKey);
          if (input && input.length <= 5_000_000) {
            const image = await sharp(input, { limitInputPixels: 16_000_000 })
              .resize({
                width: 400,
                height: 200,
                fit: "inside",
                withoutEnlargement: true,
              })
              .png()
              .toBuffer();
            logo = `data:image/png;base64,${image.toString("base64")}`;
          }
        }
      }
      const bytes = await render(snapshot, invoice.version, logo);
      if (
        bytes.length > 10_000_000 ||
        bytes.subarray(0, 5).toString() !== "%PDF-"
      )
        throw new Error("Invalid invoice PDF");
      await target.put(key, bytes, "application/pdf");

      published = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${invoiceId} FOR UPDATE`;
        const fresh = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
        });
        if (fresh.status === "READY" || fresh.generationToken !== token)
          return false;
        const media = await tx.media.create({
          data: {
            kind: "invoice",
            storageKey: key,
            url: "",
            originalName: `invoice-v${invoice.version}.pdf`,
            mime: "application/pdf",
            bytes: bytes.length,
            status: "READY",
          },
        });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: "READY",
            mediaId: media.id,
            generationToken: null,
            generationUntil: null,
          },
        });
        await tx.auditLog.create({
          data: {
            action: "invoice.ready",
            entityType: "Invoice",
            entityId: invoiceId,
            after: { mediaId: media.id, version: invoice.version },
          },
        });
        return true;
      });
      publishResolved = true;
    } catch {
      await db.invoice
        .updateMany({
          where: {
            id: invoiceId,
            generationToken: token,
            status: { not: "READY" },
          },
          data: {
            status: "FAILED",
            generationToken: null,
            generationUntil: null,
          },
        })
        .catch(() => {
          /* The lease expires if the database is temporarily unavailable. */
        });
      // Never copy customer data, browser output or storage credentials into Job.lastError.
      throw new Error("Invoice generation failed");
    } finally {
      // Ambiguous commit failures retain bytes: never risk deleting a published PDF.
      if (publishResolved && !published)
        await target.delete(key).catch(() => {
          throw new Error("Invoice cleanup failed");
        });
    }
  }).catch((error) => {
    if (error instanceof MaintenanceError)
      throw new JobDeferredError("maintenance is on");
    throw error;
  });
}
export function registerInvoiceJobs() {
  registerJobHandler(INVOICE_JOB, (job) => invoiceWorker(job));
}
