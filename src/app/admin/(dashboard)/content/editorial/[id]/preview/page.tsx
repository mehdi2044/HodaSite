import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/modules/auth/page";
import { getMarkets } from "@/modules/settings";
import {
  editorialContent,
  editorialId,
  locales,
  type EditorialLocale,
} from "@/modules/editorial/contracts";
import { CuratedDetail } from "@/components/storefront/curated-detail";
import { MagazineArticle } from "@/components/storefront/magazine-article";
import { LivingRail } from "@/components/storefront/living-rail";
import { resolveLookCommerce } from "@/modules/editorial/commerce";
import { resolveLookVisuals } from "@/modules/editorial/visual";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    revision?: string;
    market?: string;
    locale?: string;
    view?: string;
  }>;
}) {
  await requireAdminPage("content.page.read");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const selected = editorialId.safeParse(query.revision);
  if (!selected.success) notFound();
  const [revision, markets] = await Promise.all([
    db.editorialRevision.findFirst({
      where: { id: selected.data, entryId: id },
      include: { entry: true },
    }),
    getMarkets(),
  ]);
  const market = markets.find((m) => m.isActive && m.code === query.market);
  const locale: EditorialLocale =
    locales.find((language) => language === query.locale) ?? "fa";
  if (!revision || !market) notFound();
  const body = editorialContent.parse(revision.body);
  const rail =
    body.kind === "LOOK" && body.livingRail && body.visual?.mode === "PHOTO"
      ? await Promise.all([
          resolveLookVisuals([body], [market.id]),
          resolveLookCommerce([body], market, locale),
        ])
      : null;
  const [messages, t] = await Promise.all([
    getMessages({ locale }),
    getTranslations({ locale, namespace: "editorial" }),
  ]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main
        className={`editorial-page editorial-admin-preview ${query.view === "mobile" ? "editorial-preview-mobile" : ""}`}
        lang={locale}
        dir={locale === "fa" ? "rtl" : "ltr"}
      >
        <p>
          <bdi>#{revision.number}</bdi> ·{" "}
          {t(query.view === "mobile" ? "mobile" : "desktop")} ·{" "}
          <bdi>{market.code}</bdi>
        </p>
        {body.kind === "LOOK" && rail?.[0][0] && rail[1][0] && (
          <LivingRail
            id={id}
            revisionId={revision.id}
            slug=""
            body={body}
            visual={rail[0][0]}
            commerce={rail[1][0]}
            market={market}
            locale={locale}
            weekly={body.livingRail?.layout === "RACK"}
            preview
          />
        )}
        {body.kind === "LOOK" ? (
          <CuratedDetail
            id={id}
            revisionId={revision.id}
            body={body}
            market={market}
            locale={locale}
            preview
          />
        ) : (
          <MagazineArticle
            body={body}
            market={market}
            locale={locale}
            slug=""
            preview
          />
        )}
      </main>
    </NextIntlClientProvider>
  );
}
