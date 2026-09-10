import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import { PERMISSIONS } from "@/modules/access";
import { db } from "@/lib/db";
import { saveRole, saveOverride } from "./actions";
export default async function RolesPage() {
  await requireAdminPage("security.role.manage");
  const t = await getTranslations("security");
  const [roles, users, markets] = await Promise.all([
    db.role.findMany({
      include: { permissions: true },
      orderBy: { key: "asc" },
    }),
    db.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.market.findMany(),
  ]);
  return (
    <div className="grid gap-5">
      <h1>{t("roles")}</h1>
      <p>{t("roleHint")}</p>
      {[
        ...roles,
        { id: "", key: "", nameI18n: { fa: "" }, permissions: [] },
      ].map((role) => (
        <details className="card" key={role.id || "new"}>
          <summary>{role.key || t("newRole")}</summary>
          {role.key === "owner" ? (
            <p>{t("ownerProtected")}</p>
          ) : (
            <form action={saveRole} className="mt-4 grid gap-4">
              <input type="hidden" name="id" value={role.id} />
              <label>
                {t("roleKey")}
                <input
                  className="input"
                  name="key"
                  required
                  defaultValue={role.key}
                  readOnly={Boolean(role.id)}
                />
              </label>
              <label>
                {t("roleName")}
                <input
                  className="input"
                  name="name"
                  required
                  defaultValue={(role.nameI18n as { fa: string }).fa}
                />
              </label>
              <fieldset className="grid gap-2 sm:grid-cols-2" dir="ltr">
                <legend>{t("permissions")}</legend>
                {PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-start gap-2 break-all">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={p}
                      defaultChecked={role.permissions.some(
                        (g) => g.permission === p,
                      )}
                    />
                    {p}
                  </label>
                ))}
              </fieldset>
              <button className="button">{t("save")}</button>
            </form>
          )}
        </details>
      ))}
      <section className="card">
        <h2>{t("override")}</h2>
        <form className="mt-4 grid gap-3" action={saveOverride}>
          <label>
            {t("user")}
            <select name="userId" className="input w-full">
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("permissions")}
            <select className="input w-full" dir="ltr" name="permission">
              {PERMISSIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            {t("market")}
            <select className="input w-full" name="marketId">
              <option value="">{t("allMarkets")}</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("decision")}
            <select name="mode" className="input">
              <option value="deny">{t("deny")}</option>
              <option value="allow">{t("allow")}</option>
              <option value="remove">{t("remove")}</option>
            </select>
          </label>
          <button className="button">{t("save")}</button>
        </form>
      </section>
    </div>
  );
}
