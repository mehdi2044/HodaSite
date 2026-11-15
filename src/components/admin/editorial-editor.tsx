"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/action-result";
import {
  audiences,
  articleCategories,
  colors,
  locales,
  occasions,
  seasons,
  styles,
  type ArticleContent,
  type EditorialContent,
  type LookContent,
} from "@/modules/editorial/contracts";

type VariantOption = {
  productId: string;
  variantId: string;
  colorId: string;
  label: string;
};
export function EditorialEditor({
  initial,
  identity,
  images,
  variants,
  looks,
  products,
  markets,
  action,
}: {
  initial: EditorialContent;
  identity?: {
    id: string;
    version: number;
    slugFa: string;
    slugTr: string;
    slugEn: string;
  };
  images: { id: string; label: string }[];
  variants: VariantOption[];
  looks: { id: string; label: string }[];
  products: { id: string; label: string }[];
  markets: { id: string; label: string }[];
  action: (state: ActionResult | null, data: FormData) => Promise<ActionResult>;
}) {
  const t = useTranslations("editorial");
  const [body, update] = useState(initial);
  const [state, submit, pending] = useActionState(action, null);
  const copy = (
    value: { fa: string; en: string; tr: string },
    label: string,
    onChange: (value: typeof body.title) => void,
    multiline = false,
  ) => (
    <fieldset className="grid gap-2">
      <legend>{label}</legend>
      {locales.map((locale) => (
        <label key={locale} className="grid">
          {t(`locale.${locale}`)}
          {multiline ? (
            <textarea
              className="input"
              dir={locale === "fa" ? "rtl" : "ltr"}
              value={value[locale]}
              onChange={(event) =>
                onChange({ ...value, [locale]: event.target.value })
              }
            />
          ) : (
            <input
              className="input"
              dir={locale === "fa" ? "rtl" : "ltr"}
              value={value[locale]}
              onChange={(event) =>
                onChange({ ...value, [locale]: event.target.value })
              }
            />
          )}
        </label>
      ))}
    </fieldset>
  );
  function image(
    value: string | undefined,
    updateValue: (id: string) => void,
    label: string,
  ) {
    return (
      <label className="grid">
        {label}
        <select
          className="input"
          value={value ?? ""}
          onChange={(event) => updateValue(event.target.value)}
        >
          <option value="">{t("choose")}</option>
          {images.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function options<T extends string>(
    label: string,
    values: readonly T[],
    value: T,
    setter: (value: T) => void,
  ) {
    return (
      <label className="grid">
        {label}
        <select
          className="input"
          value={value}
          onChange={(event) => {
            const selected = values.find(
              (option) => option === event.target.value,
            );
            if (selected) setter(selected);
          }}
        >
          {values.map((value) => (
            <option key={value} value={value}>
              {t(String(`facet.${value}`))}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function coordinates(
    point: { x: number; y: number } | undefined,
    label: string,
    setter: (value: typeof point) => void,
  ) {
    return (
      <fieldset className="flex flex-wrap gap-2">
        <legend>{label}</legend>
        {(["x", "y"] as const).map((axis) => (
          <label key={axis}>
            {axis.toUpperCase()}{" "}
            <input
              className="input"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={point?.[axis] ?? ""}
              onChange={(event) =>
                setter(
                  event.target.value === ""
                    ? undefined
                    : {
                        x: point?.x ?? 0.5,
                        y: point?.y ?? 0.5,
                        [axis]: Number(event.target.value),
                      },
                )
              }
            />
          </label>
        ))}
      </fieldset>
    );
  }
  function items(look: LookContent) {
    const updateItems = (items: LookContent["items"]) =>
      update({
        ...look,
        items,
        visual:
          look.visual?.mode === "PHOTO" &&
          (items.length !== look.items.length ||
            items.some(
              (item) =>
                !look.items.some(
                  ({ variantId }) => variantId === item.variantId,
                ),
            ))
            ? undefined
            : look.visual,
      });
    return (
      <fieldset className="grid gap-3">
        <legend>{t("pieces")}</legend>
        {look.items.map((item, index) => {
          const change = (item: LookContent["items"][number]) =>
            updateItems(look.items.map((row, i) => (index === i ? item : row)));
          const move = (offset: number) => {
            const next = [...look.items];
            [next[index], next[index + offset]] = [
              next[index + offset],
              next[index],
            ];
            updateItems(next);
          };
          return (
            <div className="rounded-token border p-3 grid gap-2" key={index}>
              <label className="grid">
                {t("sku")}
                <select
                  className="input"
                  value={item.variantId}
                  onChange={(event) => {
                    const selected = variants.find(
                      (variant) => variant.variantId === event.target.value,
                    );
                    if (selected)
                      change({
                        ...item,
                        productId: selected.productId,
                        variantId: selected.variantId,
                      });
                  }}
                >
                  <option value="">{t("choose")}</option>
                  {variants.map((v) => (
                    <option value={v.variantId} key={v.variantId}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              {coordinates(item.desktop, t("desktopHotspot"), (desktop) =>
                change({ ...item, desktop }),
              )}
              {coordinates(item.mobile, t("mobileHotspot"), (mobile) =>
                change({ ...item, mobile }),
              )}
              <div className="flex gap-2">
                <button
                  className="button"
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  {t("up")}
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={index === look.items.length - 1}
                  onClick={() => move(1)}
                >
                  {t("down")}
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() =>
                    updateItems(look.items.filter((_, i) => i !== index))
                  }
                >
                  {t("remove")}
                </button>
              </div>
            </div>
          );
        })}
        <button
          className="button"
          type="button"
          disabled={look.items.length >= 12}
          onClick={() =>
            updateItems([...look.items, { productId: "", variantId: "" }])
          }
        >
          {t("newPiece")}
        </button>
      </fieldset>
    );
  }
  function blocks(article: ArticleContent) {
    const blank = { fa: "", tr: "", en: "" };
    const changeBlocks = (blocks: ArticleContent["blocks"]) =>
      update({ ...article, blocks });
    const blockTypes = [
      "HEADING",
      "PARAGRAPH",
      "QUOTE",
      "IMAGE",
      "LOOK",
      "PRODUCT",
    ] as const;
    return (
      <fieldset className="grid gap-3">
        <legend>{t("blocks")}</legend>
        {article.blocks.map((block, index) => {
          const change = (value: ArticleContent["blocks"][number]) =>
            changeBlocks(
              article.blocks.map((item, i) => (i === index ? value : item)),
            );
          return (
            <div className="rounded-token border p-3 grid gap-2" key={index}>
              {options(t("blockType"), blockTypes, block.type, (type) =>
                change(
                  type === "IMAGE"
                    ? { type, caption: blank, mediaId: "" }
                    : type === "LOOK" || type === "PRODUCT"
                      ? { type, id: "" }
                      : { type, text: blank },
                ),
              )}
              {"text" in block &&
                copy(
                  block.text,
                  t("text"),
                  (text) => change({ ...block, text }),
                  true,
                )}
              {block.type === "IMAGE" && (
                <>
                  {image(
                    block.mediaId,
                    (mediaId) => change({ ...block, mediaId }),
                    t("image"),
                  )}
                  {copy(block.caption, t("caption"), (caption) =>
                    change({ ...block, caption }),
                  )}
                </>
              )}
              {"id" in block && (
                <label className="grid">
                  {t("choose")}
                  <select
                    className="input"
                    value={block.id}
                    onChange={(event) =>
                      change({ ...block, id: event.target.value })
                    }
                  >
                    <option value="">{t("choose")}</option>
                    {(block.type === "LOOK" ? looks : products).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="button"
                type="button"
                onClick={() =>
                  changeBlocks(article.blocks.filter((_, i) => i !== index))
                }
              >
                {t("remove")}
              </button>
            </div>
          );
        })}
        <button
          className="button"
          type="button"
          onClick={() =>
            changeBlocks([
              ...article.blocks,
              { type: "PARAGRAPH", text: blank },
            ])
          }
        >
          {t("newBlock")}
        </button>
      </fieldset>
    );
  }
  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="id" value={identity?.id ?? ""} />
      <input type="hidden" name="version" value={identity?.version ?? 0} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      {!identity && (
        <fieldset className="grid gap-2">
          <legend>{t("slugs")}</legend>
          {locales.map((locale) => (
            <label className="grid" key={locale}>
              {t(`locale.${locale}`)}
              <input className="input" name={`slug-${locale}`} required />
            </label>
          ))}
        </fieldset>
      )}
      {copy(body.title, t("title"), (title) => update({ ...body, title }))}
      {copy(
        body.summary,
        t("summary"),
        (summary) => update({ ...body, summary }),
        true,
      )}
      {image(
        body.mediaId,
        (mediaId) =>
          update(
            body.kind === "LOOK" && body.visual?.mode === "PHOTO"
              ? { ...body, mediaId, visual: undefined }
              : { ...body, mediaId },
          ),
        t("image"),
      )}
      {image(
        body.mobileMediaId,
        (value) => {
          const mobileMediaId = value || undefined;
          update(
            body.kind === "LOOK" && body.visual?.mode === "PHOTO"
              ? { ...body, mobileMediaId, visual: undefined }
              : { ...body, mobileMediaId },
          );
        },
        t("mobileImage"),
      )}
      {coordinates(body.focal, t("focal"), (focal) =>
        update({ ...body, focal }),
      )}
      {options(t("audience"), audiences, body.audience, (audience) =>
        update({ ...body, audience }),
      )}
      <fieldset className="flex flex-wrap gap-3">
        <legend>{t("markets")}</legend>
        {markets.map(({ id, label }) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={body.marketIds.includes(id)}
              onChange={(event) =>
                update({
                  ...body,
                  marketIds: event.target.checked
                    ? [...body.marketIds, id]
                    : body.marketIds.filter((m) => m !== id),
                })
              }
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={body.featured}
          onChange={(event) =>
            update({ ...body, featured: event.target.checked })
          }
        />{" "}
        {t("featured")}
      </label>
      <label className="grid">
        {t("tags")}
        <input
          className="input"
          defaultValue={body.tags.join(", ")}
          onChange={(event) =>
            update({
              ...body,
              tags: event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      {body.kind === "LOOK" ? (
        <>
          {options(t("season"), seasons, body.season, (season) =>
            update({ ...body, season }),
          )}
          {options(t("occasion"), occasions, body.occasion, (occasion) =>
            update({ ...body, occasion }),
          )}
          {options(t("style"), styles, body.style, (style) =>
            update({ ...body, style }),
          )}
          {options(t("color"), colors, body.color, (color) =>
            update({ ...body, color }),
          )}
          {items(body)}
          <fieldset className="grid gap-2">
            <legend>{t("visualMode")}</legend>
            <label>
              <input
                type="radio"
                name="visual-mode"
                checked={body.visual?.mode === "COMPOSITE"}
                onChange={() =>
                  update({ ...body, visual: { mode: "COMPOSITE" } })
                }
              />{" "}
              {t("composition")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={body.visual?.mode === "PHOTO"}
                disabled={
                  !body.mediaId ||
                  body.items.length < 2 ||
                  body.items.some(
                    ({ variantId }) =>
                      !variants.some(
                        (variant) => variant.variantId === variantId,
                      ),
                  )
                }
                onChange={(event) =>
                  update({
                    ...body,
                    visual: event.target.checked
                      ? {
                          mode: "PHOTO",
                          mediaId: body.mediaId,
                          mobileMediaId: body.mobileMediaId,
                          pieces: body.items.flatMap(({ variantId }) => {
                            const variant = variants.find(
                              (option) => option.variantId === variantId,
                            );
                            return variant
                              ? [{ variantId, colorId: variant.colorId }]
                              : [];
                          }),
                        }
                      : undefined,
                  })
                }
              />{" "}
              {t("photoMatch")}
            </label>
          </fieldset>
        </>
      ) : (
        <>
          {options(
            t("category"),
            articleCategories,
            body.category,
            (category) => update({ ...body, category }),
          )}
          <label className="grid">
            {t("author")}
            <input
              className="input"
              value={body.author}
              onChange={(event) =>
                update({ ...body, author: event.target.value })
              }
            />
          </label>
          {copy(
            body.seoTitle ?? { fa: "", tr: "", en: "" },
            t("seoTitle"),
            (seoTitle) =>
              update({
                ...body,
                seoTitle: Object.values(seoTitle).some(Boolean)
                  ? seoTitle
                  : undefined,
              }),
          )}
          {copy(
            body.seoDescription ?? { fa: "", tr: "", en: "" },
            t("seoDescription"),
            (seoDescription) =>
              update({
                ...body,
                seoDescription: Object.values(seoDescription).some(Boolean)
                  ? seoDescription
                  : undefined,
              }),
            true,
          )}
          {image(
            body.ogMediaId,
            (value) => update({ ...body, ogMediaId: value || undefined }),
            t("ogImage"),
          )}
          {blocks(body)}
        </>
      )}
      <button className="button" disabled={pending}>
        {t("saveDraft")}
      </button>
      {state && !state.ok && <p role="alert">{state.message}</p>}
    </form>
  );
}

export function EditorialPublication({
  id,
  version,
  revisionId,
  action,
}: {
  id: string;
  version: number;
  revisionId: string;
  action: (state: ActionResult | null, data: FormData) => Promise<ActionResult>;
}) {
  const t = useTranslations("editorial");
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <label className="grid">
        {t("publishDate")}
        <input className="input" name="date" type="datetime-local" />
      </label>
      <button className="button" disabled={pending}>
        {t("publish")}
      </button>
      {state && (
        <p role={state.ok ? "status" : "alert"}>
          {state.ok ? t("saved") : state.message}
        </p>
      )}
    </form>
  );
}
