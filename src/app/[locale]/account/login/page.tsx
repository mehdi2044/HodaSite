import { getTranslations } from "next-intl/server";
import { CustomerLogin } from "@/components/storefront/customer-login";
import { db } from "@/lib/db";
import { getThemeSettings } from "@/modules/settings";
import { ResponsiveImage } from "@/components/storefront/responsive-image";
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    a = await getTranslations("accountDesign");
  const theme = await getThemeSettings();
  const media = theme?.accountMediaId
    ? await db.media.findFirst({
        where: {
          id: theme.accountMediaId,
          status: "READY",
          deletedAt: null,
          kind: "image",
        },
      })
    : null;
  return (
    <main data-moda4="auth" className="shell shop-page py-12 moda-login">
      <div className="moda-login-art" aria-hidden="true">
        {media ? (
          <ResponsiveImage
            media={media}
            locale={locale as "fa" | "tr" | "en"}
            role="hero"
            sizes="(max-width:767px) 100vw,50vw"
            priority
          />
        ) : (
          <span className="moda-login-decoration" />
        )}
        <div className="moda-login-caption">
          <h2 data-moda4-display="" lang="en" dir="ltr">
            {a.rich("joinClub", { accent: (chunks) => <em>{chunks}</em> })}
          </h2>
          <p>{a("clubHelp")}</p>
        </div>
      </div>
      <section className="moda-login-form rounded-token border border-black/10 bg-surface p-6 shadow-sm">
        <CustomerLogin locale={locale} />
      </section>
    </main>
  );
}
