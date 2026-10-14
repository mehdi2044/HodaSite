"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SettingsForm } from "./settings-form";
import { MediaPicker } from "./media-picker";
import { ResponsiveImage } from "@/components/storefront/responsive-image";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import { scenePriceRange } from "@/modules/content/scenes/prices";
import {
  CUTOUT_ANCHORS,
  CUTOUT_SLOTS,
  type CutoutGeometry,
  type CutoutPlacement,
} from "@/modules/catalog/cutouts/contracts";
import { projectCutout } from "@/modules/catalog/cutouts/geometry";
import type { CutoutPreview } from "@/modules/catalog/cutouts/preview";
import type { ActionResult } from "@/lib/action-result";
type Image = CutoutPreview["image"];
type Model = CutoutPreview["models"][number];
type Action = (
  state: ActionResult | null,
  data: FormData,
) => Promise<ActionResult>;
type Props = {
  productId: string;
  colorId: string;
  variantId: string | null;
  slot: string | null;
  products: { id: string; title: string }[];
  colors: { id: string; title: string }[];
  variants: { id: string; size: string }[];
  profile: {
    id: string;
    version: number;
    mediaId: string;
    anchor: string | null;
    archived: boolean;
  } | null;
  initialGeometry: CutoutGeometry;
  initialImage: (Image & { id: string; fingerprint: string }) | null;
  models: Model[];
  markets: { id: string; code: string; enabledLocales: string[] }[];
  writable: boolean;
  action: Action;
  archive: Action;
};
const clamp = (value: number) =>
  Math.max(0, Math.min(1, Number(value.toFixed(4))));
export function CutoutEditor(props: Props) {
  const t = useTranslations("cutouts");
  const [mediaId, setMedia] = useState(props.profile?.mediaId ?? "");
  const [mediaUrl, setMediaUrl] = useState(props.initialImage?.url);
  const [geometry, setGeometry] = useState(props.initialGeometry);
  const [anchor, setAnchor] = useState(props.profile?.anchor ?? "");
  const [modelId, setModel] = useState(
    props.initialGeometry.models[0]?.modelId ?? props.models[0]?.id ?? "",
  );
  const [marketId, setMarket] = useState(props.markets[0]?.id ?? "");
  const market = props.markets.find((m) => m.id === marketId);
  const [locale, setLocale] = useState<"fa" | "tr" | "en">(
    (market?.enabledLocales[0] as "fa" | "tr" | "en") ?? "en",
  );
  const actualLocale = market?.enabledLocales.includes(locale)
    ? locale
    : ((market?.enabledLocales[0] ?? "en") as "fa" | "tr" | "en");
  const [view, setView] = useState<CutoutPreview | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [confirmed, confirm] = useState(false);
  const baseline = useMemo(
    () =>
      JSON.stringify([
        props.profile?.mediaId ?? "",
        props.profile?.anchor ?? "",
        props.initialGeometry,
      ]),
    [props.profile, props.initialGeometry],
  );
  const dirty = JSON.stringify([mediaId, anchor, geometry]) !== baseline;
  useEffect(() => {
    setMedia(props.profile?.mediaId ?? "");
    setMediaUrl(props.initialImage?.url);
    setGeometry(props.initialGeometry);
    setAnchor(props.profile?.anchor ?? "");
    confirm(false);
  }, [props.profile, props.initialGeometry, props.initialImage]);
  const payload = useMemo(
    () => ({
      productId: props.productId,
      colorId: props.colorId,
      variantId: props.variantId,
      mediaId,
      marketId,
      locale: actualLocale,
      geometry,
    }),
    [
      props.productId,
      props.colorId,
      props.variantId,
      mediaId,
      marketId,
      actualLocale,
      geometry,
    ],
  );
  const latestPayload = useRef(payload);
  latestPayload.current = payload;
  const sequence = useRef(0);
  useEffect(() => {
    let controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      busy = false;
    const update = async () => {
      const current = latestPayload.current;
      if (!current.mediaId || !current.marketId || document.hidden || busy)
        return;
      busy = true;
      const turn = ++sequence.current;
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      try {
        const response = await fetch("/api/admin/cutouts/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(current),
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw Error("PREVIEW_UNAVAILABLE");
        const body = (await response.json()) as { view: CutoutPreview };
        if (!request.signal.aborted && sequence.current === turn) {
          setView(body.view);
          setUnavailable(false);
        }
      } catch {
        if (!request.signal.aborted && sequence.current === turn) {
          setUnavailable(true);
          confirm(false);
        }
      } finally {
        if (sequence.current === turn) busy = false;
      }
    };
    timer = setTimeout(update, 200);
    const interval = setInterval(update, 4000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      sequence.current++;
      controller?.abort();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [payload]);
  const snapshotKey = JSON.stringify([
    mediaId,
    view?.imageFingerprint,
    geometry.models.map((m) => m.modelId),
    view?.models.map((m) => [m.id, m.fingerprint]),
  ]);
  useEffect(() => {
    confirm(false);
  }, [snapshotKey, props.profile?.version]);
  const expectedModels = geometry.models.flatMap((g) => {
    const model = view?.models.find((m) => m.id === g.modelId);
    return model ? [{ modelId: model.id, fingerprint: model.fingerprint }] : [];
  });
  const ready = Boolean(
    !unavailable &&
    view?.transparent &&
    mediaId &&
    geometry.models.length &&
    expectedModels.length === geometry.models.length &&
    (CUTOUT_SLOTS as readonly string[]).includes(props.slot ?? "") &&
    (props.slot === "ACCESSORY" ? anchor : !anchor),
  );
  const input = {
    productId: props.productId,
    colorId: props.colorId,
    variantId: props.variantId,
    mediaId,
    slot: props.slot,
    anchor: anchor || null,
    geometry,
    expectedVersion: props.profile?.version ?? 0,
    confirm: confirmed,
    expectedImageFingerprint: view?.imageFingerprint ?? "",
    expectedModelFingerprints: expectedModels,
  };
  const models = view?.models ?? props.models;
  const selected = models.find((m) => m.id === modelId);
  const placement = geometry.models.find((m) => m.modelId === modelId);
  const change = (patch: Partial<CutoutPlacement>) =>
    setGeometry((old) => ({
      ...old,
      models: old.models.map((m) =>
        m.modelId === modelId ? { ...m, ...patch } : m,
      ),
    }));
  const navigate = (
    productId: string,
    colorId?: string,
    variantId?: string,
  ) => {
    if (dirty && !window.confirm(t("discard"))) return;
    window.location.assign(
      `/admin/catalog/cutouts?${new URLSearchParams({ product: productId, ...(colorId ? { color: colorId } : {}), ...(variantId ? { variant: variantId } : {}) })}`,
    );
  };
  const range = scenePriceRange(
    view?.variants.flatMap((v) =>
      v.available > 0 && v.amount !== null ? [v.amount] : [],
    ) ?? [],
  );
  return (
    <div className="grid gap-6 mt-5" data-testid="cutout-editor">
      <div className="card grid gap-4 md:grid-cols-3">
        <label>
          {t("product")}
          <select
            className="input"
            value={props.productId}
            onChange={(e) => navigate(e.target.value)}
          >
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
            value={props.colorId}
            onChange={(e) => navigate(props.productId, e.target.value)}
          >
            {props.colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("scope")}
          <select
            className="input"
            value={props.variantId ?? ""}
            onChange={(e) =>
              navigate(props.productId, props.colorId, e.target.value)
            }
          >
            <option value="">{t("shared")}</option>
            {props.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.size}
              </option>
            ))}
          </select>
        </label>
      </div>
      {props.profile?.archived && <p role="status">{t("archived")}</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsForm
          action={props.action}
          submitLabel={t("save")}
          hasUnsavedChanges={dirty}
          disabled={!props.writable}
          submitDisabled={!ready || !confirmed}
        >
          <input type="hidden" name="payload" value={JSON.stringify(input)} />
          {/* Inputs stay editable while references are incomplete; only submit is gated. */}
          <fieldset disabled={!props.writable} className="grid gap-4">
            <p>
              {t("slot")} ·{" "}
              {props.slot ? t(`slots.${props.slot}`) : t("slotRequired")}
            </p>
            <MediaPicker
              name="cutoutMedia"
              label={t("image")}
              defaultMediaId={mediaId}
              defaultUrl={mediaUrl}
              onSelect={(id, url) => {
                setMedia(id);
                setMediaUrl(url);
                setView(null);
                confirm(false);
              }}
            />
            {props.slot === "ACCESSORY" && (
              <label>
                {t("anchor")}
                <select
                  className="input"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                >
                  <option value="">{t("choose")}</option>
                  {CUTOUT_ANCHORS.map((value) => (
                    <option key={value} value={value}>
                      {t(`anchors.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("model")}
              <select
                className="input"
                value={modelId}
                onChange={(e) => setModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {t(`kinds.${m.kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted">{t("modelHelp")}</p>
            {!placement ? (
              <button
                type="button"
                className="button"
                disabled={!selected}
                onClick={() =>
                  setGeometry((old) => ({
                    ...old,
                    models: [
                      ...old.models,
                      {
                        modelId,
                        x: 0.5,
                        y: 0.45,
                        width: 0.35,
                        height: 0.4,
                        scale: 1,
                        rotation: 0,
                        zIndex: 10,
                      },
                    ],
                  }))
                }
              >
                {t("addModel")}
              </button>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      "x",
                      "y",
                      "width",
                      "height",
                      "scale",
                      "rotation",
                      "zIndex",
                    ] as const
                  ).map((field) => (
                    <label key={field}>
                      {t(`fields.${field}`)}
                      <input
                        className="input"
                        type="number"
                        value={placement[field]}
                        step={field === "zIndex" ? 1 : 0.01}
                        min={
                          field === "rotation"
                            ? -180
                            : field === "zIndex"
                              ? -20
                              : field === "width" || field === "height"
                                ? 0.01
                                : field === "scale"
                                  ? 0.2
                                  : 0
                        }
                        max={
                          field === "rotation"
                            ? 180
                            : field === "zIndex"
                              ? 100
                              : field === "width" || field === "height"
                                ? 1.5
                                : field === "scale"
                                  ? 3
                                  : 1
                        }
                        onChange={(e) =>
                          change({ [field]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    setGeometry((old) => ({
                      ...old,
                      models: old.models.filter((m) => m.modelId !== modelId),
                    }))
                  }
                >
                  {t("removeModel")}
                </button>
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!ready}
                onChange={(e) => confirm(e.target.checked)}
              />{" "}
              {t("confirm")}
            </label>
            {!ready && <p role="status">{t("notReady")}</p>}
            <a
              className="button"
              href={`/admin/catalog/products/${props.productId}`}
            >
              {t("editProduct")}
            </a>
          </fieldset>
        </SettingsForm>
        <aside className="min-w-0 grid gap-4 content-start">
          <div className="card grid gap-3 sm:grid-cols-2">
            <label>
              {t("market")}
              <select
                className="input"
                value={marketId}
                onChange={(e) => setMarket(e.target.value)}
              >
                {props.markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("language")}
              <select
                className="input"
                value={actualLocale}
                onChange={(e) =>
                  setLocale(e.target.value as "fa" | "tr" | "en")
                }
              >
                {market?.enabledLocales.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {unavailable && <p role="alert">{t("previewUnavailable")}</p>}
          <div
            className="card"
            lang={actualLocale}
            dir={actualLocale === "fa" ? "rtl" : "ltr"}
          >
            <h2>{view?.title ?? t("preview")}</h2>
            <p>{view?.color}</p>
            <p className="moda-price">
              {range && view
                ? formatStorefrontAmount(
                    range.min,
                    view.currency,
                    actualLocale,
                  ) +
                  (range.min !== range.max
                    ? `–${formatStorefrontAmount(range.max, view.currency, actualLocale)}`
                    : "")
                : t("priceUnavailable")}
            </p>
            <p>{t("stylingOnly")}</p>
            {selected && (
              <CutoutCanvas
                model={selected}
                image={view?.transparent ? view.image : null}
                placement={placement}
                writable={props.writable}
                change={change}
              />
            )}
            {view && !view.transparent && (
              <>
                <p role="status">{t("opaqueFallback")}</p>
                <ResponsiveImage
                  media={view.image}
                  locale={actualLocale}
                  sizes="390px"
                  className="block max-w-xs"
                  imgClassName="w-full h-auto object-contain"
                />
              </>
            )}
            <p>{t("previewOnly")}</p>
            {view?.variants.map((v) => (
              <p key={v.id}>
                <bdi>{v.size}</bdi> ·{" "}
                {v.amount && v.available > 0
                  ? formatStorefrontAmount(
                      v.amount,
                      view.currency,
                      actualLocale,
                    )
                  : t(v.available > 0 ? "priceUnavailable" : "outOfStock")}
              </p>
            ))}
          </div>
          {props.profile && !props.profile.archived && (
            <SettingsForm
              action={props.archive}
              submitLabel={t("archive")}
              disabled={!props.writable || dirty}
              hasUnsavedChanges={false}
            >
              <input type="hidden" name="id" value={props.profile.id} />
              <input
                type="hidden"
                name="expectedVersion"
                value={props.profile.version}
              />
            </SettingsForm>
          )}
        </aside>
      </div>
    </div>
  );
}
function CutoutCanvas({
  model,
  image,
  placement,
  writable,
  change,
}: {
  model: Model;
  image: Image | null;
  placement?: CutoutPlacement;
  writable: boolean;
  change: (patch: Partial<CutoutPlacement>) => void;
}) {
  const t = useTranslations("cutouts"),
    root = useRef<HTMLDivElement>(null),
    dragging = useRef(false);
  const frame = {
    aspect: "4:5" as const,
    fit: "contain" as const,
    focal: { x: 0.5, y: 0.5 },
  };
  const dimensions = {
    width: model.image.width ?? 0,
    height: model.image.height ?? 0,
  };
  const point = placement ? projectCutout(placement, dimensions, frame) : null;
  const move = (event: React.PointerEvent) => {
    if (
      !dragging.current ||
      !writable ||
      !root.current ||
      !dimensions.width ||
      !dimensions.height
    )
      return;
    const rect = root.current.getBoundingClientRect(),
      scale = Math.min(
        rect.width / dimensions.width,
        rect.height / dimensions.height,
      );
    const width = dimensions.width * scale,
      height = dimensions.height * scale;
    change({
      x: clamp((event.clientX - rect.left - (rect.width - width) / 2) / width),
      y: clamp(
        (event.clientY - rect.top - (rect.height - height) / 2) / height,
      ),
    });
  };
  return (
    <div>
      <p>{t("dragHelp")}</p>
      <div
        ref={root}
        data-testid="cutout-canvas"
        className="relative max-w-sm overflow-hidden rounded-token bg-[var(--sand)]"
        style={{ aspectRatio: "4 / 5" }}
        onPointerMove={move}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <ResponsiveImage
          media={model.image}
          locale="en"
          sizes="390px"
          className="block h-full w-full"
          imgClassName="h-full w-full object-contain"
        />
        {image && placement && point && (
          <>
            <div
              className="absolute pointer-events-none"
              data-testid="cutout-visual"
              style={{
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                width: `${point.width * 100}%`,
                height: `${point.height * 100}%`,
                transform: `translate(-50%,-50%) rotate(${point.rotation}deg)`,
                zIndex: point.zIndex,
              }}
            >
              <ResponsiveImage
                media={image}
                locale="en"
                sizes="390px"
                className="block h-full w-full"
                imgClassName="h-full w-full object-contain"
              />
            </div>
            <button
              type="button"
              data-testid="cutout-layer"
              aria-label={t("moveCutout")}
              disabled={!writable}
              className="absolute min-h-11 min-w-11 border border-dashed border-[var(--accent)] bg-transparent"
              style={{
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                width: "44px",
                height: "44px",
                transform: "translate(-50%,-50%)",
                zIndex: point.zIndex + 1,
              }}
              onPointerDown={(event) => {
                if (!writable) return;
                dragging.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
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
                  change({
                    x: clamp(placement.x + offset[0]),
                    y: clamp(placement.y + offset[1]),
                  });
                }
              }}
            >
              <span aria-hidden="true">✥</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
