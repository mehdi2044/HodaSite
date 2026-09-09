import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import {
  ALLOWED_TEMPLATE_VARIABLES,
  notificationTemplateInputSchema,
} from "@/modules/notifications";
import { NotificationTemplateEditor } from "@/components/admin/notification-template-editor";
import { saveNotificationTemplate, sendNotificationTest } from "./actions";

export default async function NotificationsAdmin() {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "settings.notification.read"))
  )
    redirect("/admin");
  const [t, templates] = await Promise.all([
    getTranslations("notificationAdmin"),
    db.notificationTemplate.findMany({
      where: { channel: "email" },
      orderBy: { key: "asc" },
    }),
  ]);
  const labels = {
    active: t("active"),
    subject: t("subject"),
    body: t("body"),
    variables: t("variables"),
    save: t("save"),
    testTitle: t("testTitle"),
    recipient: t("recipient"),
    locale: t("locale"),
    sendTest: t("sendTest"),
    success: t("success"),
  };
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("description")}</p>
      </header>
      {templates.map((template) => {
        const key = notificationTemplateInputSchema.shape.key.parse(
          template.key,
        );
        return (
          <NotificationTemplateEditor
            key={template.id}
            template={{
              id: template.id,
              key: template.key,
              isActive: template.isActive,
              subjectI18n: template.subjectI18n as Record<string, string>,
              bodyI18n: template.bodyI18n as Record<string, string>,
            }}
            variables={ALLOWED_TEMPLATE_VARIABLES[key]}
            labels={labels}
            saveAction={saveNotificationTemplate}
            testAction={sendNotificationTest}
          />
        );
      })}
    </div>
  );
}
