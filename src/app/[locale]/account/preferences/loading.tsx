import { getTranslations } from "next-intl/server";
export default async function Loading() {
  return (
    <p className="shell py-10" role="status">
      {(await getTranslations("crm"))("loading")}
    </p>
  );
}
