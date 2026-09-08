import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { duplicatePage, setPageDeleted } from "./actions";
import { ActionSubmit } from "@/components/admin/action-submit";
import { getTranslations } from "next-intl/server";

export default async function PagesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ trash?: string }>;
}) {
  const t = await getTranslations("contentAdmin");
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "content.page.read")))
    redirect("/admin");
  const trash = (await searchParams).trash === "1";
  const pages = await db.page.findMany({
    where: { deletedAt: trash ? { not: null } : null },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("pages")}</h1>
        <div className="flex gap-2">
          <Link
            className="button"
            href={
              trash ? "/admin/content/pages" : "/admin/content/pages?trash=1"
            }
          >
            {trash ? t("activePages") : t("trash")}
          </Link>
          {!trash && (
            <Link className="button" href="/admin/content/pages/new">
              {t("newPage")}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {pages.length === 0 && (
          <Card>
            <p className="muted">{t("emptyPages")}</p>
          </Card>
        )}
        {pages.map((page) => {
          const title = page.titleI18n as Record<string, string>;
          return (
            <Card
              key={page.id}
              className="flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <strong>{title.fa || title.en}</strong>
                <p className="muted">
                  {page.status === "published" ? t("published") : t("draft")} ·{" "}
                  {page.type === "landing" ? t("landing") : t("static")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!trash && (
                  <Link
                    href={`/admin/content/pages/${page.id}`}
                    className="button"
                  >
                    {t("edit")}
                  </Link>
                )}
                {!trash && (
                  <ActionSubmit
                    action={duplicatePage}
                    fields={{ id: page.id }}
                    label={t("duplicate")}
                  />
                )}
                <ActionSubmit
                  action={setPageDeleted}
                  fields={{ id: page.id, restore: trash ? "true" : "false" }}
                  label={trash ? t("restore") : t("delete")}
                  variant={trash ? "secondary" : "destructive"}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
