import { getTranslations } from "next-intl/server";
export default async function JournalLoading() {
  const t = await getTranslations("journal");
  return (
    <p className="finance-page" role="status">
      {t("loading")}
    </p>
  );
}
