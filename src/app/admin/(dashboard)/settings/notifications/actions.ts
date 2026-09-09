"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  ALLOWED_TEMPLATE_VARIABLES,
  getEmailProvider,
  notificationTemplateInputSchema,
  renderTemplate,
} from "@/modules/notifications";

async function requireUser(permission: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  await assertCan(session.user.id, permission);
  return session.user.id;
}

function localized(data: FormData, prefix: string) {
  return {
    fa: String(data.get(`${prefix}Fa`) ?? ""),
    tr: String(data.get(`${prefix}Tr`) ?? ""),
    en: String(data.get(`${prefix}En`) ?? ""),
  };
}

export async function saveNotificationTemplate(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await requireUser("settings.notification.write");
    const parsed = notificationTemplateInputSchema.parse({
      id: data.get("id"),
      key: data.get("key"),
      isActive: data.get("isActive") === "on",
      subjectI18n: localized(data, "subject"),
      bodyI18n: localized(data, "body"),
    });
    const before = await db.notificationTemplate.findUniqueOrThrow({
      where: { id: parsed.id },
    });
    if (before.key !== parsed.key || before.channel !== "email")
      throw new z.ZodError([]);
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const after = await tx.notificationTemplate.update({
          where: { id: parsed.id },
          data: {
            isActive: parsed.isActive,
            subjectI18n: parsed.subjectI18n,
            bodyI18n: parsed.bodyI18n,
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: "settings.notification.update",
            entityType: "NotificationTemplate",
            entityId: after.id,
            before,
            after,
          },
        });
      }),
    );
    revalidatePath("/admin/settings/notifications");
  });
}

const testSchema = z.object({
  id: z.string().min(1).max(100),
  locale: z.enum(["fa", "tr", "en"]),
  recipient: z.string().trim().email().max(254),
});

export async function sendNotificationTest(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await requireUser("settings.notification.test");
    const input = testSchema.parse(Object.fromEntries(data));
    const template = await db.notificationTemplate.findUniqueOrThrow({
      where: { id: input.id },
    });
    if (template.channel !== "email" || !template.isActive)
      throw new z.ZodError([]);
    const validated = notificationTemplateInputSchema.parse({
      id: template.id,
      key: template.key,
      isActive: template.isActive,
      subjectI18n: template.subjectI18n,
      bodyI18n: template.bodyI18n,
    });
    const key = validated.key;
    const subject = validated.subjectI18n;
    const body = validated.bodyI18n;
    const allowed = ALLOWED_TEMPLATE_VARIABLES[key];
    await withMutation(async () => {
      await getEmailProvider().send({
        to: input.recipient,
        subject: renderTemplate(subject[input.locale] ?? "", allowed, {}),
        text: renderTemplate(body[input.locale] ?? "", allowed, {}),
        templateKey: key,
      });
      await db.auditLog.create({
        data: {
          userId,
          action: "settings.notification.test",
          entityType: "NotificationTemplate",
          entityId: template.id,
          // Recipient and rendered content are intentionally not audited.
          after: { provider: process.env.EMAIL_PROVIDER ?? "noop" },
        },
      });
    });
  });
}
