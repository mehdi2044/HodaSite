import { getTranslations } from "next-intl/server";
export default async function Loading() {
  const t = await getTranslations("shopping");
  return (
    <main className="shell shop-loading" aria-busy="true">
      <p role="status">{t("loading")}</p>
      <div className="shop-skeleton" aria-hidden="true" />
      <div className="shop-skeleton-grid" aria-hidden="true">
        <div />
        <div />
      </div>
    </main>
  );
}
