import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input, Select, Table, TD, TH } from "@/components/ui";
import { CatalogActionForm } from "@/components/admin/catalog-action-form";
import { ActionSubmit } from "@/components/admin/action-submit";
import { SizeGuideEditor } from "@/components/admin/size-guide-editor";
import { archiveTaxonomy, saveTaxonomy } from "./actions";

type Params = Record<string, string | string[] | undefined>;
export default async function CatalogTaxonomyPage({
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
  const t = await getTranslations("catalogAdmin");
  const [brands, categories, collections, colors, sizes, guides] =
    await Promise.all([
      db.brand.findMany({
        where: { deletedAt: null },
        orderBy: { slug: "asc" },
      }),
      db.category.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.collection.findMany({
        where: { deletedAt: null },
        orderBy: { slug: "asc" },
      }),
      db.color.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
      }),
      db.size.findMany({
        where: { deletedAt: null },
        orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }],
      }),
      db.sizeGuide.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const query = await searchParams;
  const editKind = String(query.editKind ?? "");
  const editId = String(query.editId ?? "");
  const brandEdit =
    editKind === "brand" ? brands.find((x) => x.id === editId) : undefined;
  const collectionEdit =
    editKind === "collection"
      ? collections.find((x) => x.id === editId)
      : undefined;
  const colorEdit =
    editKind === "color" ? colors.find((x) => x.id === editId) : undefined;
  const sizeEdit =
    editKind === "size" ? sizes.find((x) => x.id === editId) : undefined;
  const categoryEdit =
    editKind === "category"
      ? categories.find((x) => x.id === editId)
      : undefined;
  const guideEdit =
    editKind === "sizeGuide" ? guides.find((x) => x.id === editId) : undefined;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("taxonomyTitle")}</h1>
        <p className="muted mt-1">{t("taxonomySubtitle")}</p>
      </div>
      <TaxonomySection
        title={t("brands")}
        kind="brand"
        rows={brands.map((row) => ({
          id: row.id,
          code: row.slug,
          title: title(row.nameI18n),
        }))}
        fields={
          <>
            <Field
              name="slug"
              label={t("englishId")}
              defaultValue={brandEdit?.slug}
            />
            <Localized
              prefix="name"
              label={t("name")}
              value={brandEdit?.nameI18n}
            />
          </>
        }
        editId={brandEdit?.id}
      />
      <TaxonomySection
        title={t("collections")}
        kind="collection"
        rows={collections.map((row) => ({
          id: row.id,
          code: row.slug,
          title: title(row.titleI18n),
        }))}
        fields={
          <>
            <Field
              name="slug"
              label={t("englishId")}
              defaultValue={collectionEdit?.slug}
            />
            <Localized
              prefix="name"
              label={t("productTitle")}
              value={collectionEdit?.titleI18n}
            />
          </>
        }
        editId={collectionEdit?.id}
      />
      <TaxonomySection
        title={t("colors")}
        kind="color"
        rows={colors.map((row) => ({
          id: row.id,
          code: row.code,
          title: `${title(row.nameI18n)} · ${row.hex}`,
        }))}
        fields={
          <>
            <Field
              name="code"
              label={t("colorCode")}
              defaultValue={colorEdit?.code}
            />
            <Field
              name="hex"
              label={t("hexColor")}
              defaultValue={colorEdit?.hex}
            />
            <Localized
              prefix="name"
              label={t("colorName")}
              value={colorEdit?.nameI18n}
            />
          </>
        }
        editId={colorEdit?.id}
      />
      <TaxonomySection
        title={t("sizes")}
        kind="size"
        rows={sizes.map((row) => ({
          id: row.id,
          code: `${row.scale}/${row.groupKey}`,
          title: row.value,
        }))}
        fields={
          <>
            <label>
              {t("scale")}
              <Select name="scale" defaultValue={sizeEdit?.scale ?? "INTL"}>
                <option>INTL</option>
                <option>EU</option>
                <option>TR</option>
                <option>US</option>
                <option>CA</option>
              </Select>
            </label>
            <Field
              name="value"
              label={t("sizeValue")}
              defaultValue={sizeEdit?.value}
            />
            <Field
              name="groupKey"
              label={t("groupKey")}
              defaultValue={sizeEdit?.groupKey}
            />
            <Field
              name="sortOrder"
              label={t("sortOrder")}
              type="number"
              defaultValue={sizeEdit?.sortOrder}
            />
          </>
        }
        editId={sizeEdit?.id}
      />
      <Card>
        <h2 className="text-xl font-semibold">{t("categories")}</h2>
        <CatalogActionForm
          action={saveTaxonomy}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="kind" value="category" />
          {categoryEdit && (
            <input type="hidden" name="id" value={categoryEdit.id} />
          )}
          <Localized
            prefix="name"
            label={t("productTitle")}
            value={categoryEdit?.titleI18n}
          />
          <Localized
            prefix="slug"
            label="Slug"
            value={categoryEdit?.slugI18n}
          />
          <Localized
            prefix="description"
            label={t("description")}
            value={categoryEdit?.descriptionI18n}
          />
          <label>
            {t("gender")}
            <Select name="gender" defaultValue={categoryEdit?.gender}>
              <option>WOMEN</option>
              <option>MEN</option>
              <option>KIDS</option>
              <option>UNISEX</option>
            </Select>
          </label>
          <label>
            {t("parent")}
            <Select name="parentId" defaultValue={categoryEdit?.parentId ?? ""}>
              <option value="">{t("noParent")}</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {title(row.titleI18n)}
                </option>
              ))}
            </Select>
          </label>
          <Field
            name="sortOrder"
            label={t("sortOrder")}
            type="number"
            defaultValue={categoryEdit?.sortOrder}
          />
        </CatalogActionForm>
        <Rows
          kind="category"
          rows={categories.map((row) => ({
            id: row.id,
            code: row.gender,
            title: title(row.titleI18n),
          }))}
        />
      </Card>
      <Card>
        <h2 className="text-xl font-semibold">{t("sizeGuides")}</h2>
        <CatalogActionForm
          action={saveTaxonomy}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="kind" value="sizeGuide" />
          {guideEdit && <input type="hidden" name="id" value={guideEdit.id} />}
          <Localized
            prefix="name"
            label={t("guideName")}
            value={guideEdit?.nameI18n}
          />
          <label>
            {t("scope")}
            <Select name="scope" defaultValue={guideEdit?.scope}>
              <option value="brand">{t("brand")}</option>
              <option value="category">{t("category")}</option>
              <option value="product">{t("product")}</option>
            </Select>
          </label>
          <Field
            name="refId"
            label={t("referenceId")}
            defaultValue={guideEdit?.refId}
          />
          <SizeGuideEditor
            initialUnit={guideEdit?.unit as "cm" | "in" | undefined}
            initialTable={guideEdit?.tableI18n}
          />
        </CatalogActionForm>
        <Rows
          kind="sizeGuide"
          rows={guides.map((row) => ({
            id: row.id,
            code: `${row.scope}/${row.unit}`,
            title: title(row.nameI18n),
          }))}
        />
      </Card>
    </div>
  );
}

function TaxonomySection({
  title: heading,
  kind,
  rows,
  fields,
  editId,
}: {
  title: string;
  kind: "brand" | "collection" | "color" | "size";
  rows: Array<{ id: string; code: string; title: string }>;
  fields: React.ReactNode;
  editId?: string;
}) {
  return (
    <Card>
      <h2 className="text-xl font-semibold">{heading}</h2>
      <CatalogActionForm
        action={saveTaxonomy}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <input type="hidden" name="kind" value={kind} />
        {editId && <input type="hidden" name="id" value={editId} />}
        {fields}
      </CatalogActionForm>
      <Rows kind={kind} rows={rows} />
    </Card>
  );
}
async function Rows({
  kind,
  rows,
}: {
  kind: "brand" | "category" | "collection" | "color" | "size" | "sizeGuide";
  rows: Array<{ id: string; code: string; title: string }>;
}) {
  const t = await getTranslations("catalogAdmin");
  return (
    <Table className="mt-5">
      <thead>
        <tr>
          <TH>{t("productTitle")}</TH>
          <TH>{t("code")}</TH>
          <TH>{t("operations")}</TH>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <TD>{row.title}</TD>
            <TD>
              <bdi dir="ltr">{row.code}</bdi>
            </TD>
            <TD>
              <div className="flex flex-wrap gap-2">
                <a
                  className="button inline-flex items-center justify-center whitespace-nowrap"
                  href={`/admin/catalog/taxonomy?editKind=${kind}&editId=${row.id}`}
                >
                  {t("edit")}
                </a>
                <ActionSubmit
                  action={archiveTaxonomy}
                  fields={{ id: row.id, kind }}
                  label={t("archive")}
                  variant="destructive"
                />
              </div>
            </TD>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number;
}) {
  return (
    <label>
      {label}
      <Input
        className="mt-1"
        name={name}
        type={type}
        required
        defaultValue={defaultValue}
      />
    </label>
  );
}
async function Localized({
  prefix,
  label,
  value,
}: {
  prefix: string;
  label: string;
  value?: unknown;
}) {
  const t = await getTranslations("catalogAdmin");
  const initial = (value ?? {}) as Record<string, string>;
  return (
    <fieldset className="grid gap-2 rounded-[10px] border border-black/10 p-3 md:col-span-2">
      <legend>{label}</legend>
      <Field
        name={`${prefix}Fa`}
        label={t("persian")}
        defaultValue={initial.fa}
      />
      <Field
        name={`${prefix}Tr`}
        label={t("turkish")}
        defaultValue={initial.tr}
      />
      <Field
        name={`${prefix}En`}
        label={t("english")}
        defaultValue={initial.en}
      />
    </fieldset>
  );
}
function title(value: unknown) {
  const item = value as Record<string, string>;
  return item.fa || item.tr || item.en || "—";
}
