import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Card, Select, Table, TD, TH } from "@/components/ui";
import {
  duplicateProduct,
  quickEditProduct,
  setProductDeleted,
  setProductStatus,
} from "./actions";

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "catalog.product.view"))
  )
    redirect("/admin");
  const params = await searchParams;
  const t = await getTranslations("catalogAdmin");
  const q = one(params.q)?.trim() ?? "";
  const status = one(params.status);
  const categoryId = one(params.category);
  const brandId = one(params.brand);
  const marketId = one(params.market);
  const [products, categories, brands, markets] = await Promise.all([
    db.product.findMany({
      where: {
        deletedAt: null,
        ...(status
          ? { status: status as "DRAFT" | "ACTIVE" | "ARCHIVED" }
          : {}),
        ...(q ? { searchText: { contains: q, mode: "insensitive" } } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(brandId ? { brandId } : {}),
        ...(marketId ? { marketIds: { has: marketId } } : {}),
      },
      include: { category: true, brand: true, variants: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    db.brand.findMany({ where: { deletedAt: null }, orderBy: { slug: "asc" } }),
    db.market.findMany({ orderBy: { code: "asc" } }),
  ]);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="muted">{t("subtitle")}</p>
        </div>
        <Link className="button" href="/admin/catalog/products/new">
          {t("newProduct")}
        </Link>
      </div>
      <Card>
        <form method="get" className="flex flex-wrap gap-2">
          <input
            className="h-10 rounded-[8px] border border-black/15 px-3"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
          />
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">{t("allStatuses")}</option>
            <option value="DRAFT">{t("draft")}</option>
            <option value="ACTIVE">{t("active")}</option>
            <option value="ARCHIVED">{t("archived")}</option>
          </Select>
          <Select name="category" defaultValue={categoryId ?? ""}>
            <option value="">{t("allCategories")}</option>
            {categories.map((x) => (
              <option key={x.id} value={x.id}>
                {title(x.titleI18n)}
              </option>
            ))}
          </Select>
          <Select name="brand" defaultValue={brandId ?? ""}>
            <option value="">{t("allBrands")}</option>
            {brands.map((x) => (
              <option key={x.id} value={x.id}>
                {title(x.nameI18n)}
              </option>
            ))}
          </Select>
          <Select name="market" defaultValue={marketId ?? ""}>
            <option value="">{t("allMarkets")}</option>
            {markets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code}
              </option>
            ))}
          </Select>
          <button className="button" type="submit">
            {t("apply")}
          </button>
        </form>
      </Card>
      <Card>
        <form
          id="bulk-products"
          action={async (data) => {
            "use server";
            await setProductStatus(null, data);
          }}
          className="mb-3 flex flex-wrap gap-2"
        >
          <Select name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">{t("activate")}</option>
            <option value="DRAFT">{t("draft")}</option>
            <option value="ARCHIVED">{t("archived")}</option>
          </Select>
          <button className="button" type="submit">
            {t("bulkStatus")}
          </button>
        </form>
        <Table>
          <thead>
            <tr>
              <TH>{t("select")}</TH>
              <TH>{t("product")}</TH>
              <TH>{t("categoryBrand")}</TH>
              <TH>{t("variantsCount")}</TH>
              <TH>{t("status")}</TH>
              <TH>{t("operations")}</TH>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => (
              <tr key={item.id}>
                <TD>
                  <input
                    form="bulk-products"
                    type="checkbox"
                    name="ids"
                    value={item.id}
                    aria-label={t("selectRow", { name: title(item.titleI18n) })}
                  />
                </TD>
                <TD>
                  <Link
                    className="underline"
                    href={`/admin/catalog/products/${item.id}`}
                  >
                    {title(item.titleI18n)}
                  </Link>
                </TD>
                <TD>
                  {title(item.category.titleI18n)} /{" "}
                  {item.brand ? title(item.brand.nameI18n) : "—"}
                </TD>
                <TD>{item.variants.length}</TD>
                <TD>
                  <form
                    action={async (data) => {
                      "use server";
                      await quickEditProduct(null, data);
                    }}
                    className="flex flex-wrap gap-1"
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      className="h-9 w-24 rounded border px-2"
                      name="basePriceAmount"
                      defaultValue={item.basePriceAmount.toString()}
                      aria-label={t("usdPrice")}
                    />
                    <Select name="status" defaultValue={item.status}>
                      <option>DRAFT</option>
                      <option>ACTIVE</option>
                      <option>ARCHIVED</option>
                    </Select>
                    <button className="button" type="submit">
                      {t("save")}
                    </button>
                  </form>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <ActionSubmit
                      action={duplicateProduct}
                      fields={{ id: item.id }}
                      label={t("copy")}
                      variant="secondary"
                    />
                    <ActionSubmit
                      action={setProductDeleted}
                      fields={{ id: item.id }}
                      label={t("remove")}
                      variant="destructive"
                    />
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function title(value: unknown) {
  const item = value as Record<string, string>;
  return item.fa || item.tr || item.en || "—";
}
