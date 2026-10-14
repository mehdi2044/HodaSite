import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { catalogText } from "@/modules/catalog";
import {
  storeCutoutModels,
  imageFingerprint,
} from "@/modules/catalog/cutouts/models";
import { cutoutGeometrySchema } from "@/modules/catalog/cutouts/contracts";
import { cutoutPublicImage } from "@/modules/catalog/cutouts/resolve";
import { CutoutEditor } from "@/components/admin/cutout-editor";
import { saveCutoutAction, archiveCutoutAction } from "./actions";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function CutoutsAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    product?: string;
    color?: string;
    variant?: string;
    q?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  if (!(await can(session.user.id, "catalog.product.view"))) notFound();
  const [query, locale, t, models, writable] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("cutouts"),
    storeCutoutModels(),
    can(session.user.id, "catalog.product.edit"),
  ]);
  const where = {
    deletedAt: null,
    coinPackCoins: null,
    category: { deletedAt: null },
  };
  const products = await db.product.findMany({
    where: {
      ...where,
      ...(query.q
        ? {
            searchText: {
              contains: query.q.slice(0, 160),
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 60,
  });
  const productId = query.product ?? products[0]?.id;
  if (!productId) return <p>{t("noProduct")}</p>;
  const product = await db.product.findFirst({
    where: { ...where, id: productId },
    include: {
      variants: {
        where: {
          isActive: true,
          color: { deletedAt: null },
          size: { deletedAt: null },
        },
        include: { color: true, size: true },
        orderBy: [{ colorId: "asc" }, { size: { sortOrder: "asc" } }],
      },
    },
  });
  if (!product) notFound();
  const colorId = query.color ?? product.variants[0]?.colorId;
  const variants = product.variants.filter((v) => v.colorId === colorId);
  if (
    !colorId ||
    !variants.length ||
    (query.variant && !variants.some((v) => v.id === query.variant))
  )
    notFound();
  const row = await db.catalogCutout.findFirst({
    where: query.variant
      ? { variantId: query.variant }
      : { productId: product.id, colorId, variantId: null },
  });
  const media = row
    ? await db.media.findUnique({ where: { id: row.mediaId } })
    : null;
  const geometry = cutoutGeometrySchema.safeParse(row?.geometry);
  const markets = await db.market.findMany({
    where: { id: { in: product.marketIds }, isActive: true },
    orderBy: { code: "asc" },
  });
  const name = (value: unknown) =>
    catalogText(value, locale as "fa" | "tr" | "en");
  const choices = products.some((p) => p.id === product.id)
    ? products
    : [product, ...products];
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted mt-2">{t("intro")}</p>
      <form method="get" className="flex flex-wrap gap-2 mt-4">
        <label>
          {t("searchProducts")}
          <input
            name="q"
            className="input"
            defaultValue={query.q ?? ""}
            maxLength={160}
          />
        </label>
        <button className="button">{t("search")}</button>
      </form>
      <CutoutEditor
        productId={product.id}
        colorId={colorId}
        variantId={query.variant ?? null}
        slot={product.fittingSlot}
        products={choices.map((p) => ({ id: p.id, title: name(p.titleI18n) }))}
        colors={[
          ...new Map(
            product.variants.map((v) => [
              v.colorId,
              { id: v.colorId, title: name(v.color.nameI18n) },
            ]),
          ).values(),
        ]}
        variants={variants.map((v) => ({ id: v.id, size: v.size.value }))}
        profile={
          row
            ? {
                id: row.id,
                version: row.version,
                mediaId: row.mediaId,
                anchor: row.anchor,
                archived: Boolean(row.deletedAt),
              }
            : null
        }
        initialGeometry={
          geometry.success ? geometry.data : { version: 1, models: [] }
        }
        initialImage={
          media
            ? {
                id: media.id,
                ...cutoutPublicImage(media),
                fingerprint: imageFingerprint(media),
              }
            : null
        }
        models={models.map((m) => ({
          id: m.id,
          kind: m.kind,
          label: name(m.label),
          image: cutoutPublicImage(m.image),
          fingerprint: m.fingerprint,
        }))}
        markets={markets.map((m) => ({
          id: m.id,
          code: m.code,
          enabledLocales: m.enabledLocales,
        }))}
        writable={writable}
        action={saveCutoutAction}
        archive={archiveCutoutAction}
      />
    </>
  );
}
