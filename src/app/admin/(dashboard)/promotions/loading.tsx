import { getTranslations } from "next-intl/server";
export default async function Loading() {
  return (
    <p className="card" role="status">
      {(await getTranslations("crm"))("loading")}
    </p>
  );
}
