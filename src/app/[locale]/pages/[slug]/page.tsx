import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/lib/request-context";
import { getPublishedPage, type Localized } from "@/modules/content";
import { ContentBlocks } from "@/components/storefront/content-blocks";

type Props = { params: Promise<{ locale: "fa" | "tr" | "en"; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const { market } = await getRequestContext(locale);
  const page = await getPublishedPage(slug, locale, market.id);
  if (!page) return {};
  const seo = page.seoI18n as { title?: Localized; description?: Localized };
  const title =
    (seo.title?.[locale] || (page.titleI18n as Localized)[locale]) ?? undefined;
  const description = seo.description?.[locale] || undefined;
  return { title, description };
}

export default async function CmsPage({ params }: Props) {
  const { locale, slug } = await params;
  const { market } = await getRequestContext(locale);
  const page = await getPublishedPage(slug, locale, market.id);
  if (!page) notFound();
  const title =
    (page.titleI18n as Localized)[locale] ||
    (page.titleI18n as Localized).fa ||
    "";
  return (
    <main className="shell py-10" dir={locale === "fa" ? "rtl" : "ltr"}>
      <h1 className="mb-10 text-4xl font-semibold md:text-6xl">{title}</h1>
      <ContentBlocks blocks={page.blocks} locale={locale} />
    </main>
  );
}
