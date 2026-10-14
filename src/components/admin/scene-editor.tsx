"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SettingsForm } from "./settings-form";
import { MediaPicker } from "./media-picker";
import type { ActionResult } from "@/lib/action-result";
import type { HomepageBlock } from "@/modules/content/homepage";
import type { ShoppableScene } from "@/modules/content/scenes/contracts";
import {
  SCENE_ASPECTS,
  scenePointInFrame,
} from "@/modules/content/scenes/geometry";

type Action = (
  previous: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;
type Image = { id: string; url: string; originalName: string };
type Product = {
  id: string;
  title: string;
  colors: {
    id: string;
    title: string;
    images: Image[];
    variants: { id: string; size: string }[];
  }[];
};
type Props = {
  initialBlocks: HomepageBlock[];
  version: number;
  homepageId: string | null;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  schedule: { at: string; error: string | null } | null;
  scope: string;
  globalAllowed: boolean;
  markets: { id: string; code: string; enabledLocales: string[] }[];
  products: Product[];
  imageUrls: Record<string, string>;
  history: { id: string; at: string; version: number }[];
  hasMoreHistory: boolean;
  seed: string;
  writable: boolean;
  action: Action;
  publish: Action;
  scheduleAction: Action;
};
const languages = ["fa", "tr", "en"] as const;
const languageNames = { fa: "فارسی", tr: "Türkçe", en: "English" };
const blank = () => ({ fa: "", tr: "", en: "" });
const sceneIn = (block?: HomepageBlock) =>
  block && "scene" in block ? block.scene : undefined;
function initialScene(
  block: HomepageBlock | undefined,
  seed: string,
  index: number,
): ShoppableScene {
  return (
    sceneIn(block) ?? {
      version: 1,
      id: `${seed}-${index}`,
      mode: "PHOTO",
      title: block && "title" in block ? block.title : blank(),
      alt: block && "title" in block ? block.title : blank(),
      desktop: {
        mediaId: block && "mediaId" in block ? (block.mediaId ?? "") : "",
        aspect: "3:2",
        fit: "contain",
        focal: { x: 0.5, y: 0.5 },
      },
      mobile: {
        mediaId: block && "mediaId" in block ? (block.mediaId ?? "") : "",
        aspect: "4:5",
        fit: "contain",
        focal: { x: 0.5, y: 0.5 },
      },
      pieces: [],
    }
  );
}
export function SceneEditor(props: Props) {
  const t = useTranslations("scenes");
  const available = props.initialBlocks.flatMap((block, index) =>
    block.type === "Hero" || block.type === "Banner"
      ? [{ index, title: block.title.fa || block.title.en }]
      : [],
  );
  const [position, setPosition] = useState(
    available[0]?.index ?? props.initialBlocks.length,
  );
  const [scene, setScene] = useState(() =>
    initialScene(props.initialBlocks[position], props.seed, position),
  );
  const [enabled, setEnabled] = useState(
    Boolean(sceneIn(props.initialBlocks[position])),
  );
  const [urls, setUrls] = useState(props.imageUrls);
  const initial = useMemo(
    () => initialScene(props.initialBlocks[position], props.seed, position),
    [props.initialBlocks, props.seed, position],
  );
  const matchKey = JSON.stringify({
    mode: scene.mode,
    desktop: scene.desktop.mediaId,
    mobile: scene.mobile.mediaId,
    pieces: scene.pieces.map((piece) => [
      piece.productId,
      piece.colorId,
      piece.referenceMediaId,
    ]),
  });
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(false);
  }, [matchKey, props.version]);
  const dirty =
    JSON.stringify(scene) !== JSON.stringify(initial) ||
    enabled !== Boolean(sceneIn(props.initialBlocks[position]));
  useEffect(() => {
    setScene(initial);
    setEnabled(Boolean(sceneIn(props.initialBlocks[position])));
    setUrls(props.imageUrls);
  }, [
    props.version,
    props.scope,
    initial,
    props.imageUrls,
    props.initialBlocks,
    position,
  ]);
  const previewMarkets =
    props.scope === "global"
      ? props.markets
      : props.markets.filter((m) => m.id === props.scope);
  const [previewMarket, setPreviewMarket] = useState(
    previewMarkets[0]?.id ?? "",
  );
  const selectedMarket =
    previewMarkets.find((m) => m.id === previewMarket) ?? previewMarkets[0];
  const [previewLocale, setPreviewLocale] = useState<"fa" | "tr" | "en">(
    (selectedMarket?.enabledLocales[0] as "fa" | "tr" | "en") ?? "en",
  );
  const actualLocale = selectedMarket?.enabledLocales.includes(previewLocale)
    ? previewLocale
    : (selectedMarket?.enabledLocales[0] ?? "en");
  const [frame, setFrame] = useState<"mobile" | "desktop">("mobile");
  const iframe = useRef<HTMLIFrameElement>(null),
    ready = useRef(false);
  const channel = useId(),
    latest = useRef(scene);
  latest.current = scene;
  const source = `/admin/preview/scenes?${new URLSearchParams({ channel, marketId: selectedMarket?.id ?? "", locale: actualLocale, frame, ...(props.scope !== "global" ? { scopeMarketId: props.scope } : {}) })}`;
  useEffect(() => {
    ready.current = false;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== iframe.current?.contentWindow ||
        event.data?.channel !== channel ||
        event.data?.type !== "scene-preview-ready"
      )
        return;
      ready.current = true;
      iframe.current?.contentWindow?.postMessage(
        { type: "scene-preview", channel, scene: latest.current },
        location.origin,
      );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [channel, source]);
  useEffect(() => {
    if (ready.current)
      iframe.current?.contentWindow?.postMessage(
        { type: "scene-preview", channel, scene },
        location.origin,
      );
  }, [scene, channel]);
  const [revisionId, setRevision] = useState(
    props.history.some((revision) => revision.id === props.draftRevisionId)
      ? props.draftRevisionId!
      : (props.history[0]?.id ?? ""),
  );
  useEffect(() => {
    setRevision(
      props.history.some((revision) => revision.id === props.draftRevisionId)
        ? props.draftRevisionId!
        : (props.history[0]?.id ?? ""),
    );
  }, [props.draftRevisionId, props.history]);
  const [at, setAt] = useState("");
  const blocks = useMemo(() => {
    const all = structuredClone(props.initialBlocks);
    if (!all[position])
      all.push({
        type: "Hero",
        title: scene.title,
        body: blank(),
        ctaLabel: blank(),
      });
    const block = all[position];
    if (block && (block.type === "Hero" || block.type === "Banner")) {
      if (enabled) block.scene = scene;
      else delete block.scene;
    }
    return all;
  }, [props.initialBlocks, position, enabled, scene]);
  const modifyPiece = (
    index: number,
    change: Partial<ShoppableScene["pieces"][number]>,
  ) =>
    setScene((current) => ({
      ...current,
      pieces: current.pieces.map((piece, n) =>
        n === index ? { ...piece, ...change } : piece,
      ),
    }));
  const publicationFields = (
    <>
      <input type="hidden" name="homepageId" value={props.homepageId ?? ""} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="expectedVersion" value={props.version} />
    </>
  );
  return (
    <div className="grid gap-6 mt-5">
      <div className="card grid gap-3 md:grid-cols-3">
        <label>
          {t("scope")}
          <select
            className="input"
            value={props.scope}
            onChange={(e) =>
              window.location.assign(
                `/admin/content/homepage/scenes?scope=${encodeURIComponent(e.target.value)}`,
              )
            }
          >
            {props.globalAllowed && (
              <option value="global">{t("global")}</option>
            )}
            {props.markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
              </option>
            ))}
          </select>
        </label>
        <p>{t("revision", { version: props.version })}</p>
        <p>
          {props.publishedRevisionId
            ? t("hasPublication")
            : t("legacyOrFallback")}
        </p>
        {props.schedule && (
          <p role="status">
            {t("scheduledAt", { at: props.schedule.at })}
            {props.schedule.error
              ? ` · ${t("scheduleFailed")} (${props.schedule.error})`
              : ""}
          </p>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsForm
          action={props.action}
          submitLabel={t("saveDraft")}
          disabled={!props.writable}
        >
          <fieldset disabled={!props.writable} className="grid gap-4">
            <input
              type="hidden"
              name="marketId"
              value={props.scope === "global" ? "" : props.scope}
            />
            <input type="hidden" name="expectedVersion" value={props.version} />
            <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
            <label>
              {t("placement")}
              <select
                className="input"
                value={position}
                onChange={(e) => {
                  if (dirty && !window.confirm(t("discardChanges"))) return;
                  setPosition(Number(e.target.value));
                }}
              >
                {available.map((option) => (
                  <option key={option.index} value={option.index}>
                    {option.title}
                  </option>
                ))}
                <option value={props.initialBlocks.length}>
                  {t("newHero")}
                </option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              {t("enableScene")}
            </label>
            <p>{t("photoMode")}</p>
            <p className="text-muted">{t("compositeLater")}</p>
            {(["title", "alt"] as const).map((field) => (
              <div key={field} className="grid gap-2">
                {languages.map((locale) => (
                  <label key={locale}>
                    {t(field)} — {languageNames[locale]}
                    <input
                      className="input"
                      value={scene[field][locale]}
                      required={enabled}
                      onChange={(e) =>
                        setScene((s) => ({
                          ...s,
                          [field]: { ...s[field], [locale]: e.target.value },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ))}
            {(["desktop", "mobile"] as const).map((kind) => (
              <div key={kind} className="card grid gap-3">
                <MediaPicker
                  key={`${props.scope}:${position}:${kind}:${scene[kind].mediaId}`}
                  name={`${kind}SceneMedia`}
                  label={t(kind === "desktop" ? "desktopImage" : "mobileImage")}
                  defaultMediaId={scene[kind].mediaId}
                  defaultUrl={urls[scene[kind].mediaId]}
                  onSelect={(id, url) => {
                    setUrls((current) => ({ ...current, [id]: url }));
                    setScene((s) => ({
                      ...s,
                      [kind]: { ...s[kind], mediaId: id },
                    }));
                  }}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label>
                    {t("fit")}
                    <select
                      className="input"
                      value={scene[kind].fit}
                      onChange={(e) =>
                        setScene((s) => ({
                          ...s,
                          [kind]: {
                            ...s[kind],
                            fit: e.target.value as "cover" | "contain",
                          },
                        }))
                      }
                    >
                      <option value="contain">{t("contain")}</option>
                      <option value="cover">{t("cover")}</option>
                    </select>
                  </label>
                  <label>
                    {t("aspect")}
                    <select
                      className="input"
                      value={scene[kind].aspect}
                      onChange={(e) =>
                        setScene((s) => ({
                          ...s,
                          [kind]: {
                            ...s[kind],
                            aspect: e.target
                              .value as (typeof SCENE_ASPECTS)[number],
                          },
                        }))
                      }
                    >
                      {SCENE_ASPECTS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      {t(axis === "x" ? "focalX" : "focalY")}
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={scene[kind].focal[axis]}
                        onChange={(e) =>
                          setScene((s) => ({
                            ...s,
                            [kind]: {
                              ...s[kind],
                              focal: {
                                ...s[kind].focal,
                                [axis]: Number(e.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                {urls[scene[kind].mediaId] && (
                  <SceneAnchorCanvas
                    scene={scene}
                    kind={kind}
                    url={urls[scene[kind].mediaId]}
                    change={modifyPiece}
                  />
                )}
              </div>
            ))}
            {scene.pieces.map((piece, index) => {
              const product = props.products.find(
                  (p) => p.id === piece.productId,
                ),
                color = product?.colors.find((c) => c.id === piece.colorId);
              return (
                <div
                  key={piece.id}
                  className="card grid gap-3"
                  data-testid={`scene-editor-piece-${index}`}
                >
                  <strong>{t("piece", { number: index + 1 })}</strong>
                  <label>
                    {t("product")}
                    <select
                      className="input"
                      value={piece.productId}
                      onChange={(e) =>
                        modifyPiece(index, {
                          productId: e.target.value,
                          colorId: "",
                          referenceMediaId: "",
                          preferredVariantId: undefined,
                        })
                      }
                    >
                      <option value="">{t("chooseProduct")}</option>
                      {props.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("color")}
                    <select
                      className="input"
                      value={piece.colorId}
                      onChange={(e) =>
                        modifyPiece(index, {
                          colorId: e.target.value,
                          referenceMediaId: "",
                          preferredVariantId: undefined,
                        })
                      }
                    >
                      <option value="">{t("chooseColor")}</option>
                      {product?.colors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("referenceImage")}
                    <select
                      className="input"
                      value={piece.referenceMediaId}
                      onChange={(e) =>
                        modifyPiece(index, { referenceMediaId: e.target.value })
                      }
                    >
                      <option value="">{t("chooseReference")}</option>
                      {color?.images.map((image) => (
                        <option key={image.id} value={image.id}>
                          {image.originalName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {color?.images.find(
                    (image) => image.id === piece.referenceMediaId,
                  ) && (
                    <img
                      className="max-h-40 w-auto object-contain"
                      src={
                        color.images.find(
                          (image) => image.id === piece.referenceMediaId,
                        )!.url
                      }
                      alt={t("referenceImage")}
                    />
                  )}
                  <label>
                    {t("preferredVariant")}
                    <select
                      className="input"
                      value={piece.preferredVariantId ?? ""}
                      onChange={(e) =>
                        modifyPiece(index, {
                          preferredVariantId: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">{t("none")}</option>
                      {color?.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.size}
                        </option>
                      ))}
                    </select>
                  </label>
                  {languages.map((locale) => (
                    <label key={locale}>
                      {t("shortLabel")} — {languageNames[locale]}
                      <input
                        className="input"
                        maxLength={200}
                        value={piece.label?.[locale] ?? ""}
                        onChange={(event) =>
                          modifyPiece(index, {
                            label: {
                              ...(piece.label ?? blank()),
                              [locale]: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    {t("labelSide")}
                    <select
                      className="input"
                      value={piece.side}
                      onChange={(event) =>
                        modifyPiece(index, {
                          side: event.target.value as "start" | "end",
                        })
                      }
                    >
                      <option value="start">{t("sideStart")}</option>
                      <option value="end">{t("sideEnd")}</option>
                    </select>
                  </label>
                  {(["desktop", "mobile"] as const).map((kind) => (
                    <div key={kind} className="grid gap-2 sm:grid-cols-2">
                      {(["x", "y"] as const).map((axis) => (
                        <label key={axis}>
                          {t(kind)} {axis.toUpperCase()}
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={piece[kind][axis]}
                            onChange={(e) =>
                              modifyPiece(index, {
                                [kind]: {
                                  ...piece[kind],
                                  [axis]: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setScene((s) => ({
                        ...s,
                        pieces: s.pieces.filter((_, n) => n !== index),
                      }))
                    }
                  >
                    {t("removePiece")}
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="button"
              disabled={scene.pieces.length >= 12}
              onClick={() =>
                setScene((s) => ({
                  ...s,
                  pieces: [
                    ...s.pieces,
                    {
                      id: crypto.randomUUID(),
                      productId: "",
                      colorId: "",
                      referenceMediaId: "",
                      desktop: { x: 0.5, y: 0.5 },
                      mobile: { x: 0.5, y: 0.5 },
                      side: "end",
                    },
                  ],
                }))
              }
            >
              {t("addPiece")}
            </button>
            {enabled && (
              <label>
                <input
                  type="checkbox"
                  name="confirmSceneIds"
                  value={scene.id}
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                {t("confirmMatch")}
              </label>
            )}
            {scene.match && (
              <p>{t("confirmedAt", { at: scene.match.confirmedAt })}</p>
            )}
          </fieldset>
        </SettingsForm>
        <aside className="min-w-0 grid content-start gap-4">
          <div className="flex flex-wrap gap-2">
            <label>
              {t("previewMarket")}
              <select
                className="input"
                value={selectedMarket?.id ?? ""}
                onChange={(e) => setPreviewMarket(e.target.value)}
              >
                {previewMarkets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("previewLanguage")}
              <select
                className="input"
                value={actualLocale}
                onChange={(e) =>
                  setPreviewLocale(e.target.value as "fa" | "tr" | "en")
                }
              >
                {selectedMarket?.enabledLocales.map((locale) => (
                  <option key={locale} value={locale}>
                    {languageNames[locale as keyof typeof languageNames] ??
                      locale}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("previewFrame")}
              <select
                className="input"
                value={frame}
                onChange={(e) =>
                  setFrame(e.target.value as "mobile" | "desktop")
                }
              >
                <option value="mobile">{t("mobile")}</option>
                <option value="desktop">{t("desktop")}</option>
              </select>
            </label>
          </div>
          {enabled && selectedMarket && (
            <div
              className="min-w-0 max-w-full overflow-x-auto"
              role="region"
              aria-label={t("previewTitle")}
              tabIndex={0}
            >
              <iframe
                ref={iframe}
                src={source}
                title={t("previewTitle")}
                data-testid="scene-preview"
                className="block border rounded-token"
                style={{
                  width: frame === "mobile" ? 390 : 1280,
                  maxWidth: "none",
                  height: 900,
                }}
              />
            </div>
          )}
          <div className="card grid gap-3">
            <h2>{t("publication")}</h2>
            {dirty && <p role="status">{t("saveBeforePublish")}</p>}
            <label>
              {t("history")}
              <select
                className="input"
                value={revisionId}
                onChange={(e) => setRevision(e.target.value)}
              >
                <option value="">{t("none")}</option>
                {props.history.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {t("revision", { version: revision.version })} ·{" "}
                    {revision.at}
                  </option>
                ))}
              </select>
            </label>
            {props.hasMoreHistory && (
              <a
                className="button"
                href={`/admin/content/homepage/scenes?${new URLSearchParams({ scope: props.scope, after: props.history.at(-1)!.id })}`}
              >
                {t("olderHistory")}
              </a>
            )}
            <SettingsForm
              action={props.publish}
              submitLabel={t("publishRevision")}
              disabled={
                dirty || !props.writable || !props.homepageId || !revisionId
              }
            >
              <fieldset
                disabled={
                  dirty || !props.writable || !props.homepageId || !revisionId
                }
                className="contents"
              >
                {publicationFields}
              </fieldset>
              <input type="hidden" name="blocked" value={dirty ? "1" : ""} />
            </SettingsForm>
            <SettingsForm
              action={props.scheduleAction}
              submitLabel={t("scheduleRevision")}
              disabled={
                dirty || !props.writable || !props.homepageId || !revisionId
              }
            >
              <fieldset
                disabled={
                  dirty || !props.writable || !props.homepageId || !revisionId
                }
                className="grid gap-2"
              >
                {publicationFields}
                <label>
                  {t("scheduleTime")}
                  <input
                    type="datetime-local"
                    className="input"
                    value={at}
                    required
                    onChange={(e) => setAt(e.target.value)}
                  />
                  <input
                    type="hidden"
                    name="at"
                    value={at ? `${at}:00.000Z` : ""}
                  />
                </label>
              </fieldset>
            </SettingsForm>
          </div>
        </aside>
      </div>
    </div>
  );
}
function SceneAnchorCanvas({
  scene,
  kind,
  url,
  change,
}: {
  scene: ShoppableScene;
  kind: "desktop" | "mobile";
  url: string;
  change: (
    index: number,
    changes: Partial<ShoppableScene["pieces"][number]>,
  ) => void;
}) {
  const t = useTranslations("scenes"),
    image = useRef<HTMLImageElement>(null),
    root = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const loaded = () =>
      setDimensions({
        width: element.naturalWidth,
        height: element.naturalHeight,
      });
    if (element.complete) loaded();
    else setDimensions({ width: 0, height: 0 });
    element.addEventListener("load", loaded);
    return () => element.removeEventListener("load", loaded);
  }, [url]);
  const selected = useRef<number | null>(null);
  const coordinate = (value: number) =>
    Math.max(0, Math.min(1, Number(value.toFixed(4))));
  const move = (event: React.PointerEvent) => {
    if (
      selected.current === null ||
      !root.current ||
      !dimensions.width ||
      !dimensions.height
    )
      return;
    const box = root.current.getBoundingClientRect(),
      frame = scene[kind];
    const scale =
      frame.fit === "cover"
        ? Math.max(box.width / dimensions.width, box.height / dimensions.height)
        : Math.min(
            box.width / dimensions.width,
            box.height / dimensions.height,
          );
    change(selected.current, {
      [kind]: {
        x: coordinate(
          (event.clientX -
            box.left -
            (box.width - dimensions.width * scale) * frame.focal.x) /
            (dimensions.width * scale),
        ),
        y: coordinate(
          (event.clientY -
            box.top -
            (box.height - dimensions.height * scale) * frame.focal.y) /
            (dimensions.height * scale),
        ),
      },
    });
  };
  return (
    <div>
      <p>{t("anchorHelp")}</p>
      <div
        ref={root}
        className="relative max-w-sm"
        style={{
          aspectRatio: scene[kind].aspect.replace(":", " / "),
          background: "var(--sand)",
        }}
        onPointerMove={move}
        onPointerUp={() => {
          selected.current = null;
        }}
        onPointerCancel={() => {
          selected.current = null;
        }}
      >
        <img
          ref={image}
          src={url}
          alt={t("anchorCanvas")}
          className="w-full h-full"
          style={{
            objectFit: scene[kind].fit,
            objectPosition: `${scene[kind].focal.x * 100}% ${scene[kind].focal.y * 100}%`,
          }}
          onLoad={() =>
            setDimensions({
              width: image.current?.naturalWidth ?? 0,
              height: image.current?.naturalHeight ?? 0,
            })
          }
        />
        {scene.pieces.map((piece, index) => {
          const point = scenePointInFrame(piece[kind], dimensions, scene[kind]);
          return point.visible ? (
            <button
              key={piece.id}
              type="button"
              className="scene-pin"
              style={{
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                touchAction: "none",
              }}
              aria-label={t("moveAnchor", {
                number: index + 1,
                frame: t(kind),
              })}
              onPointerDown={(e) => {
                selected.current = index;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 0.05 : 0.01;
                const offsets = {
                  ArrowLeft: [-delta, 0],
                  ArrowRight: [delta, 0],
                  ArrowUp: [0, -delta],
                  ArrowDown: [0, delta],
                };
                const offset = offsets[event.key as keyof typeof offsets];
                if (offset) {
                  event.preventDefault();
                  change(index, {
                    [kind]: {
                      x: coordinate(piece[kind].x + offset[0]),
                      y: coordinate(piece[kind].y + offset[1]),
                    },
                  });
                }
              }}
            >
              {index + 1}
            </button>
          ) : dimensions.width > 0 && dimensions.height > 0 ? (
            <p key={piece.id} role="status">
              {t("anchorOutside", { number: index + 1 })}
            </p>
          ) : null;
        })}
      </div>
    </div>
  );
}
