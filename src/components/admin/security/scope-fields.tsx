import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { Scope } from "@/modules/access";
export async function ScopeFields({ value = {} }: { value?: Scope }) {
  const t = await getTranslations("security");
  const [markets, categories] = await Promise.all([
    db.market.findMany({ orderBy: { code: "asc" } }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return (
    <fieldset className="grid gap-3 rounded-token border border-black/10 p-4">
      <legend>{t("scope")}</legend>
      <label>
        {t("market")}
        <select
          className="input w-full"
          aria-label={t("market")}
          name="marketId"
          defaultValue={value.marketId ?? ""}
        >
          <option value="">{t("allMarkets")}</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("category")}
        <select
          className="input w-full"
          aria-label={t("category")}
          name="categoryId"
          defaultValue={value.categoryId ?? ""}
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.titleI18n as { fa?: string; en?: string }).fa ??
                (c.titleI18n as { en?: string }).en ??
                c.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("section")}
        <input
          className="input w-full"
          name="section"
          defaultValue={value.section ?? ""}
          maxLength={100}
        />
      </label>
    </fieldset>
  );
}
