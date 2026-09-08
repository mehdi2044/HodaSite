"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { HomepageBlock } from "@/modules/content/homepage";
import { MediaPicker } from "@/components/admin/media-picker";
import { Button, Card, Input } from "@/components/ui";

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
  | "phase2"
  | "selectImage"
  | "fieldTitle"
  | "body"
  | "ctaLabel"
  | "ctaUrl"
  | "source",
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
  compositions,
  mediaUrls,
  markets,
  labels,
}: {
  action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>;
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
    () => previewHtml(blocks, locale, urls),
    [blocks, locale, urls],
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
  block,
  index,
  labels,
  urls,
  update,
  setUrls,
}: {
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
        <Input
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
  if (block.type === "CategoryCards" || block.type === "ProductStrip")
    return (
      <>
        {localized("title")}
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
                },
              })
            }
          >
            <option value="latest">latest</option>
            <option value="bestseller">bestseller</option>
            <option value="category">category</option>
            <option value="collection">collection</option>
          </select>
        </label>
        <p className="rounded-token bg-muted/10 p-3 text-sm text-muted">
          {labels.phase2}
        </p>
      </>
    );
  if (block.type === "TrustBar")
    return (
      <>
        {locales.map((locale) => (
          <label key={locale}>
            {labels.body} ({locale})
            <Input
              value={block.items[0]?.[locale] ?? ""}
              onChange={(event) =>
                update(index, {
                  ...block,
                  items: [{ ...block.items[0], [locale]: event.target.value }],
                })
              }
            />
          </label>
        ))}
      </>
    );
  return <>{localized("text")}</>;
}

function previewHtml(
  blocks: HomepageBlock[],
  locale: Locale,
  urls: Record<string, string>,
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
      if (block.type === "Hero" || block.type === "Banner")
        return `<section class="hero">${block.mediaId && urls[block.mediaId] ? `<img src="${esc(urls[block.mediaId])}" alt="">` : ""}<div><h2>${local(block.title)}</h2><p>${local(block.body)}</p><span>${local(block.ctaLabel)}</span></div></section>`;
      if (block.type === "CategoryCards" || block.type === "ProductStrip")
        return `<section><h2>${local(block.title)}</h2><div class="placeholder">Phase 02 · ${esc(block.source.mode)}</div></section>`;
      if (block.type === "TrustBar")
        return `<section class="trust">${block.items.map((item) => `<span>${local(item)}</span>`).join("")}</section>`;
      return `<section><p>${local(block.text)}</p></section>`;
    })
    .join("");
  return `<!doctype html><html dir="${locale === "fa" ? "rtl" : "ltr"}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data: blob:; style-src 'unsafe-inline'"><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui;color:#181714;background:#fffdf8}section{padding:32px 20px}.hero{position:relative;isolation:isolate;min-height:320px;overflow:hidden;color:white;display:flex;flex-direction:column;justify-content:end}.hero:after{position:absolute;inset:0;z-index:-1;background:#0007;content:""}.hero img{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}.hero h2{font-size:clamp(32px,8vw,72px);margin:0}.placeholder{min-height:140px;border:1px dashed #aaa;display:grid;place-items:center;color:#777}.trust{display:flex;gap:24px;flex-wrap:wrap;background:#f4eee5}span{min-height:44px;display:inline-flex;align-items:center}</style><body>${body}</body></html>`;
}
