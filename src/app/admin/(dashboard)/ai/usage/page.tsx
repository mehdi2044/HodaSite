import { getTranslations } from "next-intl/server";
import { usageReport } from "@/modules/ai/settings";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ marketId?: string }>;
}) {
  const { marketId } = await searchParams,
    t = await getTranslations("aiAdmin"),
    r = await usageReport(marketId);
  return (
    <div className="grid max-w-5xl gap-5">
      <h1 className="text-2xl font-semibold">{t("usage")}</h1>
      <p>{t("usageHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-token bg-surface p-5">
          <p>{t("monthlyCost")}</p>
          <strong className="text-2xl">
            <bdi>{r.totalUsd} USD</bdi>
          </strong>
        </article>
        <article className="rounded-token bg-surface p-5">
          <p>{t("calls")}</p>
          <strong className="text-2xl">{r.count}</strong>
        </article>
      </div>
      {r.rows.map((row) => (
        <article
          key={row.id}
          className="grid gap-2 rounded-token border border-black/10 bg-surface p-4 sm:grid-cols-3"
        >
          <div>
            <strong>{t(row.feature)}</strong>
            <p>
              <bdi>
                {row.provider} · {row.model}
              </bdi>
            </p>
          </div>
          <div>
            <p>{t(`statuses.${row.status}`)}</p>
            <bdi>{row.costUsd} USD</bdi>
          </div>
          <div>
            <p>
              {t("tokens", {
                input: row.inputTokens ?? "—",
                output: row.outputTokens ?? "—",
              })}
            </p>
            <time dateTime={row.createdAt}>
              <bdi>{row.createdAt.slice(0, 16).replace("T", " ")} UTC</bdi>
            </time>
          </div>
        </article>
      ))}
    </div>
  );
}
