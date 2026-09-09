import { redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input, Select, Table, TD, TH } from "@/components/ui";
import { CatalogActionForm } from "@/components/admin/catalog-action-form";
import { ActionSubmit } from "@/components/admin/action-submit";
import { SizeGuideEditor } from "@/components/admin/size-guide-editor";
import { archiveTaxonomy, saveTaxonomy } from "./actions";

export default async function CatalogTaxonomyPage() {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "catalog.product.view"))
  )
    redirect("/admin");
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
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">طبقه‌بندی کاتالوگ</h1>
        <p className="muted mt-1">
          برند، دسته، کالکشن، رنگ، سایز و راهنمای اندازه
        </p>
      </div>
      <TaxonomySection
        title="برندها"
        kind="brand"
        rows={brands.map((row) => ({
          id: row.id,
          code: row.slug,
          title: title(row.nameI18n),
        }))}
        fields={
          <>
            <Field name="slug" label="شناسه انگلیسی" />
            <Localized prefix="name" label="نام" />
          </>
        }
      />
      <TaxonomySection
        title="کالکشن‌ها"
        kind="collection"
        rows={collections.map((row) => ({
          id: row.id,
          code: row.slug,
          title: title(row.titleI18n),
        }))}
        fields={
          <>
            <Field name="slug" label="شناسه انگلیسی" />
            <Localized prefix="name" label="عنوان" />
          </>
        }
      />
      <TaxonomySection
        title="رنگ‌ها"
        kind="color"
        rows={colors.map((row) => ({
          id: row.id,
          code: row.code,
          title: `${title(row.nameI18n)} · ${row.hex}`,
        }))}
        fields={
          <>
            <Field name="code" label="کد رنگ مثل NAVY" />
            <Field name="hex" label="رنگ Hex مثل #112233" />
            <Localized prefix="name" label="نام رنگ" />
          </>
        }
      />
      <TaxonomySection
        title="سایزها"
        kind="size"
        rows={sizes.map((row) => ({
          id: row.id,
          code: `${row.scale}/${row.groupKey}`,
          title: row.value,
        }))}
        fields={
          <>
            <label>
              مقیاس
              <Select name="scale" defaultValue="INTL">
                <option>INTL</option>
                <option>EU</option>
                <option>TR</option>
                <option>US</option>
                <option>CA</option>
              </Select>
            </label>
            <Field name="value" label="مقدار مثل M یا 42" />
            <Field name="groupKey" label="گروه مثل tops" />
            <Field name="sortOrder" label="ترتیب" type="number" />
          </>
        }
      />
      <Card>
        <h2 className="text-xl font-semibold">دسته‌بندی‌ها</h2>
        <CatalogActionForm
          action={saveTaxonomy}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="kind" value="category" />
          <Localized prefix="name" label="عنوان" />
          <Localized prefix="slug" label="Slug" />
          <Localized prefix="description" label="توضیح" />
          <label>
            گروه
            <Select name="gender">
              <option>WOMEN</option>
              <option>MEN</option>
              <option>KIDS</option>
              <option>UNISEX</option>
            </Select>
          </label>
          <label>
            والد
            <Select name="parentId">
              <option value="">بدون والد</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {title(row.titleI18n)}
                </option>
              ))}
            </Select>
          </label>
          <Field name="sortOrder" label="ترتیب" type="number" />
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
        <h2 className="text-xl font-semibold">راهنمای سایز</h2>
        <CatalogActionForm
          action={saveTaxonomy}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="kind" value="sizeGuide" />
          <Localized prefix="name" label="نام راهنما" />
          <label>
            سطح
            <Select name="scope">
              <option value="brand">برند</option>
              <option value="category">دسته</option>
              <option value="product">محصول</option>
            </Select>
          </label>
          <Field name="refId" label="شناسه برند/دسته/محصول" />
          <SizeGuideEditor />
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
}: {
  title: string;
  kind: "brand" | "collection" | "color" | "size";
  rows: Array<{ id: string; code: string; title: string }>;
  fields: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-xl font-semibold">{heading}</h2>
      <CatalogActionForm
        action={saveTaxonomy}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <input type="hidden" name="kind" value={kind} />
        {fields}
      </CatalogActionForm>
      <Rows kind={kind} rows={rows} />
    </Card>
  );
}
function Rows({
  kind,
  rows,
}: {
  kind: "brand" | "category" | "collection" | "color" | "size" | "sizeGuide";
  rows: Array<{ id: string; code: string; title: string }>;
}) {
  return (
    <Table className="mt-5">
      <thead>
        <tr>
          <TH>عنوان</TH>
          <TH>کد</TH>
          <TH>عملیات</TH>
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
              <ActionSubmit
                action={archiveTaxonomy}
                fields={{ id: row.id, kind }}
                label="بایگانی"
                variant="destructive"
              />
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
}: {
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <label>
      {label}
      <Input className="mt-1" name={name} type={type} required />
    </label>
  );
}
function Localized({ prefix, label }: { prefix: string; label: string }) {
  return (
    <fieldset className="grid gap-2 rounded-[10px] border border-black/10 p-3 md:col-span-2">
      <legend>{label}</legend>
      <Field name={`${prefix}Fa`} label="فارسی" />
      <Field name={`${prefix}Tr`} label="ترکی" />
      <Field name={`${prefix}En`} label="انگلیسی" />
    </fieldset>
  );
}
function title(value: unknown) {
  const item = value as Record<string, string>;
  return item.fa || item.tr || item.en || "—";
}
