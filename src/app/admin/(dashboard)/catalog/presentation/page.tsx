import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { categoryPathLabel } from "@/modules/catalog";
import {
  categoryPresentationSchema,
  KIDS_TONES,
} from "@/modules/catalog/category-presentation";
import { SettingsForm } from "@/components/admin/settings-form";
import { savePresentationAction } from "./actions";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function PresentationAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  if (!(await can(session.user.id, "catalog.product.view"))) notFound();
  const [categories, locale, t, writable] = await Promise.all([
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    getLocale(),
    getTranslations("cutouts"),
    can(session.user.id, "catalog.product.edit"),
  ]);
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("categoryTitle")}</h1>
      <p className="text-muted my-4">{t("categoryHelp")}</p>
      <div className="grid gap-5 md:grid-cols-2">
        {categories.map((category) => {
          const parsed = categoryPresentationSchema.safeParse(
            category.presentation,
          );
          return (
            <section className="card" key={category.id}>
              <h2 className="font-semibold mb-3">
                {categoryPathLabel(
                  categories,
                  category.id,
                  locale as "fa" | "tr" | "en",
                )}
              </h2>
              <SettingsForm
                action={savePresentationAction}
                submitLabel={t("saveCategory")}
                disabled={!writable}
              >
                <input type="hidden" name="id" value={category.id} />
                <input
                  type="hidden"
                  name="expectedUpdatedAt"
                  value={category.updatedAt.toISOString()}
                />
                <label>
                  {t("categoryStyle")}
                  <select
                    className="input"
                    name="presentationKind"
                    defaultValue={parsed.success ? parsed.data.kind : "inherit"}
                  >
                    <option value="inherit">{t("inherit")}</option>
                    <option value="default">{t("ordinary")}</option>
                    <option value="kids">{t("kids")}</option>
                  </select>
                </label>
                <label>
                  {t("tone")}
                  <select
                    className="input"
                    name="tone"
                    defaultValue={
                      parsed.success ? parsed.data.tone : "kidsMint"
                    }
                  >
                    {KIDS_TONES.map((tone) => (
                      <option key={tone} value={tone}>
                        {t(`tones.${tone}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </SettingsForm>
            </section>
          );
        })}
      </div>
    </>
  );
}
