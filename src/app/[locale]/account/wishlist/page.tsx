import { getTranslations } from "next-intl/server";
import { SavedProducts } from "@/components/engagement/wishlist";
export const metadata = { robots: { index: false, follow: false } };
export default async function WishlistPage() {
  const t = await getTranslations("engagement");
  return (
    <main className="shell py-10">
      <h1 className="sr-only">{t("wishlist")}</h1>
      <SavedProducts />
    </main>
  );
}
