import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import {
  ProductEditor,
  type ProductEditorValue,
} from "@/components/admin/product-editor";

const EMPTY: ProductEditorValue = {
  titleI18n: empty(),
  descriptionI18n: empty(),
  slugI18n: empty(),
  careI18n: empty(),
  seoTitleI18n: empty(),
  seoDescriptionI18n: empty(),
  seoOgMediaId: "",
  brandId: "",
  categoryId: "",
  collectionIds: [],
  gender: "UNISEX",
  material: "",
  fit: "",
  season: "",
  originCountry: "",
  tags: "",
  status: "DRAFT",
  basePriceAmount: "0.00",
  compareAtPriceAmount: "",
  defaultPurchaseCostAmount: "",
  defaultPurchaseCostCurrency: "USD",
  weightGrams: 250,
  marketIds: [],
  mediaIds: [],
  variants: [],
  attributes: [],
};

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "catalog.product.view"))
  )
    redirect("/admin");
  const { id } = await params;
  const t = await getTranslations("catalogAdmin");
  const [
    product,
    brands,
    categories,
    collections,
    colors,
    sizes,
    markets,
    media,
  ] = await Promise.all([
    id === "new"
      ? Promise.resolve(null)
      : db.product.findFirst({
          where: { id, deletedAt: null },
          include: {
            collections: true,
            media: { orderBy: { sortOrder: "asc" } },
            variants: {
              include: {
                media: { orderBy: { sortOrder: "asc" } },
                stockItems: true,
              },
            },
            attributes: true,
          },
        }),
    db.brand.findMany({ where: { deletedAt: null }, orderBy: { slug: "asc" } }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    db.collection.findMany({
      where: { deletedAt: null },
      orderBy: { slug: "asc" },
    }),
    db.color.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    db.size.findMany({
      where: { deletedAt: null },
      orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }],
    }),
    db.market.findMany({ orderBy: { id: "asc" } }),
    db.media.findMany({
      where: { deletedAt: null, status: "READY", kind: "image" },
      select: { id: true, url: true },
    }),
  ]);
  if (id !== "new" && !product) notFound();
  const initial = product ? toEditor(product) : EMPTY;
  const option = (
    item: { id: string },
    label: string,
    code?: string,
    meta?: string,
  ) => ({ id: item.id, label, code, meta });
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">
          {product ? t("editProduct") : t("newProduct")}
        </h1>
        <p className="muted">{t("editorSubtitle")}</p>
      </div>
      <ProductEditor
        initial={initial}
        brands={brands.map((x) => option(x, local(x.nameI18n), x.slug))}
        categories={categories.map((x) => option(x, local(x.titleI18n)))}
        collections={collections.map((x) => option(x, local(x.titleI18n)))}
        colors={colors.map((x) => option(x, local(x.nameI18n), x.code))}
        sizes={sizes.map((x) => option(x, x.value, undefined, x.scale))}
        markets={markets.map((x) => option(x, x.name, x.id))}
        mediaUrls={Object.fromEntries(media.map((x) => [x.id, x.url]))}
        stockByVariant={Object.fromEntries(
          (product?.variants ?? []).map((variant) => [
            variant.id,
            {
              onHand: variant.stockItems.reduce(
                (sum, item) => sum + item.onHand,
                0,
              ),
              reserved: variant.stockItems.reduce(
                (sum, item) => sum + item.reserved,
                0,
              ),
            },
          ]),
        )}
      />
    </div>
  );
}

function toEditor(
  product: NonNullable<Awaited<ReturnType<typeof db.product.findFirst>>> & {
    collections: Array<{ id: string }>;
    media: Array<{ mediaId: string }>;
    variants: Array<{
      id: string;
      colorId: string;
      sizeId: string;
      sku: string;
      barcode: string | null;
      priceOverrideUsd: { toString(): string } | null;
      weightGrams: number | null;
      isActive: boolean;
      media: Array<{ mediaId: string }>;
      stockItems: Array<{ onHand: number; reserved: number }>;
    }>;
    attributes: Array<{ key: string; valueI18n: unknown }>;
  },
): ProductEditorValue {
  const seo = product.seoI18n as {
    title?: unknown;
    description?: unknown;
    ogMediaId?: string;
  };
  return {
    id: product.id,
    titleI18n: localized(product.titleI18n),
    descriptionI18n: localized(product.descriptionI18n),
    slugI18n: localized(product.slugI18n),
    careI18n: localized(product.careI18n),
    seoTitleI18n: localized(seo.title),
    seoDescriptionI18n: localized(seo.description),
    seoOgMediaId: seo.ogMediaId ?? "",
    brandId: product.brandId ?? "",
    categoryId: product.categoryId,
    collectionIds: product.collections.map((x) => x.id),
    gender: product.gender,
    material: product.material ?? "",
    fit: product.fit ?? "",
    season: product.season ?? "",
    originCountry: product.originCountry ?? "",
    tags: product.tags.join(", "),
    status: product.status,
    basePriceAmount: product.basePriceAmount.toString(),
    compareAtPriceAmount: product.compareAtPriceAmount?.toString() ?? "",
    defaultPurchaseCostAmount:
      product.defaultPurchaseCostAmount?.toString() ?? "",
    defaultPurchaseCostCurrency: (product.defaultPurchaseCostCurrency ??
      "USD") as ProductEditorValue["defaultPurchaseCostCurrency"],
    weightGrams: product.weightGrams,
    marketIds: product.marketIds,
    mediaIds: product.media.map((x) => x.mediaId),
    variants: product.variants.map((x) => ({
      id: x.id,
      colorId: x.colorId,
      sizeId: x.sizeId,
      sku: x.sku,
      barcode: x.barcode ?? "",
      priceOverrideUsd: x.priceOverrideUsd?.toString() ?? "",
      weightGrams: x.weightGrams ?? undefined,
      isActive: x.isActive,
      mediaIds: x.media.map((m) => m.mediaId),
    })),
    attributes: product.attributes.map((x) => ({
      key: x.key,
      valueI18n: localized(x.valueI18n),
    })),
  };
}
function localized(value: unknown) {
  const row = (value ?? {}) as Record<string, string>;
  return { fa: row.fa ?? "", tr: row.tr ?? "", en: row.en ?? "" };
}
function local(value: unknown) {
  const row = localized(value);
  return row.fa || row.tr || row.en || "—";
}
function empty() {
  return { fa: "", tr: "", en: "" };
}
