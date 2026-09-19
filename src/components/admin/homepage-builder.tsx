"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { HomepageBlock } from "@/modules/content/homepage";
import { MediaPicker } from "@/components/admin/media-picker";
import { Button, Card, Input } from "@/components/ui";

type SourceOption = {
  id: string;
  title: string;
  titleI18n?: Partial<Record<Locale, string>>;
  root?: boolean;
  mediaUrl?: string;
};
type Locale = "fa" | "tr" | "en";
type Labels = Record<
  | "title"
  | "description"
  | "global"
  | "market"
  | "add"
  | "save"
  | "preview"
  | "mobile"
  | "desktop"
  | "moveUp"
  | "moveDown"
  | "remove"
  | "empty"
  | "latest"
  | "bestseller"
  | "category"
  | "collection"
  | "limit"
  | "chooseSource"
  | "missingSource"
  | "rootCategories"
  | "catalogPreview"
  | "scopeHelp"
  | "heroHelp"
  | "trustItem"
  | "addTrustItem"
  | "selectImage"
  | "fieldTitle"
  | "body"
  | "ctaLabel"
  | "ctaUrl"
  | "source"
  | "heroLayout"
  | "editorialLayout"
  | "spatialLayout",
  string
>;
const locales: Locale[] = ["fa", "tr", "en"];
const text = () => ({ fa: "", tr: "", en: "" });

function fresh(type: HomepageBlock["type"]): HomepageBlock {
  if (type === "Hero" || type === "Banner")
    return { type, title: text(), body: text(), ctaLabel: text() };
  if (type === "CategoryCards" || type === "ProductStrip")
    return {
      type,
      title: text(),
      source: {
        mode: type === "CategoryCards" ? "category" : "latest",
        limit: 4,
      },
    };
  if (type === "TrustBar") return { type, items: [text()] };
  return { type: "RichText", text: text() };
}

export function HomepageBuilder({
  action,
  categories,
  collections,
  compositions,
  mediaUrls,
  markets,
  labels,
}: {
  action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>;
  categories: SourceOption[];
  collections: SourceOption[];
  compositions: Record<string, HomepageBlock[]>;
  mediaUrls: Record<string, string>;
  markets: { id: string; code: string }[];
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [scope, setScope] = useState("global");
  const [blocks, setBlocks] = useState<HomepageBlock[]>(
    compositions.global ?? [],
  );
  const [locale, setLocale] = useState<Locale>("fa");
  const [width, setWidth] = useState<390 | 1280>(390);
  const [newType, setNewType] = useState<HomepageBlock["type"]>("Hero");
  const [urls, setUrls] = useState(mediaUrls);
  const preview = useMemo(
    () => previewHtml(blocks, locale, urls, labels, categories),
    [blocks, locale, urls, labels, categories],
  );
  function setScopeValue(value: string) {
    setScope(value);
    setBlocks(
      structuredClone(compositions[value] ?? compositions.global ?? []),
    );
  }
  function update(index: number, block: HomepageBlock) {
    setBlocks((all) => all.map((item, i) => (i === index ? block : item)));
  }
  function move(index: number, delta: number) {
    setBlocks((all) => {
      const next = [...all];
      const target = index + delta;
      if (target < 0 || target >= next.length) return all;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="mt-2 text-muted">{labels.description}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(390px,1fr)]">
        <form
          action={formAction}
          className="grid gap-4"
          data-testid="homepage-form"
        >
          <Card className="grid gap-3">
            <label>
              {labels.market}
              <select
                className="input"
                value={scope}
                onChange={(event) => setScopeValue(event.target.value)}
              >
                <option value="global">{labels.global}</option>
                {markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.code}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted">{labels.scopeHelp}</p>
            <input
              type="hidden"
              name="marketId"
              value={scope === "global" ? "" : scope}
            />
            <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
          </Card>
          {blocks.length === 0 && (
            <Card>
              <p className="text-muted">{labels.empty}</p>
            </Card>
          )}
          {blocks.map((block, index) => (
            <Card
              key={`${block.type}-${index}`}
              className="grid gap-3"
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData("text/plain", String(index))
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData("text/plain"));
                if (Number.isInteger(from) && from !== index)
                  setBlocks((all) => {
                    const next = [...all];
                    const [item] = next.splice(from, 1);
                    next.splice(index, 0, item);
                    return next;
                  });
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {index + 1}. {block.type}
                </strong>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={`${labels.moveUp} ${index + 1}`}
                    onClick={() => move(index, -1)}
                  >
                    {labels.moveUp}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={`${labels.moveDown} ${index + 1}`}
                    onClick={() => move(index, 1)}
                  >
                    {labels.moveDown}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      setBlocks((all) => all.filter((_, i) => i !== index))
                    }
                  >
                    {labels.remove}
                  </Button>
                </div>
              </div>
              <BlockFields
                categories={categories}
                collections={collections}
                block={block}
                index={index}
                labels={labels}
                urls={urls}
                update={update}
                setUrls={setUrls}
              />
            </Card>
          ))}
          <Card className="flex flex-wrap items-end gap-2">
            <label className="flex-1">
              {labels.add}
              <select
                className="input"
                value={newType}
                onChange={(event) =>
                  setNewType(event.target.value as HomepageBlock["type"])
                }
              >
                {[
                  "Hero",
                  "CategoryCards",
                  "ProductStrip",
                  "Banner",
                  "TrustBar",
                  "RichText",
                ].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              onClick={() => setBlocks((all) => [...all, fresh(newType)])}
            >
              {labels.add}
            </Button>
          </Card>
          {state && !state.ok && (
            <p role="alert" className="text-error">
              {state.message}
            </p>
          )}
          {state?.ok && (
            <p role="status" className="text-success">
              {labels.save}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {labels.save}
          </Button>
        </form>
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong>{labels.preview}</strong>
            {locales.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={locale === item ? "primary" : "secondary"}
                onClick={() => setLocale(item)}
              >
                {item}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setWidth(390)}
            >
              {labels.mobile}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setWidth(1280)}
            >
              {labels.desktop}
            </Button>
          </div>
          <div className="overflow-auto rounded-token bg-muted/20 p-2">
            <iframe
              data-testid="homepage-unsaved-preview"
              title={labels.preview}
              sandbox=""
              srcDoc={preview}
              style={{
                width,
                maxWidth: "100%",
                height: 720,
                border: 0,
                background: "white",
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function BlockFields({
  categories,
  collections,
  block,
  index,
  labels,
  urls,
  update,
  setUrls,
}: {
  categories: SourceOption[];
  collections: SourceOption[];
  block: HomepageBlock;
  index: number;
  labels: Labels;
  urls: Record<string, string>;
  update: (i: number, b: HomepageBlock) => void;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const localized = (key: "title" | "body" | "ctaLabel" | "text") =>
    locales.map((locale) => (
      <label key={`${key}-${locale}`}>
        {
          labels[
            key === "title"
              ? "fieldTitle"
              : key === "ctaLabel"
                ? "ctaLabel"
                : "body"
          ]
        }{" "}
        ({locale})
        <textarea
          className="input"
          rows={key === "title" ? 3 : 2}
          value={
            (block as unknown as Record<string, Record<Locale, string>>)[key]?.[
              locale
            ] ?? ""
          }
          onChange={(event) =>
            update(index, {
              ...block,
              [key]: {
                ...(block as unknown as Record<string, Record<Locale, string>>)[
                  key
                ],
                [locale]: event.target.value,
              },
            } as HomepageBlock)
          }
        />
      </label>
    ));
  if (block.type === "Hero" || block.type === "Banner")
    return (
      <>
        {block.type === "Hero" && (
          <label>
            {labels.heroLayout}
            <select
              className="input"
              value={block.layout ?? "editorial"}
              onChange={(e) =>
                update(index, {
                  ...block,
                  layout: e.target.value as "editorial" | "spatial",
                })
              }
            >
              <option value="editorial">{labels.editorialLayout}</option>
              <option value="spatial">{labels.spatialLayout}</option>
            </select>
          </label>
        )}
        {localized("title")}
        {localized("body")}
        {localized("ctaLabel")}
        <label>
          {labels.ctaUrl}
          <Input
            dir="ltr"
            value={block.ctaUrl ?? ""}
            onChange={(event) =>
              update(index, {
                ...block,
                ctaUrl: event.target.value || undefined,
              })
            }
          />
        </label>
        <p className="text-sm text-muted">{labels.heroHelp}</p>
        <MediaPicker
          name={`unused-${index}`}
          label={labels.selectImage}
          defaultMediaId={block.mediaId}
          defaultUrl={block.mediaId ? urls[block.mediaId] : undefined}
          onSelect={(id, url) => {
            setUrls((all) => ({ ...all, [id]: url }));
            update(index, { ...block, mediaId: id });
          }}
        />
      </>
    );
  if (block.type === "CategoryCards" || block.type === "ProductStrip") {
    const options = block.source.mode === "category" ? categories : collections;
    const needsReference =
      block.type === "ProductStrip" &&
      (block.source.mode === "category" || block.source.mode === "collection");
    return (
      <>
        {localized("title")}
        {block.type === "ProductStrip" ? (
          <label>
            {labels.source}
            <select
              className="input"
              value={block.source.mode}
              onChange={(event) =>
                update(index, {
                  ...block,
                  source: {
                    ...block.source,
                    mode: event.target.value as typeof block.source.mode,
                    referenceId: undefined,
                  },
                })
              }
            >
              {(
                ["latest", "bestseller", "category", "collection"] as const
              ).map((mode) => (
                <option key={mode} value={mode}>
                  {labels[mode]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted">{labels.rootCategories}</p>
        )}
        {needsReference && (
          <label>
            {labels.chooseSource}
            <select
              className="input"
              required
              value={block.source.referenceId ?? ""}
              onChange={(event) =>
                update(index, {
                  ...block,
                  source: { ...block.source, referenceId: event.target.value },
                })
              }
            >
              <option value="">{labels.chooseSource}</option>
              {block.source.referenceId &&
                !options.some(
                  (item) => item.id === block.source.referenceId,
                ) && (
                  <option value={block.source.referenceId} disabled>
                    {labels.missingSource}
                  </option>
                )}
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {labels.limit}
          <Input
            type="number"
            min={1}
            max={12}
            step={1}
            value={block.source.limit}
            required
            onChange={(event) =>
              update(index, {
                ...block,
                source: { ...block.source, limit: Number(event.target.value) },
              })
            }
          />
        </label>
        <p className="text-sm text-muted">{labels.catalogPreview}</p>
      </>
    );
  }
  if (block.type === "TrustBar")
    return (
      <>
        {block.items.map((item, itemIndex) => (
          <fieldset
            key={itemIndex}
            className="grid gap-3 rounded-token border border-black/10 p-3"
            data-testid={`trust-item-${itemIndex}`}
          >
            <legend>
              {labels.trustItem} {itemIndex + 1}
            </legend>
            {locales.map((locale) => (
              <label key={locale}>
                {labels.body} ({locale})
                <Input
                  value={item[locale] ?? ""}
                  onChange={(event) =>
                    update(index, {
                      ...block,
                      items: block.items.map((value, i) =>
                        i === itemIndex
                          ? { ...value, [locale]: event.target.value }
                          : value,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={block.items.length === 1}
              onClick={() =>
                update(index, {
                  ...block,
                  items: block.items.filter((_, i) => i !== itemIndex),
                })
              }
            >
              {labels.remove} {labels.trustItem} {itemIndex + 1}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={block.items.length >= 6}
          onClick={() =>
            update(index, { ...block, items: [...block.items, text()] })
          }
        >
          {labels.addTrustItem}
        </Button>
      </>
    );
  return <>{localized("text")}</>;
}

function previewHtml(
  blocks: HomepageBlock[],
  locale: Locale,
  urls: Record<string, string>,
  labels: Labels,
  categories: SourceOption[],
) {
  const esc = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  const local = (value: Partial<Record<Locale, string>>) =>
    esc(value[locale] || value.fa || value.en || "");
  const body = blocks
    .map((block) => {
      if (block.type === "Hero" && block.layout === "spatial")
        return `<section class="spatial"><div><h2>${local(block.title)
          .split(/\r?\n/)
          .map((line, i) =>
            i === 1 ? `<em>${line}</em>` : `<span>${line}</span>`,
          )
          .join(
            "",
          )}</h2><p>${local(block.body)}</p><span>${local(block.ctaLabel)}</span></div><div class="planes">${categories
          .filter((c) => c.root)
          .slice(0, 4)
          .map(
            (c, i) =>
              `<article>${(i === 0 && block.mediaId && urls[block.mediaId]) || c.mediaUrl ? `<img src="${esc((i === 0 && block.mediaId && urls[block.mediaId]) || c.mediaUrl || "")}" alt="">` : ""}<b>${c.titleI18n ? local(c.titleI18n) : esc(c.title)}</b></article>`,
          )
          .join("")}</div></section>`;
      if (block.type === "Hero" || block.type === "Banner")
        return `<section class="hero">${block.mediaId && urls[block.mediaId] ? `<img src="${esc(urls[block.mediaId])}" alt="">` : ""}<div><h2>${local(block.title)}</h2><p>${local(block.body)}</p><span>${local(block.ctaLabel)}</span></div></section>`;
      if (block.type === "CategoryCards" || block.type === "ProductStrip")
        return `<section><h2>${local(block.title)}</h2><div class="placeholder">${esc(labels.catalogPreview)}</div></section>`;
      if (block.type === "TrustBar")
        return `<section class="trust">${block.items.map((item) => `<span>${local(item)}</span>`).join("")}</section>`;
      return `<section><p>${local(block.text)}</p></section>`;
    })
    .join("");
  return `<!doctype html><html dir="${locale === "fa" ? "rtl" : "ltr"}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data: blob:; style-src 'unsafe-inline'"><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui;color:#181714;background:#fffdf8}section{padding:32px 20px}.hero{position:relative;isolation:isolate;min-height:320px;overflow:hidden;color:white;display:flex;flex-direction:column;justify-content:end}.hero:after{position:absolute;inset:0;z-index:-1;background:#0007;content:""}.hero img{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}.hero h2{font-size:clamp(32px,8vw,72px);margin:0}.placeholder{min-height:140px;border:1px dashed #aaa;display:grid;place-items:center;color:#777}.trust{display:flex;gap:24px;flex-wrap:wrap;background:#f4eee5}span{min-height:44px;display:inline-flex;align-items:center}.spatial{position:relative;min-height:720px;background:#191712;color:#fbf8f3;overflow:hidden}.spatial>div:first-child{position:relative;z-index:4;padding-top:430px;pointer-events:none}.spatial h2{font-size:42px;line-height:1.05;margin:0}.spatial h2 span,.spatial h2 em{display:block}.spatial h2 em{color:#e8792a;font-weight:400}.planes{position:absolute;inset:0}.planes article{position:absolute;background:#fbf8f3;color:#191712;box-shadow:0 15px 30px #0005}.planes img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0%}.planes b{position:absolute;bottom:-8px;inset-inline-start:-4px;padding:10px;background:#fbf8f3;font-size:11px}.planes article:nth-child(1){top:36px;inset-inline-start:27%;width:64%;height:380px}.planes article:nth-child(2){top:26px;inset-inline-end:3%;width:25%;height:150px;rotate:4deg}.planes article:nth-child(3){top:200px;inset-inline-start:5%;width:26%;height:155px;rotate:-5deg}.planes article:nth-child(4){top:335px;inset-inline-end:5%;width:25%;height:128px;rotate:5deg}@media(min-width:900px){.spatial{height:720px}.spatial>div:first-child{position:absolute;bottom:10%;padding:0;width:65%}.spatial h2{font-size:72px}.planes article:nth-child(1){top:6%;inset-inline-start:41%;width:43%;height:87%}.planes article:nth-child(2){top:5%;width:16%;height:34%}.planes article:nth-child(3){top:51%;inset-inline-start:83%;width:14%;height:29%}.planes article:nth-child(4){top:auto;bottom:3%;inset-inline-end:20%;width:15%;height:27%}} </style><body>${body}</body></html>`;
}
