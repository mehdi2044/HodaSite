import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/lib/db";
import { opaqueToken, signValue, equalSecret } from "@/lib/secure-tokens";
import { storage } from "@/modules/integrations/storage";
import { authorizedOrder, lockOrder, CommerceError } from "@/modules/orders";
import { verifyOrderInventory } from "@/modules/inventory";
import { queueEmail } from "@/modules/notifications";

export interface PaymentProvider {
  createPayment(order: {
    number: string;
    currency: string;
    totalAmount: { toString(): string };
  }): { method: string; amount: string; currency: string };
  verify(): Promise<boolean>;
}
export class OfflineBankTransferProvider implements PaymentProvider {
  createPayment(order: {
    number: string;
    currency: string;
    totalAmount: { toString(): string };
  }) {
    return {
      method: "OFFLINE_BANK_TRANSFER",
      amount: order.totalAmount.toString(),
      currency: order.currency,
    };
  }
  async verify() {
    return false;
  } // Approval always requires the authorized admin action.
}
export function getPaymentProvider(name: string): PaymentProvider {
  if (name === "offline") return new OfflineBankTransferProvider();
  throw new CommerceError("PAYMENT_UNAVAILABLE");
}
export async function submitReceipt(
  number: string,
  file: File,
  note: string,
  reference: string,
) {
  const visible = await authorizedOrder(number);
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw new CommerceError("RECEIPT_INVALID");
  const bytes = Buffer.from(await file.arrayBuffer()),
    kind = await fileTypeFromBuffer(bytes);
  if (
    !kind ||
    !["image/jpeg", "image/png", "application/pdf"].includes(kind.mime)
  )
    throw new CommerceError("RECEIPT_INVALID");
  const key = `receipts/${new Date().getUTCFullYear()}/${opaqueToken()}.${kind.ext}`;
  await storage.put(key, bytes, kind.mime);
  try {
    return await db.$transaction(
      async (tx) => {
        const order = await lockOrder(tx, visible.id),
          now = new Date();
        if (
          order.status !== "PENDING_PAYMENT" ||
          order.paymentDeadlineAt <= now
        )
          throw new CommerceError("INVALID_TRANSITION");
        await verifyOrderInventory(tx, order.id, order.items, now);
        let payment = order.payments.find((p) => p.status === "PENDING");
        if (!payment)
          payment = await tx.payment.create({
            data: {
              orderId: order.id,
              amount: order.totalAmount,
              currency: order.currency,
            },
          });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "SUBMITTED",
            submittedAt: now,
            reference: reference.slice(0, 200),
          },
        });
        const media = await tx.media.create({
          data: {
            kind: "receipt",
            storageKey: key,
            url: "",
            bytes: bytes.length,
            mime: kind.mime,
            originalName: file.name.slice(0, 200),
            status: "READY",
          },
        });
        const receipt = await tx.receipt.create({
          data: {
            paymentId: payment.id,
            mediaId: media.id,
            note: note.slice(0, 2000),
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: "AWAITING_VERIFICATION" },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: "receipt_submitted",
            fromStatus: order.status,
            toStatus: "AWAITING_VERIFICATION",
          },
        });
        const contact = order.contactSnapshot as {
          email: string;
          firstName: string;
        };
        await queueEmail(
          tx,
          "order.receipt_received",
          contact.email,
          order.locale as "fa" | "tr" | "en",
          { customerName: contact.firstName, orderNumber: order.number },
        );
        return receipt.id;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
}
export function signedReceiptUrl(receiptId: string, now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + 600),
    signature = signValue(`receipt:${receiptId}:${expires}`);
  return `/api/receipts/${receiptId}?expires=${expires}&signature=${signature}`;
}
export function validReceiptSignature(
  id: string,
  expires: string | null,
  signature: string | null,
  now = Date.now(),
) {
  if (!expires || !signature || !/^\d{10}$/.test(expires)) return false;
  const expiry = Number(expires);
  if (expiry <= Math.floor(now / 1000) || expiry > Math.floor(now / 1000) + 600)
    return false;
  return equalSecret(signValue(`receipt:${id}:${expires}`), signature);
}
export const bankAccountSchema = z
  .object({
    marketId: z.string().min(1),
    id: z.string().optional(),
    label: z.string().trim().min(1).max(100),
    bankName: z.string().trim().min(1).max(100),
    holder: z.string().trim().min(1).max(100),
    accountNumber: z.string().max(100).default(""),
    iban: z.string().max(100).default(""),
    cardNumber: z.string().max(50).default(""),
    isActive: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
    instructionsI18n: z.object({
      fa: z.string().max(5000),
      tr: z.string().max(5000),
      en: z.string().max(5000),
    }),
  })
  .refine((b) => Boolean(b.iban || b.accountNumber || b.cardNumber));
