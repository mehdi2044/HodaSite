import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { seal, unseal } from "@/lib/secure-tokens";
import { registerJobHandler } from "@/modules/jobs";
import {
  ALLOWED_TEMPLATE_VARIABLES,
  getEmailProvider,
  renderTemplate,
  type NotificationTemplateKey,
  type NotificationLocale,
} from "./index";

export async function queueEmail(
  tx: Prisma.TransactionClient,
  key: NotificationTemplateKey,
  to: string,
  locale: NotificationLocale,
  data: Record<string, string>,
  fromName?: string,
) {
  if (!fromName && data.orderNumber) {
    const order = await tx.order.findUnique({
      where: { number: data.orderNumber },
      select: { market: { select: { name: true } } },
    });
    fromName = order?.market.name;
  }
  const template = await tx.notificationTemplate.findUnique({
    where: { key_channel: { key, channel: "email" } },
  });
  if (!template?.isActive) return;
  const subject = template.subjectI18n as Record<string, string>,
    body = template.bodyI18n as Record<string, string>;
  await tx.job.create({
    data: {
      type: "send-email",
      payload: {
        encrypted: seal({
          to,
          subject: renderTemplate(
            subject[locale] ?? subject.en,
            ALLOWED_TEMPLATE_VARIABLES[key],
            data,
          ),
          text: renderTemplate(
            body[locale] ?? body.en,
            ALLOWED_TEMPLATE_VARIABLES[key],
            data,
          ),
          templateKey: key,
          fromName,
        }),
      },
    },
  });
}
export function registerNotificationJobs() {
  registerJobHandler("send-email", async (job) => {
    if ((job.payload as { delivered?: boolean })?.delivered) return;
    const payload = z.object({ encrypted: z.string() }).parse(job.payload);
    const mail = z
      .object({
        to: z.email(),
        subject: z.string(),
        text: z.string(),
        templateKey: z.string(),
        fromName: z.string().optional(),
      })
      .parse(unseal(payload.encrypted));
    try {
      await getEmailProvider().send({
        ...mail,
        templateKey: mail.templateKey as NotificationTemplateKey,
        idempotencyKey: job.id,
      });
    } catch {
      throw new Error("EMAIL_DELIVERY_FAILED");
    }
    // Remove encrypted OTP/message data after successful delivery.
    await db.job.update({
      where: { id: job.id },
      data: { payload: { delivered: true } },
    });
  });
}
export interface SmsProvider {
  send(to: string, text: string): Promise<void>;
}
export class NoopSmsProvider implements SmsProvider {
  async send() {}
}
