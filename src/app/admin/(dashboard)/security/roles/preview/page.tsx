import { getTranslations, getLocale } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import { db } from "@/lib/db";
import { previewRole } from "@/modules/access/preview";
export default async function RolePreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireAdminPage("security.role.manage");
  const t = await getTranslations("security");
  const locale = await getLocale();
  const search = await searchParams;
  const [roles, markets, categories] = await Promise.all([
    db.role.findMany({ orderBy: { key: "asc" } }),
    db.market.findMany(),
    db.category.findMany({ select: { id: true, titleI18n: true } }),
  ]);
  const value = (key: string) =>
    typeof search[key] === "string" ? (search[key] as string) : "";
  const scope = (prefix: string) =>
    Object.fromEntries(
      ["marketId", "categoryId", "section"].flatMap((key) =>
        value(`${prefix}.${key}`) ? [[key, value(`${prefix}.${key}`)]] : [],
      ),
    );
  const selected = value("roleId") || roles[0]?.id;
  const rows = selected
    ? await previewRole(userId, {
        roleId: selected,
        grant: scope("grant"),
        target: scope("target"),
      })
    : [];
  return (
    <div className="grid gap-5">
      <h1>{t("previewTitle")}</h1>
      <p>{t("previewHint")}</p>
      <form className="card grid gap-4">
        <label>
          {t("roles")}
          <select className="input" name="roleId" defaultValue={selected}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.key}
              </option>
            ))}
          </select>
        </label>
        {["grant", "target"].map((prefix) => (
          <fieldset className="grid gap-3" key={prefix}>
            <legend>
              {t(prefix === "grant" ? "grantScope" : "targetScope")}
            </legend>
            <label>
              {t("market")}
              <select
                className="input"
                name={`${prefix}.marketId`}
                defaultValue={value(`${prefix}.marketId`)}
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
              {t("categoryScope")}
              <select
                className="input"
                name={`${prefix}.categoryId`}
                defaultValue={value(`${prefix}.categoryId`)}
              >
                <option value="">{t("allCategories")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.titleI18n as Record<string, string>)[locale] ||
                      (c.titleI18n as Record<string, string>).en}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("sectionScope")}
              <input
                className="input"
                name={`${prefix}.section`}
                defaultValue={value(`${prefix}.section`)}
                maxLength={100}
              />
            </label>
          </fieldset>
        ))}
        <button className="button min-h-11">{t("previewTitle")}</button>
      </form>
      <ul className="card grid gap-2">
        {rows.map((row) => (
          <li
            key={row.permission}
            className="flex flex-wrap justify-between gap-2 border-b py-2"
          >
            <bdi className="break-all">{row.permission}</bdi>
            <span className={row.allowed ? "text-success" : "text-error"}>
              {t(row.allowed ? "allow" : "deny")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
