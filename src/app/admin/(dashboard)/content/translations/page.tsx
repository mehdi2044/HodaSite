import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import {
  getUiTranslationRows,
  UI_LOCALES,
} from "@/modules/content/translations";
import { TranslationEditor } from "@/components/admin/translation-editor";
import {
  importUiTranslations,
  resetUiTranslation,
  saveUiTranslation,
} from "./actions";

export default async function TranslationsAdmin() {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "content.translation.read"))
  )
    redirect("/admin");
  const t = await getTranslations("translationAdmin");
  const [overrides, pages, menus, homepages] = await Promise.all([
    db.translation.findMany({
      where: { entityType: "ui", entityId: "global" },
    }),
    db.page.findMany({
      where: { deletedAt: null },
      select: { id: true, titleI18n: true, seoI18n: true, blocks: true },
    }),
    db.menuItem.findMany({
      where: { deletedAt: null },
      select: { id: true, labelI18n: true },
    }),
    db.homepage.findMany({
      where: { deletedAt: null },
      select: { id: true, blocks: true },
    }),
  ]);
  const overrideMap = Object.fromEntries(
    overrides.map((item) => [`${item.locale}:${item.field}`, item.value]),
  );
  const exportBundle = Object.fromEntries(
    UI_LOCALES.map((locale) => [
      locale,
      Object.fromEntries(
        overrides
          .filter((item) => item.locale === locale)
          .map((item) => [item.field, item.value]),
      ),
    ]),
  );
  const missing = [
    ...pages.flatMap((item) => [
      ...missingLocalized("Page", item.id, item.titleI18n, "title"),
      ...missingLocalized("Page", item.id, item.seoI18n, "seo"),
      ...missingLocalized("Page", item.id, item.blocks, "blocks"),
    ]),
    ...menus.flatMap((item) =>
      missingLocalized("Menu", item.id, item.labelI18n, "label"),
    ),
    ...homepages.flatMap((item) => missingHomepage(item.id, item.blocks)),
  ];
  return (
    <TranslationEditor
      rows={getUiTranslationRows()}
      overrides={overrideMap}
      exportBundle={exportBundle}
      missing={missing}
      saveAction={saveUiTranslation}
      resetAction={resetUiTranslation}
      importAction={importUiTranslations}
      labels={{
        title: t("title"),
        description: t("description"),
        search: t("search"),
        save: t("save"),
        reset: t("reset"),
        export: t("export"),
        import: t("import"),
        importHelp: t("importHelp"),
        missing: t("missing"),
        noMissing: t("noMissing"),
        defaultValue: t("defaultValue"),
        overrideValue: t("overrideValue"),
      }}
    />
  );
}

function missingLocalized(
  entityType: string,
  entityId: string,
  value: unknown,
  path: string,
): { entityType: string; entityId: string; locale: string; field: string }[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      missingLocalized(entityType, entityId, item, `${path}.${index}`),
    );
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (UI_LOCALES.some((locale) => locale in record))
    return UI_LOCALES.filter(
      (locale) =>
        typeof record[locale] !== "string" ||
        !(record[locale] as string).trim(),
    ).map((locale) => ({ entityType, entityId, locale, field: path }));
  return Object.entries(record).flatMap(([key, child]) =>
    missingLocalized(entityType, entityId, child, `${path}.${key}`),
  );
}
function missingHomepage(id: string, value: unknown) {
  return missingLocalized("Homepage", id, value, "blocks");
}
