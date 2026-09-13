import { getTranslations } from "next-intl/server";
export default async function ReconciliationLoading() {
  const t = await getTranslations("reconciliation");
  return (
    <p className="finance-page" role="status">
      {t("loading")}
    </p>
  );
}
