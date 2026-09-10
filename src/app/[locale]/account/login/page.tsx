import { getTranslations } from "next-intl/server";
import { CustomerLogin } from "@/components/storefront/customer-login";
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations("commerce");
  return (
    <main className="shell py-12">
      <section className="mx-auto max-w-md rounded-token border border-black/10 bg-surface p-6 shadow-sm">
        <h1 className="mb-5 text-2xl font-semibold">{t("login")}</h1>
        <CustomerLogin locale={locale} />
      </section>
    </main>
  );
}
