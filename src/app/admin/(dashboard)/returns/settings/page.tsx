import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { db } from "@/lib/db";
import { returnMarkets } from "@/modules/returns/service";
import { returnPolicySchema } from "@/modules/returns/validation";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { saveReturnPolicy } from "../actions";
export default async function ReturnSettings() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const ids = await returnMarkets(session.user.id, "markets.edit");
  if (!ids.length) notFound();
  const markets = await db.market.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, returnSettings: true },
    orderBy: { code: "asc" },
  });
  const categories = await db.category.findMany({
      where: { deletedAt: null },
      select: { id: true, titleI18n: true },
    }),
    t = await getTranslations("returns");
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t("settings")}</h1>
      {markets.map((m) => {
        const p = returnPolicySchema.parse(m.returnSettings);
        return (
          <section key={m.id} className="rounded-token border p-5">
            <h2 className="mb-4 text-xl">{m.code}</h2>
            <CommerceForm action={saveReturnPolicy}>
              <input type="hidden" name="marketId" value={m.id} />
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={p.enabled}
                />{" "}
                {t("enabled")}
              </label>
              <label>
                {t("days")}
                <input
                  className="input w-full"
                  type="number"
                  name="days"
                  min={1}
                  max={365}
                  defaultValue={p.days}
                  required
                />
              </label>
              <fieldset className="grid gap-2">
                <legend>{t("excluded")}</legend>
                {categories.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      name="excludedCategoryId"
                      value={c.id}
                      defaultChecked={p.excludedCategoryIds.includes(c.id)}
                    />{" "}
                    {(c.titleI18n as Record<string, string>).fa}
                  </label>
                ))}
              </fieldset>
              <button className="button justify-self-start">{t("save")}</button>
            </CommerceForm>
          </section>
        );
      })}
    </main>
  );
}
