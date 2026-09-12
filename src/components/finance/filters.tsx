"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
export function FinanceFilters({
  from,
  to,
  marketId,
  markets,
}: {
  from: string;
  to: string;
  marketId?: string;
  markets: Array<{ id: string; code: string }>;
}) {
  const t = useTranslations("finance"),
    router = useRouter(),
    [pending, start] = useTransition();
  return (
    <form
      action="/admin/finance"
      className="finance-filters"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const query = new URLSearchParams();
        for (const key of ["from", "to", "marketId"])
          query.set(key, String(data.get(key) || ""));
        start(() => router.push(`/admin/finance?${query}`));
      }}
    >
      <fieldset disabled={pending}>
        <label>
          {t("from")}
          <input
            type="date"
            dir="ltr"
            name="from"
            className="input"
            defaultValue={from}
            required
          />
        </label>
        <label>
          {t("to")}
          <input
            type="date"
            dir="ltr"
            name="to"
            className="input"
            defaultValue={to}
            required
          />
        </label>
        <label>
          {t("market")}
          <select
            className="input"
            name="marketId"
            defaultValue={marketId || ""}
          >
            <option value="">{t("allMarkets")}</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          {pending ? t("loading") : t("apply")}
        </button>
      </fieldset>
      {pending && <p role="status">{t("loading")}</p>}
    </form>
  );
}
