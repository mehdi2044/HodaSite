import Link from "next/link";
import { getTranslations } from "next-intl/server";
export default async function LocalizedNotFound() {
  const t = await getTranslations("catalog");
  return (
    <main className="shell grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-7xl font-semibold">404</p>
        <h1 className="mt-4 text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <Link href="/" className="button mt-7 inline-flex">
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
