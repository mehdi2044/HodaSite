import { getTranslations } from "next-intl/server";
export default async function LaunchLoading() {
  const t = await getTranslations("launch");
  return <p role="status">{t("loading")}</p>;
}
