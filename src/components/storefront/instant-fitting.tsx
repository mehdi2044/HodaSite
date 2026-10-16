"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ResponsiveImage, type ResponsiveImageMedia } from "./responsive-image";
import { SceneLayerImage } from "./scene-layer";
import { formatStorefrontAmount } from "@/modules/catalog/format";
import {
  instantSelectionSchema,
  instantSnapshotSchema,
} from "@/modules/fitting/instant-contract";
import type { FittingProduct } from "./fitting-room";
import type { resolveInstantSelection } from "@/modules/fitting/instant";
import {
  previewInstant,
  loadInstantCatalog,
  saveInstant,
  changeInstant,
  buyInstant,
  loadInstantWardrobe,
} from "@/app/[locale]/fitting-room/instant-actions";
type View = Awaited<ReturnType<typeof resolveInstantSelection>>;
type Saved = {
  id: string;
  name: string;
  version: number;
  snapshot: unknown;
  archivedAt: unknown;
};
export function InstantFitting({
  locale,
  marketId,
  currency,
  customerId,
  models,
  products,
  saved,
  archived,
  primaryHeading = true,
}: {
  locale: "fa" | "tr" | "en";
  marketId: string;
  currency: "IRT" | "TRY" | "CAD";
  customerId: string | null;
  models: {
    id: string;
    label: Record<string, string>;
    kind: string;
    media: ResponsiveImageMedia;
  }[];
  products: FittingProduct[];
  saved: Saved[];
  archived: Saved[];
  primaryHeading?: boolean;
}) {
  const t = useTranslations("instantFitting"),
    Heading = primaryHeading ? "h1" : "h2";
  const [modelId, setModel] = useState(models[0]?.id ?? ""),
    [catalog, setCatalog] = useState(products),
    [productCursor, setProductCursor] = useState(
      products[0]?.nextProductCursor ?? null,
    ),
    [moreSaved, setMoreSaved] = useState(saved.length === 100),
    [moreArchived, setMoreArchived] = useState(archived.length === 100),
    [query, setQuery] = useState(""),
    [view, setView] = useState<View | null>(null),
    [localLayers, setLocalLayers] = useState<View["layers"] | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    [rows, setRows] = useState(saved),
    [trash, setTrash] = useState(archived),
    [editing, setEditing] = useState<{ id: string; version: number } | null>(
      null,
    ),
    [review, setReview] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [angle, setAngle] = useState(0);
  const sequence = useRef(0),
    ready = useRef(false),
    requestKey = useRef(""),
    root = useRef<HTMLElement>(null),
    stage = useRef<HTMLDivElement>(null),
    drag = useRef<number | null>(null);
  const draftKey = `hoda.instant:${marketId}:${customerId ?? "guest"}`;
  const model = models.find((m) => m.id === modelId);
  useEffect(() => {
    if (!view || !ids.length || pending) return;
    let active = true,
      visible = false,
      busy = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const fingerprint = view.fingerprint;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const tick = async () => {
      stop();
      if (!active || !visible || document.hidden || busy) return;
      busy = true;
      const seq = sequence.current;
      try {
        const [next, current] = await Promise.all([
          previewInstant(locale, { modelId, variantIds: ids }),
          loadInstantCatalog(locale, { variantIds: ids }),
        ]);
        if (!active || seq !== sequence.current) return;
        if (current.ok)
          setCatalog((old) =>
            old.map((item) =>
              ids.includes(item.variantId)
                ? (current.value.find(
                    (v) => v.variantId === item.variantId,
                  ) ?? { ...item, amount: null, available: false })
                : item,
            ),
          );
        if (!next.ok) {
          setView(null);
          setReview(true);
          setConfirmed(false);
          error(next.error);
        } else if (next.value.fingerprint !== fingerprint) {
          setView(next.value);
          setReview(true);
          setConfirmed(false);
          setMessage(t("review"));
        }
      } catch {
        if (active) {
          setView(null);
          setReview(true);
          setConfirmed(false);
          setMessage(t("error"));
        }
      } finally {
        busy = false;
        if (active && visible && !document.hidden)
          timer = setTimeout(tick, 2000);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      visible ? void tick() : stop();
    });
    if (root.current) observer.observe(root.current);
    const wake = () => {
      document.hidden ? stop() : void tick();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [view?.fingerprint, modelId, ids, locale, pending]);
  function error(code: string) {
    setMessage(t.has(`error_${code}`) ? t(`error_${code}`) : t("error"));
  }
  function mergeCatalog(next: FittingProduct[]) {
    setCatalog((old) => [
      ...old.filter((v) => !next.some((n) => n.variantId === v.variantId)),
      ...next,
    ]);
  }
  async function resolve(
    nextModel: string,
    nextIds: string[],
    savedFingerprint?: string,
  ) {
    const seq = ++sequence.current;
    setMessage("");
    setConfirmed(false);
    if (!nextIds.length) {
      setIds([]);
      setView(null);
      setLocalLayers(null);
      setReview(false);
      return;
    }
    const result = await previewInstant(locale, {
      modelId: nextModel,
      variantIds: nextIds,
    });
    if (seq !== sequence.current) return;
    if (!result.ok) {
      setLocalLayers(null);
      setView(null);
      setIds(nextIds);
      setReview(true);
      error(result.error);
      return;
    }
    const current = await loadInstantCatalog(locale, { variantIds: nextIds });
    if (seq !== sequence.current) return;
    if (current.ok) mergeCatalog(current.value);
    setIds(nextIds);
    setView(result.value);
    setLocalLayers(null);
    setReview(
      Boolean(
        savedFingerprint && savedFingerprint !== result.value.fingerprint,
      ),
    );
  }
  useEffect(() => {
    requestKey.current = crypto.randomUUID();
    try {
      const guestKey = `hoda.instant:${marketId}:guest`,
        own = sessionStorage.getItem(draftKey),
        raw = own ?? (customerId ? sessionStorage.getItem(guestKey) : null);
      if (raw) {
        const parsed = instantSelectionSchema.safeParse(JSON.parse(raw));
        if (
          parsed.success &&
          models.some((m) => m.id === parsed.data.modelId)
        ) {
          setModel(parsed.data.modelId);
          start(() => resolve(parsed.data.modelId, parsed.data.variantIds));
        }
      }
      if (customerId) sessionStorage.removeItem(guestKey);
    } catch {
      /* Storage is optional; no login or mutation depends on it. */
    }
    ready.current = true;
    return () => {
      sequence.current++;
    };
    // Component is keyed by verified owner/market/locale on the server.
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try {
      if (ids.length)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ modelId, variantIds: ids }),
        );
      else sessionStorage.removeItem(draftKey);
    } catch {}
  }, [draftKey, modelId, ids]);
  useEffect(() => {
    const reset = () => {
      setAngle(0);
      drag.current = null;
    };
    const hidden = () => {
      if (document.hidden) reset();
    };
    document.addEventListener("visibilitychange", hidden);
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) reset();
    });
    if (stage.current) observer.observe(stage.current);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", reset);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", hidden);
      media.removeEventListener("change", reset);
    };
  }, []);
  const grouped = new Map<string, FittingProduct[]>();
  for (const p of catalog) {
    const list = grouped.get(p.productId) ?? [];
    list.push(p);
    grouped.set(p.productId, list);
  }
  async function choose(variantId: string) {
    requestKey.current = crypto.randomUUID();
    // Geometry was validated server-side for this exact public variant/model.
    // Paint synchronously, then let the existing live resolver authorize the selection.
    let next = catalog
      .find((p) => p.variantId === variantId)
      ?.placements?.find((p) => p.model.id === modelId);
    if (!next) {
      const single = await previewInstant(locale, {
        modelId,
        variantIds: [variantId],
      });
      if (!single.ok) {
        error(single.error);
        return;
      }
      next = single.value.layers[0];
    }
    const keepLayers = (localLayers ?? view?.layers ?? []).filter(
      (v) =>
        v.productId !== next.productId &&
        !(v.slot === next.slot && v.anchor === next.anchor) &&
        !(next.slot === "ONE_PIECE" && ["TOP", "BOTTOM"].includes(v.slot)) &&
        !(["TOP", "BOTTOM"].includes(next.slot) && v.slot === "ONE_PIECE"),
    );
    const keep = keepLayers.map((v) => v.variantId);
    if (keep.length >= 4) {
      error("INVALID_COMBINATION");
      return;
    }
    setLocalLayers([...keepLayers, next]);
    setIds([...keep, variantId]);
    setView(null);
    start(async () => {
      try {
        await resolve(modelId, [...keep, variantId]);
      } catch {
        setLocalLayers(null);
        setView(null);
        setReview(true);
        error("REQUEST_UNKNOWN");
      }
    });
  }
  async function save() {
    if (!view) return;
    if (review && !confirmed) {
      setMessage(t("review"));
      return;
    }
    const r = await saveInstant(locale, {
      modelId,
      variantIds: ids,
      name,
      fingerprint: view.fingerprint,
      requestKey: requestKey.current,
      ...(editing ? { id: editing.id, expectedVersion: editing.version } : {}),
    });
    if (!r.ok) {
      error(r.error);
      return;
    }
    const row = { ...r.value, name, snapshot: view.snapshot, archivedAt: null };
    setRows((old) => [row, ...old.filter((v) => v.id !== row.id)]);
    setEditing({ id: row.id, version: row.version });
    setReview(false);
    setMessage(t("saved"));
    requestKey.current = crypto.randomUUID();
  }
  async function load(row: Saved) {
    const parsed = instantSnapshotSchema.safeParse(row.snapshot);
    if (!parsed.success) {
      error("INVALID_SELECTION");
      return;
    }
    setEditing({ id: row.id, version: row.version });
    setModel(parsed.data.modelId);
    setName(row.name);
    requestKey.current = crypto.randomUUID();
    await resolve(
      parsed.data.modelId,
      parsed.data.variantIds,
      parsed.data.fingerprint,
    );
  }
  async function mutate(
    row: Saved,
    operation: "archive" | "restore" | "delete",
  ) {
    if (!confirmed) {
      setMessage(t("confirm"));
      return;
    }
    const r = await changeInstant(locale, {
      id: row.id,
      expectedVersion: row.version,
      operation,
      confirm: true,
    });
    if (!r.ok) {
      error(r.error);
      return;
    }
    setRows((old) => old.filter((v) => v.id !== row.id));
    setTrash((old) => old.filter((v) => v.id !== row.id));
    if (operation === "archive")
      setTrash((old) => [
        { ...row, version: row.version + 1, archivedAt: true },
        ...old,
      ]);
    if (operation === "restore")
      setRows((old) => [
        { ...row, version: row.version + 1, archivedAt: null },
        ...old,
      ]);
    if (editing?.id === row.id) {
      setEditing(null);
      setName("");
    }
    setConfirmed(false);
    setMessage(t("saved"));
  }
  return (
    <section
      ref={root}
      className="moda-instant"
      data-testid="instant-fitting"
      aria-busy={pending}
    >
      <header>
        <p className="eyebrow">{t("eyebrow")}</p>
        <Heading>{t("title")}</Heading>
        <p>{t("help")}</p>
        <p>{t("free")}</p>
      </header>
      <fieldset disabled={pending}>
        <legend>{t("models")}</legend>
        <div className="moda-instant-models">
          {models.map((m) => (
            <button
              type="button"
              key={m.id}
              aria-pressed={modelId === m.id}
              data-model-kind={m.kind}
              onClick={() => {
                sequence.current++;
                setModel(m.id);
                setIds([]);
                setView(null);
                setLocalLayers(null);
                setReview(false);
                setEditing(null);
                setAngle(0);
              }}
            >
              {m.label[locale]}
            </button>
          ))}
        </div>
      </fieldset>
      {!models.length && <p>{t("noModels")}</p>}
      <div className="moda-instant-workspace">
        <div>
          <div
            ref={stage}
            data-moda4="tryon-stage"
            className="moda-instant-stage"
            tabIndex={0}
            role="group"
            aria-label={t("rotateHelp")}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) {
                e.preventDefault();
                setAngle(
                  e.key === "Home"
                    ? 0
                    : Math.max(
                        -25,
                        Math.min(25, angle + (e.key === "ArrowLeft" ? -5 : 5)),
                      ),
                );
              }
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse" && e.button !== 0) return;
              drag.current = e.clientX;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (
                drag.current === null ||
                matchMedia("(prefers-reduced-motion: reduce)").matches
              )
                return;
              setAngle(
                Math.max(-25, Math.min(25, (e.clientX - drag.current) / 5)),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
              setAngle(0);
            }}
            onBlur={() => {
              drag.current = null;
              setAngle(0);
            }}
          >
            <div
              data-moda4="tryon-turntable"
              className="moda-instant-turn"
              style={{ transform: `perspective(900px) rotateY(${angle}deg)` }}
            >
              {model && (
                <div
                  className="moda-instant-mannequin"
                  data-moda4="tryon-mannequin"
                >
                  <ResponsiveImage
                    media={{ ...model.media, presentation: { fit: "contain" } }}
                    locale={locale}
                    role="catalog"
                    sizes="(min-width:900px) 40vw,90vw"
                    className="block h-full w-full"
                    imgClassName="h-full w-full object-contain"
                  />
                </div>
              )}
              {(
                localLayers ?? (view?.model.id === modelId ? view.layers : [])
              ).map((layer) => (
                <SceneLayerImage
                  key={layer.variantId}
                  instant
                  pieceId={layer.variantId}
                  layer={layer}
                  model={model?.media ?? { width: 0, height: 0 }}
                  locale={locale}
                  frame={{
                    mediaId: view?.snapshot.modelMediaId ?? modelId,
                    fit: "contain",
                    aspect: "3:4",
                    focal: { x: 0.5, y: 0.5 },
                  }}
                />
              ))}
            </div>
          </div>
          <p className="muted text-sm">{t("rotateHelp")}</p>
          <ul className="moda-instant-pieces">
            {ids.map((id) => {
              const p = catalog.find((v) => v.variantId === id);
              return (
                <li key={id}>
                  <span>
                    {p
                      ? `${p.title} · ${p.color} · ${p.size}`
                      : t("unavailable")}
                  </span>
                  <bdi>
                    {p?.amount
                      ? formatStorefrontAmount(p.amount, currency, locale)
                      : t("unavailable")}
                  </bdi>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() =>
                        resolve(
                          modelId,
                          ids.filter((v) => v !== id),
                        ),
                      )
                    }
                  >
                    {t("remove")}
                  </button>
                </li>
              );
            })}
          </ul>
          {review && (
            <div role="alert">
              <p>{t("review")}</p>
              {!editing && view && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {t("confirm")}
                  </label>
                  <button
                    type="button"
                    disabled={pending || !confirmed}
                    onClick={() => start(() => resolve(modelId, ids))}
                  >
                    {t("reviewCurrent")}
                  </button>
                </>
              )}
            </div>
          )}
          <p role="status">{message}</p>
          <div className="moda-instant-actions">
            <button
              className="button"
              type="button"
              disabled={
                pending ||
                !view ||
                review ||
                ids.some(
                  (id) => !catalog.find((v) => v.variantId === id)?.available,
                )
              }
              onClick={() =>
                start(async () => {
                  if (!view) return;
                  const r = await buyInstant(locale, {
                    modelId,
                    variantIds: ids,
                    fingerprint: view.fingerprint,
                  });
                  r.ok ? setMessage(t("added")) : error(r.error);
                })
              }
            >
              {t("addAll")}
            </button>
            {customerId ? (
              <div className="moda-instant-save">
                <label>
                  {t("name")}
                  <input
                    className="input"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={pending || !view || !name.trim()}
                  onClick={() => start(save)}
                >
                  {editing ? t("update") : t("save")}
                </button>
              </div>
            ) : (
              <Link
                className="button-outline"
                href={`/${locale}/account/login?next=/${locale}/fitting-room`}
              >
                {t("loginSave")}
              </Link>
            )}
          </div>
        </div>
        <div className="moda-instant-catalog">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await loadInstantCatalog(locale, { query });
                if (r.ok) {
                  setProductCursor(r.value[0]?.nextProductCursor ?? null);
                  setCatalog((old) => [
                    ...old.filter((v) => ids.includes(v.variantId)),
                    ...r.value.filter((v) => !ids.includes(v.variantId)),
                  ]);
                } else error(r.error);
              });
            }}
          >
            <label>
              {t("search")}
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
              />
            </label>
            <button className="button" disabled={pending}>
              {t("search")}
            </button>
          </form>
          <div className="moda-instant-grid" data-moda4="tryon-grid">
            {[...grouped].map(([productId, variants]) => (
              <InstantProduct
                key={`${productId}:${modelId}`}
                variants={variants}
                locale={locale}
                currency={currency}
                disabled={pending || !model}
                modelId={modelId}
                selectedIds={ids}
                choose={(id) => void choose(id)}
                more={() =>
                  start(async () => {
                    const after = variants.at(-1)?.nextCursor;
                    if (!after) return;
                    const r = await loadInstantCatalog(locale, {
                      productId,
                      after,
                    });
                    r.ok ? mergeCatalog(r.value) : error(r.error);
                  })
                }
              />
            ))}
          </div>
          {!catalog.length && <p>{t("empty")}</p>}
          {productCursor && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const afterProduct = productCursor;
                  if (!afterProduct) return;
                  const r = await loadInstantCatalog(locale, {
                    query,
                    afterProduct,
                  });
                  if (r.ok) {
                    mergeCatalog(r.value);
                    setProductCursor(r.value[0]?.nextProductCursor ?? null);
                  } else error(r.error);
                })
              }
            >
              {t("moreProducts")}
            </button>
          )}
        </div>
      </div>
      {customerId && (
        <section className="moda-instant-wardrobe">
          <h2>{t("wardrobe")}</h2>
          <p>{t("wardrobeHelp")}</p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("confirm")}
          </label>
          {!rows.length && <p>{t("emptyWardrobe")}</p>}
          <ul>
            {rows.map((row) => (
              <li key={row.id} id={`instant-${row.id}`}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => load(row))}
                >
                  {row.name}
                </button>
                <button
                  type="button"
                  disabled={pending || !confirmed}
                  onClick={() => start(() => mutate(row, "archive"))}
                >
                  {t("archive")}
                </button>
                <button
                  type="button"
                  disabled={pending || !confirmed}
                  onClick={() => start(() => mutate(row, "delete"))}
                >
                  {t("delete")}
                </button>
              </li>
            ))}
          </ul>
          {moreSaved && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const after = [...rows]
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .at(-1)?.id;
                  if (!after) return;
                  const r = await loadInstantWardrobe(locale, {
                    archived: false,
                    after,
                  });
                  if (r.ok) {
                    setRows((old) => [
                      ...old,
                      ...r.value.filter((v) => !old.some((o) => o.id === v.id)),
                    ]);
                    setMoreSaved(r.value.length === 100);
                  } else error(r.error);
                })
              }
            >
              {t("moreLooks")}
            </button>
          )}
          {trash.length > 0 && (
            <details>
              <summary>{t("archived")}</summary>
              {moreArchived && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const after = [...trash]
                        .sort((a, b) => a.id.localeCompare(b.id))
                        .at(-1)?.id;
                      if (!after) return;
                      const r = await loadInstantWardrobe(locale, {
                        archived: true,
                        after,
                      });
                      if (r.ok) {
                        setTrash((old) => [
                          ...old,
                          ...r.value.filter(
                            (v) => !old.some((o) => o.id === v.id),
                          ),
                        ]);
                        setMoreArchived(r.value.length === 100);
                      } else error(r.error);
                    })
                  }
                >
                  {t("moreLooks")}
                </button>
              )}
              <ul>
                {trash.map((row) => (
                  <li key={row.id} id={`instant-${row.id}`}>
                    <span>{row.name}</span>
                    <button
                      type="button"
                      disabled={pending || !confirmed}
                      onClick={() => start(() => mutate(row, "restore"))}
                    >
                      {t("restore")}
                    </button>
                    <button
                      type="button"
                      disabled={pending || !confirmed}
                      onClick={() => start(() => mutate(row, "delete"))}
                    >
                      {t("delete")}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </section>
  );
}
function InstantProduct({
  variants,
  locale,
  currency,
  disabled,
  modelId,
  selectedIds,
  choose,
  more,
}: {
  variants: FittingProduct[];
  locale: "fa" | "tr" | "en";
  currency: "IRT" | "TRY" | "CAD";
  disabled: boolean;
  modelId: string;
  selectedIds: string[];
  choose: (id: string) => void;
  more: () => void;
}) {
  const t = useTranslations("instantFitting"),
    [selected, setSelected] = useState(
      variants.find(
        (v) => v.available && v.placements?.some((p) => p.model.id === modelId),
      )?.variantId ?? "",
    ),
    p = variants.find((v) => v.variantId === selected) ?? variants[0];
  return (
    <article className="moda-instant-product" data-product-id={p.productId}>
      <ResponsiveImage
        media={{
          url:
            p.placements?.find((layer) => layer.model.id === modelId)?.media
              .url ?? p.url,
          width: null,
          height: null,
          variants: {},
          blurDataUrl: null,
          altI18n: { [locale]: p.title },
          presentation: { fit: "contain" },
        }}
        locale={locale}
        role="catalog"
        sizes="120px"
        className="block aspect-[3/4]"
        imgClassName="h-full w-full object-contain"
      />
      <div>
        <h3>{p.title}</h3>
        <p>
          {p.color} · {p.size}
        </p>
        <label>
          {t("variant")}
          <select
            className="input"
            aria-label={t("variant")}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{t("chooseVariant")}</option>
            {variants.map((v) => (
              <option
                key={v.variantId}
                value={v.variantId}
                disabled={!v.available || v.amount === null}
              >
                {v.color} · {v.size}
                {!v.available ? ` · ${t("unavailable")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <bdi>
          {p.amount
            ? formatStorefrontAmount(p.amount, currency, locale)
            : t("unavailable")}
        </bdi>
        <button
          type="button"
          disabled={disabled || !selected || !p.available || p.amount === null}
          data-moda4={
            p.placements?.some((layer) => layer.model.id === modelId)
              ? "tryon-item"
              : undefined
          }
          aria-pressed={selectedIds.includes(p.variantId)}
          onClick={() => choose(selected)}
        >
          {t("try")}
        </button>
        {variants.at(-1)?.nextCursor && (
          <button type="button" disabled={disabled} onClick={more}>
            {t("moreVariants")}
          </button>
        )}
      </div>
    </article>
  );
}
