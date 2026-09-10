import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { db } from "@/lib/db";
import { revokeSession, revokeOtherSessions } from "./actions";
export default async function SecurityPage() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  const t = await getTranslations("security");
  const [user, rows] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    db.adminSession.findMany({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return (
    <div className="grid gap-5">
      <h1>{t("title")}</h1>
      <section className="card">
        <h2>{t("mfa")}</h2>
        <p>{t(user.mfaEnabled ? "enabled" : "required")}</p>
        {!user.mfaEnabled && (
          <Link className="button" href="/admin/security/setup">
            {t("setup")}
          </Link>
        )}
      </section>
      <section className="card grid gap-4">
        <h2>{t("sessions")}</h2>
        <form action={revokeOtherSessions}>
          <button className="button">{t("revokeOthers")}</button>
        </form>
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 py-3"
          >
            <div>
              <p>
                {row.id === session.adminSessionId
                  ? t("current")
                  : t("otherSession")}
              </p>
              <p className="break-all text-sm text-muted" dir="ltr">
                {row.userAgent}
              </p>
              <time>{row.createdAt.toLocaleString("fa")}</time>
            </div>
            <form action={revokeSession}>
              <input type="hidden" name="id" value={row.id} />
              <button className="button">{t("revoke")}</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
