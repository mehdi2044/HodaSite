import { getTranslations } from "next-intl/server";
import { PublicTracking } from "@/components/shipping/public-tracking";
export const dynamic = "force-dynamic";
export default async function TrackingPage() {
  const t = await getTranslations("shipping");
  return (
    <main className="shell grid gap-6 py-10">
      <h1 className="text-3xl font-semibold">{t("tracking")}</h1>
      <PublicTracking />
    </main>
  );
}
