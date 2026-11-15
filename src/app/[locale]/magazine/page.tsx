import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { seoPath } from "@/lib/seo-urls";
import { getRequestContext } from "@/lib/request-context";
import {
  articleCategories,
  audiences,
  locales,
  type EditorialLocale,
} from "@/modules/editorial/contracts";
import {
  editorialSlug,
  publishedEntries,
  readyImages,
} from "@/modules/editorial/queries";
import { WeeklyEditorial } from "@/components/storefront/weekly-editorial";
import { EditorialImage } from "@/components/storefront/editorial-image";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: EditorialLocale }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale)) return {};
  const [{ market }, t] = await Promise.all([
    getRequestContext(locale),
    getTranslations({ locale, namespace: "editorial" }),
  ]);
  return {
    title: t("magazine"),
    alternates: { canonical: seoPath(locale, market.code, "magazine") },
  };
}

export default async function MagazinePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: EditorialLocale }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    audience?: string;
    archive?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();
  const [{ market }, t, { q, category, audience, archive, page }] =
    await Promise.all([
      getRequestContext(locale),
      getTranslations("editorial"),
      searchParams,
    ]);
  const term =
    typeof q === "string"
      ? q.trim().slice(0, 100).toLocaleLowerCase(locale)
      : "";
  const categoryFilter = articleCategories.find((value) => value === category);
  const audienceFilter = audiences.find((value) => value === audience);
  const filtered = Boolean(term || categoryFilter || audienceFilter || archive);
  const offset =
    typeof page === "string" && /^\d{1,5}$/.test(page)
      ? Math.max(0, Number(page) - 1) * 12
      : 0;
  const rows = (await publishedEntries("ARTICLE", market.id))
    .flatMap((entry) =>
      entry.body.kind === "ARTICLE" ? [{ ...entry, body: entry.body }] : [],
    )
    .filter(
      ({ body }) =>
        (!categoryFilter || body.category === categoryFilter) &&
        (!audienceFilter || body.audience === audienceFilter) &&
        (!term ||
          [
            body.title[locale],
            body.summary[locale],
            ...body.tags,
            ...body.blocks.flatMap((block) =>
              "text" in block ? [block.text[locale]] : [],
            ),
          ].some((text) => text.toLocaleLowerCase(locale).includes(term))),
    )
    .sort(
      (a, b) =>
        b.revision.visibleFrom!.getTime() - a.revision.visibleFrom!.getTime(),
    );
  const featured =
    !filtered && offset === 0
      ? rows.find((entry) => entry.body.featured)
      : undefined;
  const latest = rows
    .filter((entry) => entry.id !== featured?.id)
    .slice(offset, offset + 12);
  const images = await readyImages(
    [...latest, ...(featured ? [featured] : [])].flatMap(({ body }) => [
      body.mediaId,
      body.mobileMediaId ?? body.mediaId,
    ]),
  );
  const path = seoPath(locale, market.code, "magazine");
  function article(entry: (typeof rows)[number], prominent = false) {
    const href = seoPath(
      locale,
      market.code,
      "magazine",
      editorialSlug(entry, locale),
    );
    return (
      <article
        className={
          prominent ? "editorial-card editorial-feature" : "editorial-card"
        }
        key={entry.id}
      >
        <Link href={href} aria-label={entry.body.title[locale]}>
          <EditorialImage
            desktop={images.find((image) => image.id === entry.body.mediaId)}
            mobile={images.find(
              (image) => image.id === entry.body.mobileMediaId,
            )}
            focal={entry.body.focal}
            locale={locale}
            priority={prominent}
          />
        </Link>
        <div className="editorial-card-copy">
          <p className="editorial-kicker">
            {t(`facet.${entry.body.category}`)} ·{" "}
            {t(`facet.${entry.body.audience}`)}
          </p>
          <h2>
            <Link href={href}>{entry.body.title[locale]}</Link>
          </h2>
          <p>{entry.body.summary[locale]}</p>
          <Link className="button" href={href}>
            {t("readArticle")}
          </Link>
        </div>
      </article>
    );
  }
  function nextHref(index: number) {
    const query = new URLSearchParams({ page: String(index) });
    if (term) query.set("q", term);
    if (categoryFilter) query.set("category", categoryFilter);
    if (audienceFilter) query.set("audience", audienceFilter);
    if (archive === "articles") query.set("archive", "articles");
    return `${path}?${query}`;
  }
  return (
    <main className="shell editorial-page">
      <header className="editorial-heading">
        <Link href={seoPath(locale, market.code, "looks")}>{t("gallery")}</Link>
        <h1>{t("magazine")}</h1>
      </header>
      {archive === "weekly" ? (
        <WeeklyEditorial locale={locale} market={market} archive />
      ) : (
        <>
          {featured && article(featured, true)}
          {!filtered && <WeeklyEditorial locale={locale} market={market} />}
          <nav className="editorial-link-row" aria-label={t("audience")}>
            {audiences.map((value) => (
              <Link href={`${path}?audience=${value}`} key={value}>
                {t(`facet.${value}`)}
              </Link>
            ))}
          </nav>
          <form className="editorial-filters" action={path}>
            <label>
              {t("search")}
              <input
                className="input"
                name="q"
                defaultValue={term}
                type="search"
              />
            </label>
            <label>
              {t("category")}
              <select
                className="input"
                name="category"
                defaultValue={categoryFilter ?? ""}
              >
                <option value="">{t("all")}</option>
                {articleCategories.map((value) => (
                  <option key={value} value={value}>
                    {t(`facet.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("audience")}
              <select
                className="input"
                name="audience"
                defaultValue={audienceFilter ?? ""}
              >
                <option value="">{t("all")}</option>
                {audiences.map((value) => (
                  <option key={value} value={value}>
                    {t(`facet.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <button className="button">{t("filter")}</button>
          </form>
          <section className="editorial-section">
            <h2>{t(archive ? "archiveTitle" : "latest")}</h2>
            {latest.length > 0 ? (
              <div className="editorial-grid">
                {latest.map((entry) => article(entry))}
              </div>
            ) : (
              <p className="editorial-empty">{t("empty")}</p>
            )}
            <nav className="editorial-link-row" aria-label={t("archiveTitle")}>
              {offset > 0 && (
                <Link href={nextHref(offset / 12)}>{t("previous")}</Link>
              )}
              {offset + 12 < rows.length - (featured ? 1 : 0) && (
                <Link href={nextHref(offset / 12 + 2)}>{t("next")}</Link>
              )}
              {!archive && (
                <Link href={path + "?archive=articles"}>
                  {t("archiveTitle")}
                </Link>
              )}
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
