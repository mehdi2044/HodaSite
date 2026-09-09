"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { MediaPicker } from "@/components/admin/media-picker";
import { CatalogActionForm } from "@/components/admin/catalog-action-form";
import { generateSku } from "@/modules/catalog";
import { saveProduct } from "@/app/admin/(dashboard)/catalog/products/actions";

type Localized = { fa: string; tr: string; en: string };
type Option = { id: string; label: string; code?: string; meta?: string };
type VariantDraft = {
  id?: string;
  colorId: string;
  sizeId: string;
  sku: string;
  barcode: string;
  priceOverrideUsd: string;
  weightGrams?: number;
  isActive: boolean;
  mediaIds: string[];
};
type AttributeDraft = { key: string; valueI18n: Localized };
export type ProductEditorValue = {
  id?: string;
  titleI18n: Localized;
  descriptionI18n: Localized;
  slugI18n: Localized;
  careI18n: Localized;
  seoTitleI18n: Localized;
  seoDescriptionI18n: Localized;
  seoOgMediaId: string;
  brandId: string;
  categoryId: string;
  collectionIds: string[];
  gender: "WOMEN" | "MEN" | "KIDS" | "UNISEX";
  material: string;
  fit: string;
  season: string;
  originCountry: string;
  tags: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  basePriceAmount: string;
  compareAtPriceAmount: string;
  defaultPurchaseCostAmount: string;
  defaultPurchaseCostCurrency: "USD" | "TRY" | "CAD" | "IRT";
  weightGrams: number;
  marketIds: string[];
  mediaIds: string[];
  variants: VariantDraft[];
  attributes: AttributeDraft[];
};

const TABS = [
  "عمومی",
  "رسانه",
  "تنوع‌ها",
  "قیمت",
  "راهنمای سایز",
  "SEO",
  "بازارها",
  "انتشار",
] as const;

export function ProductEditor({
  initial,
  brands,
  categories,
  collections,
  colors,
  sizes,
  markets,
  mediaUrls,
}: {
  initial: ProductEditorValue;
  brands: Option[];
  categories: Option[];
  collections: Option[];
  colors: Option[];
  sizes: Option[];
  markets: Option[];
  mediaUrls: Record<string, string>;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [mediaIds, setMediaIds] = useState(initial.mediaIds);
  const [variants, setVariants] = useState(initial.variants);
  const [attributes, setAttributes] = useState(initial.attributes);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("STYLE");
  const colorMap = useMemo(
    () => new Map(colors.map((item) => [item.id, item])),
    [colors],
  );
  const sizeMap = useMemo(
    () => new Map(sizes.map((item) => [item.id, item])),
    [sizes],
  );

  function generateMatrix() {
    const existing = new Set(
      variants.map((item) => `${item.colorId}:${item.sizeId}`),
    );
    const next = [...variants];
    for (const colorId of selectedColors)
      for (const sizeId of selectedSizes) {
        if (existing.has(`${colorId}:${sizeId}`)) continue;
        next.push({
          colorId,
          sizeId,
          sku: generateSku(
            prefix,
            colorMap.get(colorId)?.code ?? "CLR",
            sizeMap.get(sizeId)?.label ?? "ONE",
          ),
          barcode: "",
          priceOverrideUsd: "",
          isActive: true,
          mediaIds: [],
        });
      }
    setVariants(next);
  }

  return (
    <CatalogActionForm action={saveProduct} className="grid gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="mediaIds" value={JSON.stringify(mediaIds)} />
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      <input
        type="hidden"
        name="attributes"
        value={JSON.stringify(attributes)}
      />
      <div
        className="flex gap-2 overflow-x-auto rounded-token bg-surface p-2"
        role="tablist"
      >
        {TABS.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={tab === item ? "primary" : "ghost"}
            onClick={() => setTab(item)}
            role="tab"
            aria-selected={tab === item}
          >
            {item}
          </Button>
        ))}
      </div>

      <section hidden={tab !== "عمومی"}>
        <Card className="grid gap-4">
          <LocalizedFields
            prefix="title"
            label="عنوان محصول"
            value={initial.titleI18n}
          />
          <LocalizedAreas
            prefix="description"
            label="توضیحات"
            value={initial.descriptionI18n}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              دسته
              <Select
                name="categoryId"
                defaultValue={initial.categoryId}
                required
              >
                <option value="">انتخاب کنید</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              برند
              <Select name="brandId" defaultValue={initial.brandId}>
                <option value="">بدون برند</option>
                {brands.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              گروه
              <Select name="gender" defaultValue={initial.gender}>
                <option>WOMEN</option>
                <option>MEN</option>
                <option>KIDS</option>
                <option>UNISEX</option>
              </Select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              name="material"
              label="جنس"
              defaultValue={initial.material}
            />
            <Field name="fit" label="فرم" defaultValue={initial.fit} />
            <Field name="season" label="فصل" defaultValue={initial.season} />
            <Field
              name="originCountry"
              label="کشور سازنده (IR/TR/CA…)"
              defaultValue={initial.originCountry}
            />
            <Field
              name="tags"
              label="برچسب‌ها با ویرگول"
              defaultValue={initial.tags}
            />
          </div>
          <fieldset>
            <legend>کالکشن‌ها</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {collections.map((item) => (
                <Check
                  key={item.id}
                  name="collectionIds"
                  value={item.id}
                  label={item.label}
                  checked={initial.collectionIds.includes(item.id)}
                />
              ))}
            </div>
          </fieldset>
          <LocalizedAreas
            prefix="care"
            label="روش نگهداری"
            value={initial.careI18n}
          />
        </Card>
      </section>

      <section hidden={tab !== "رسانه"}>
        <Card>
          <h2 className="text-lg font-semibold">تصاویر محصول</h2>
          <p className="muted mt-1">تصویر اول، تصویر اصلی کارت محصول است.</p>
          <div className="mt-4">
            <MediaPicker
              name="newProductMedia"
              label="افزودن از کتابخانه"
              onSelect={(id) =>
                setMediaIds((items) =>
                  items.includes(id) ? items : [...items, id],
                )
              }
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {mediaIds.map((id, index) => (
              <div
                key={id}
                className="rounded-[10px] border border-black/10 p-2"
              >
                {mediaUrls[id] ? (
                  <img
                    src={mediaUrls[id]}
                    alt=""
                    className="aspect-square w-full rounded-[8px] object-cover"
                  />
                ) : (
                  <div className="aspect-square bg-black/5" />
                )}
                <div className="mt-2 flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setMediaIds((items) => move(items, index, -1))
                    }
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setMediaIds((items) => move(items, index, 1))
                    }
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setMediaIds((items) =>
                        items.filter((item) => item !== id),
                      )
                    }
                  >
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section hidden={tab !== "تنوع‌ها"}>
        <Card>
          <h2 className="text-lg font-semibold">ماتریس رنگ × سایز</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field
              name="skuPrefixPreview"
              label="پیشوند SKU"
              value={prefix}
              onChange={(value) => setPrefix(value)}
            />
            <fieldset>
              <legend>رنگ‌ها</legend>
              {colors.map((item) => (
                <Check
                  key={item.id}
                  value={item.id}
                  label={item.label}
                  checked={selectedColors.includes(item.id)}
                  onChange={(checked) =>
                    setSelectedColors(toggle(selectedColors, item.id, checked))
                  }
                />
              ))}
            </fieldset>
            <fieldset>
              <legend>سایزها</legend>
              {sizes.map((item) => (
                <Check
                  key={item.id}
                  value={item.id}
                  label={`${item.label} (${item.meta})`}
                  checked={selectedSizes.includes(item.id)}
                  onChange={(checked) =>
                    setSelectedSizes(toggle(selectedSizes, item.id, checked))
                  }
                />
              ))}
            </fieldset>
          </div>
          <Button type="button" className="mt-3" onClick={generateMatrix}>
            ساخت ترکیب‌ها
          </Button>
          <div className="mt-5 grid gap-2">
            {variants.map((variant, index) => (
              <div
                key={`${variant.colorId}-${variant.sizeId}`}
                className="grid items-end gap-2 rounded-[10px] border border-black/10 p-3 md:grid-cols-[1fr_1fr_2fr_1fr_auto]"
              >
                <span>{colorMap.get(variant.colorId)?.label}</span>
                <span>{sizeMap.get(variant.sizeId)?.label}</span>
                <Field
                  label="SKU"
                  value={variant.sku}
                  onChange={(value) =>
                    setVariants(
                      update(variants, index, { sku: value.toUpperCase() }),
                    )
                  }
                />
                <Field
                  label="قیمت USD اختیاری"
                  value={variant.priceOverrideUsd}
                  onChange={(value) =>
                    setVariants(
                      update(variants, index, { priceOverrideUsd: value }),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setVariants(
                      variants.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  حذف
                </Button>
                <label className="md:col-span-5">
                  <input
                    type="checkbox"
                    checked={variant.isActive}
                    onChange={(event) =>
                      setVariants(
                        update(variants, index, {
                          isActive: event.target.checked,
                        }),
                      )
                    }
                  />{" "}
                  فعال
                </label>
                <div className="md:col-span-5">
                  <MediaPicker
                    name={`variantMedia-${index}`}
                    label="تصویر ویژهٔ این تنوع"
                    onSelect={(mediaId) =>
                      setVariants(
                        update(variants, index, {
                          mediaIds: variant.mediaIds.includes(mediaId)
                            ? variant.mediaIds
                            : [...variant.mediaIds, mediaId],
                        }),
                      )
                    }
                  />
                  {variant.mediaIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {variant.mediaIds.map((mediaId) => (
                        <Button
                          key={mediaId}
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setVariants(
                              update(variants, index, {
                                mediaIds: variant.mediaIds.filter(
                                  (id) => id !== mediaId,
                                ),
                              }),
                            )
                          }
                        >
                          حذف تصویر {mediaId.slice(-5)}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section hidden={tab !== "قیمت"}>
        <Card className="grid gap-3 md:grid-cols-2">
          <Field
            name="basePriceAmount"
            label="قیمت پایه USD"
            type="text"
            defaultValue={initial.basePriceAmount}
          />
          <Field
            name="compareAtPriceAmount"
            label="قیمت قبل از تخفیف USD"
            defaultValue={initial.compareAtPriceAmount}
          />
          <Field
            name="defaultPurchaseCostAmount"
            label="هزینه خرید ثبت اولیه"
            defaultValue={initial.defaultPurchaseCostAmount}
          />
          <label>
            ارز هزینه خرید
            <Select
              name="defaultPurchaseCostCurrency"
              defaultValue={initial.defaultPurchaseCostCurrency}
            >
              <option>USD</option>
              <option>TRY</option>
              <option>CAD</option>
              <option>IRT</option>
            </Select>
          </label>
          <Field
            name="weightGrams"
            label="وزن پیش‌فرض (گرم)"
            type="number"
            defaultValue={String(initial.weightGrams)}
          />
        </Card>
      </section>

      <section hidden={tab !== "راهنمای سایز"}>
        <Card>
          <p>
            راهنمای سایز از بخش «طبقه‌بندی کاتالوگ» و بر اساس محصول، برند یا
            دسته انتخاب می‌شود. اولویت نمایش: محصول ← برند ← دسته.
          </p>
          <h3 className="mt-5 font-semibold">ویژگی‌های محصول</h3>
          {attributes.map((attribute, index) => (
            <div key={index} className="mt-3 grid gap-2 md:grid-cols-4">
              <Field
                label="کلید"
                value={attribute.key}
                onChange={(key) =>
                  setAttributes(update(attributes, index, { key }))
                }
              />
              <LocalizedControlled
                value={attribute.valueI18n}
                onChange={(valueI18n) =>
                  setAttributes(update(attributes, index, { valueI18n }))
                }
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() =>
                  setAttributes(attributes.filter((_, i) => i !== index))
                }
              >
                حذف
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={() =>
              setAttributes([
                ...attributes,
                { key: "", valueI18n: emptyLocalized() },
              ])
            }
          >
            افزودن ویژگی
          </Button>
        </Card>
      </section>

      <section hidden={tab !== "SEO"}>
        <Card className="grid gap-4">
          <LocalizedFields
            prefix="slug"
            label="Slug هر زبان"
            value={initial.slugI18n}
          />
          <LocalizedFields
            prefix="seoTitle"
            label="عنوان SEO"
            value={initial.seoTitleI18n}
          />
          <LocalizedAreas
            prefix="seoDescription"
            label="توضیح SEO"
            value={initial.seoDescriptionI18n}
          />
          <MediaPicker
            name="seoOgMediaId"
            label="تصویر اشتراک‌گذاری (OG)"
            defaultMediaId={initial.seoOgMediaId || undefined}
            defaultUrl={
              initial.seoOgMediaId ? mediaUrls[initial.seoOgMediaId] : undefined
            }
          />
        </Card>
      </section>
      <section hidden={tab !== "بازارها"}>
        <Card>
          <fieldset>
            <legend>بازارهای قابل نمایش</legend>
            <div className="mt-3 flex gap-4">
              {markets.map((item) => (
                <Check
                  key={item.id}
                  name="marketIds"
                  value={item.id}
                  label={item.label}
                  checked={initial.marketIds.includes(item.id)}
                />
              ))}
            </div>
          </fieldset>
        </Card>
      </section>
      <section hidden={tab !== "انتشار"}>
        <Card className="grid gap-3">
          <label>
            وضعیت
            <Select name="status" defaultValue={initial.status}>
              <option value="DRAFT">پیش‌نویس</option>
              <option value="ACTIVE">فعال</option>
              <option value="ARCHIVED">بایگانی</option>
            </Select>
          </label>
          {initial.id && (
            <a
              className="button w-fit"
              href={`/fa/p/${initial.slugI18n.fa}?preview=1`}
              target="_blank"
              rel="noreferrer"
            >
              پیش‌نمایش محصول
            </a>
          )}
        </Card>
      </section>
    </CatalogActionForm>
  );
}

function LocalizedFields({
  prefix,
  label,
  value,
}: {
  prefix: string;
  label: string;
  value: Localized;
}) {
  return (
    <fieldset className="grid gap-3 rounded-[10px] border border-black/10 p-3 md:grid-cols-3">
      <legend>{label}</legend>
      {(["fa", "tr", "en"] as const).map((locale) => (
        <Field
          key={locale}
          name={`${prefix}${cap(locale)}`}
          label={locale.toUpperCase()}
          defaultValue={value[locale]}
        />
      ))}
    </fieldset>
  );
}
function LocalizedAreas({
  prefix,
  label,
  value,
}: {
  prefix: string;
  label: string;
  value: Localized;
}) {
  return (
    <fieldset className="grid gap-3 rounded-[10px] border border-black/10 p-3 md:grid-cols-3">
      <legend>{label}</legend>
      {(["fa", "tr", "en"] as const).map((locale) => (
        <label key={locale}>
          {locale.toUpperCase()}
          <textarea
            name={`${prefix}${cap(locale)}`}
            defaultValue={value[locale]}
            required
            className="mt-1 min-h-28 w-full rounded-[10px] border border-black/15 p-3"
          />
        </label>
      ))}
    </fieldset>
  );
}
function LocalizedControlled({
  value,
  onChange,
}: {
  value: Localized;
  onChange: (value: Localized) => void;
}) {
  return (
    <div className="grid gap-2 md:col-span-2 md:grid-cols-3">
      {(["fa", "tr", "en"] as const).map((locale) => (
        <Field
          key={locale}
          label={locale.toUpperCase()}
          value={value[locale]}
          onChange={(next) => onChange({ ...value, [locale]: next })}
        />
      ))}
    </div>
  );
}
function Field({
  name,
  label,
  type = "text",
  defaultValue,
  value,
  onChange,
}: {
  name?: string;
  label: string;
  type?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <Input
        name={name}
        type={type}
        defaultValue={onChange ? undefined : defaultValue}
        value={onChange ? value : undefined}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        required={name === "categoryId"}
      />
    </label>
  );
}
function Check({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name?: string;
  value: string;
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={onChange ? undefined : checked}
        checked={onChange ? checked : undefined}
        onChange={
          onChange ? (event) => onChange(event.target.checked) : undefined
        }
      />
      {label}
    </label>
  );
}
function toggle(items: string[], value: string, checked: boolean) {
  return checked
    ? [...new Set([...items, value])]
    : items.filter((item) => item !== value);
}
function update<T>(items: T[], index: number, patch: Partial<T>) {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
function move(items: string[], index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
function cap(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}
function emptyLocalized(): Localized {
  return { fa: "", tr: "", en: "" };
}
