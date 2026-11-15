import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/modules/access";
import { requireAdminPage } from "@/modules/auth/page";
import { WeeklyEditor } from "@/components/admin/weekly-editor";
import { scheduleWeekly } from "./actions";

export default async function WeeklyAdmin() {
  const user = await requireAdminPage("content.page.read");
  const [t, locale, entries, assignments, editable] = await Promise.all([
    getTranslations("editorial"),
    getLocale(),
    db.editorialEntry.findMany({
      where: {
        kind: "LOOK",
        deletedAt: null,
        revisions: { some: { approvedBy: { not: null } } },
      },
      select: { id: true, slugEn: true },
    }),
    db.weeklyLookFeature.findMany({
      orderBy: { startsAt: "desc" },
      include: { entry: { select: { slugEn: true } } },
    }),
    can(user, "content.page.publish"),
  ]);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Istanbul",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t("weekly")}</h1>
      {editable && <WeeklyEditor action={scheduleWeekly} looks={entries} />}
      {assignments.length ? (
        <ul>
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              {assignment.entry.slugEn} · {t(`facet.${assignment.slot}`)} ·{" "}
              {time.formatRange(assignment.startsAt, assignment.endsAt)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("weeklyEmpty")}</p>
      )}
    </section>
  );
}
