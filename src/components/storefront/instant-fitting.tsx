"use client";
import Link from "next/link";
import Decimal from "decimal.js";
import { ResponsiveImage } from "./responsive-image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ResponsiveImageMedia } from "./responsive-image";
import { InstantFittingGallery } from "./instant-fitting-gallery";
import { InstantFittingStage } from "./instant-fitting-stage";
import {
  formatCartAmount,
  formatStorefrontAmount,
} from "@/modules/catalog/format";
import {
  INSTANT_COMPOSITION_CAPACITY,
  instantSelectionSchema,
  instantSnapshotSchema,
} from "@/modules/fitting/instant-contract";
import { validCompositionSlots } from "@/modules/catalog/cutouts/contracts";
import { sameFittingMarket } from "@/modules/fitting/market-context";
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
  paidAvailable = false,
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
  paidAvailable?: boolean;
}) {
  const t = useTranslations("instantFitting"),
    Heading = primaryHeading ? "h1" : "h2";
  const [modelId, setModel] = useState(models[0]?.id ?? ""),
    [catalog, setCatalog] = useState(products),
    [moreSaved, setMoreSaved] = useState(saved.length === 100),
    [moreArchived, setMoreArchived] = useState(archived.length === 100),
    [view, setView] = useState<View | null>(null),
    [localLayers, setLocalLayers] = useState<View["layers"] | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [draftReady, setDraftReady] = useState(false),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    [rows, setRows] = useState(saved),
    [trash, setTrash] = useState(archived),
    [editing, setEditing] = useState<{ id: string; version: number } | null>(
      null,
    ),
    [review, setReview] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const sequence = useRef(0),
    requestKey = useRef(""),
    root = useRef<HTMLElement>(null);
  async function loadCatalog(input: Parameters<typeof loadInstantCatalog>[1]) {
    const result = await loadInstantCatalog(locale, input);
    if (!result.ok) return result;
    if (
      !sameFittingMarket({ marketId, currency, locale }, result.value.context)
    )
      return { ok: false as const, error: "INVALID_SELECTION" };
    return { ok: true as const, value: result.value.products };
  }
  async function preview(input: Parameters<typeof previewInstant>[1]) {
    const result = await previewInstant(locale, input);
    if (!result.ok) return result;
    if (
      !sameFittingMarket({ marketId, currency, locale }, result.value.context)
    )
      return { ok: false as const, error: "INVALID_SELECTION" };
    return { ok: true as const, value: result.value.selection };
  }
  const draftKey = `hoda.instant:${marketId}:${customerId ?? "guest"}`;
  const model = models.find((m) => m.id === modelId);
  const receiptRows = ids.map((id) => ({
    id,
    product: catalog.find((item) => item.variantId === id),
  }));
  const subtotal = receiptRows.every(({ product }) => product?.amount != null)
    ? receiptRows.reduce(
        (sum, { product }) => sum.plus(product!.amount!),
        new Decimal(0),
      )
    : null;
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
          preview({ modelId, variantIds: ids }),
          loadCatalog({ variantIds: ids }),
        ]);
        if (!active || seq !== sequence.current) return;
        if (current.ok)
          setCatalog((old) =>
            old.map((item) =>
              ids.includes(item.variantId)
                ? (current.value.find(
                    (v) => v.variantId === item.variantId,
                  ) ?? {
                    ...item,
                    amount: null,
                    available: false,
                    placements: [],
                  })
                : item,
            ),
          );
        if (!next.ok) {
          const layers = current.ok
            ? current.value.flatMap(
                (item) =>
                  item.placements?.filter(
                    (layer) => layer.model.id === modelId,
                  ) ?? [],
              )
            : [];
          setLocalLayers(validCompositionSlots(layers) ? layers : []);
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
  function mergeCatalog(
    next: FittingProduct[],
    {
      refreshedIds = [],
      replaceVariantPages = false,
    }: {
      refreshedIds?: string[];
      replaceVariantPages?: boolean;
    } = {},
  ) {
    setCatalog((old) => {
      const merged = new Map(old.map((item) => [item.variantId, item]));
      const returned = new Set(next.map((item) => item.variantId));
      const pages = replaceVariantPages
        ? new Map(next.map((item) => [item.productId, item.nextCursor]))
        : new Map<string, string | null | undefined>();
      for (const item of old) {
        if (returned.has(item.variantId)) continue;
        if (refreshedIds.includes(item.variantId)) {
          merged.set(item.variantId, {
            ...item,
            amount: null,
            available: false,
            placements: [],
          });
        } else if (pages.has(item.productId)) {
          // A new first page replaces cached options. Keep the exact selected
          // variant while it may still be on a later page.
          if (!ids.includes(item.variantId)) merged.delete(item.variantId);
          else if (!pages.get(item.productId))
            merged.set(item.variantId, {
              ...item,
              amount: null,
              available: false,
              placements: [],
            });
        }
      }
      for (const item of next) merged.set(item.variantId, item);
      return [...merged.values()];
    });
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
      setLocalLayers([]);
      setReview(false);
      return;
    }
    const [result, current] = await Promise.all([
      preview({ modelId: nextModel, variantIds: nextIds }),
      loadCatalog({ variantIds: nextIds }),
    ]);
    if (seq !== sequence.current) return;
    if (current.ok) mergeCatalog(current.value, { refreshedIds: nextIds });
    setIds(nextIds);
    if (!result.ok) {
      const validLayers = current.ok
        ? current.value.flatMap(
            (item) =>
              item.placements?.filter(
                (layer) => layer.model.id === nextModel,
              ) ?? [],
          )
        : [];
      setLocalLayers(validCompositionSlots(validLayers) ? validLayers : []);
      setView(null);
      setReview(true);
      error(result.error);
      return;
    }
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
          start(async () => {
            try {
              await resolve(parsed.data.modelId, parsed.data.variantIds);
            } catch {
              error("REQUEST_UNKNOWN");
            } finally {
              setDraftReady(true);
            }
          });
          if (customerId) sessionStorage.removeItem(guestKey);
          return () => {
            sequence.current++;
          };
        }
      }
      if (customerId) sessionStorage.removeItem(guestKey);
    } catch {
      /* Storage is optional; no login or mutation depends on it. */
    }
    setDraftReady(true);
    return () => {
      sequence.current++;
    };
    // Component is keyed by verified owner/market/locale on the server.
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    try {
      if (ids.length)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ modelId, variantIds: ids }),
        );
      else sessionStorage.removeItem(draftKey);
    } catch {}
  }, [draftKey, draftReady, modelId, ids]);
  function remove(variantId: string) {
    requestKey.current = crypto.randomUUID();
    start(() =>
      resolve(
        modelId,
        ids.filter((id) => id !== variantId),
      ),
    );
  }

  async function choose(variantId: string) {
    requestKey.current = crypto.randomUUID();
    // Geometry was validated server-side for this exact public variant/model.
    // Paint synchronously, then let the existing live resolver authorize the selection.
    let next = catalog
      .find((p) => p.variantId === variantId)
      ?.placements?.find((p) => p.model.id === modelId);
    if (!next) {
      const single = await preview({
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
    if (keep.length >= INSTANT_COMPOSITION_CAPACITY) {
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
      className="moda-instant moda-fr12"
      data-testid="instant-fitting"
      aria-busy={pending}
    >
      <header className="moda-fr-heading">
        <div>
          <p className="eyebrow">{t("displayEyebrow")}</p>
          <Heading
            data-moda4-display=""
            lang="en"
            dir="ltr"
            aria-label={t("title")}
          >
            {t.rich("displayTitle", { em: (chunks) => <em>{chunks}</em> })}
          </Heading>
          <p className="moda-fr-subtitle">{t("displaySubtitle")}</p>
        </div>
        <div className="moda-fr-modes">
          <span className="moda-fr-mode" title={t("free")}>
            <span className="moda-fr-icon moda-fr-hanger" aria-hidden="true" />
            {t("instantMode")}
          </span>
          {paidAvailable && <a href="#fitting-paid">{t("paidMode")}</a>}
        </div>
      </header>
      {!models.length && <p>{t("noModels")}</p>}
      <ol className="moda-instant-howto">
        {["stepModel", "stepPick", "stepSave"].map((key, index) => (
          <li key={key}>
            <b>{new Intl.NumberFormat(locale).format(index + 1)}</b>
            {t(key)}
          </li>
        ))}
      </ol>
      <div className="moda-instant-workspace">
        <div>
          <fieldset disabled={pending}>
            <legend className="sr-only">{t("models")}</legend>
            <div className="moda-instant-models">
              {models.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  aria-pressed={modelId === m.id}
                  data-model-kind={m.kind}
                  onClick={() => {
                    if (m.id === modelId) return;
                    const compatible = ids.filter((id) =>
                      catalog
                        .find((p) => p.variantId === id)
                        ?.placements?.some((layer) => layer.model.id === m.id),
                    );
                    requestKey.current = crypto.randomUUID();
                    setModel(m.id);
                    setIds(compatible);
                    setView(null);
                    setLocalLayers(null);
                    setReview(false);
                    setEditing(null);
                    start(() => resolve(m.id, compatible));
                  }}
                >
                  {m.label[locale]}
                </button>
              ))}
            </div>
          </fieldset>

          <InstantFittingStage
            key={modelId}
            model={model}
            layers={
              localLayers ?? (view?.model.id === modelId ? view.layers : [])
            }
            frameMediaId={view?.snapshot.modelMediaId ?? modelId}
            locale={locale}
            canClear={!pending && ids.length > 0}
            animateRemovals={!review && (localLayers !== null || view !== null)}
            onClear={() => start(() => resolve(modelId, []))}
          />
        </div>
        <div className="moda-instant-catalog">
          <InstantFittingGallery
            initial={products}
            catalog={catalog}
            locale={locale}
            currency={currency}
            modelId={modelId}
            ids={ids}
            disabled={pending || !model}
            load={(input, onSuccess) =>
              start(async () => {
                try {
                  const result = await loadCatalog(input);
                  if (!result.ok) return error(result.error);
                  mergeCatalog(result.value, {
                    replaceVariantPages: !input.after,
                  });
                  onSuccess(result.value);
                } catch {
                  error("REQUEST_UNKNOWN");
                }
              })
            }
            choose={(id) => void choose(id)}
            remove={remove}
          />
          <section className="moda-fr31-receipt" aria-label={t("receiptTitle")}>
            <h3>
              {t("receiptTitle")}{" "}
              <span>
                {t("galleryCount", {
                  count: ids.length,
                  capacity: INSTANT_COMPOSITION_CAPACITY,
                })}
              </span>
            </h3>
            {!ids.length && (
              <p className="moda-fr31-empty">{t("receiptEmpty")}</p>
            )}
            <ul className="moda-instant-pieces">
              {receiptRows.map(({ id, product: p }) => {
                return (
                  <li key={id}>
                    {p && (
                      <span className="moda-fr31-thumb">
                        <ResponsiveImage
                          media={
                            p.placements?.find(
                              (layer) => layer.model.id === modelId,
                            )?.media ?? {
                              url: p.url,
                              width: null,
                              height: null,
                              variants: {},
                              blurDataUrl: null,
                              altI18n: {},
                            }
                          }
                          locale={locale}
                          sizes="38px"
                          imgClassName="moda-fr31-thumb-img"
                        />
                      </span>
                    )}
                    <span className="moda-fr31-row-copy">
                      <strong>{p?.title ?? t("unavailable")}</strong>
                      {p && (
                        <small>
                          {p.color} · <bdi>{p.size}</bdi>
                        </small>
                      )}
                    </span>
                    <bdi>
                      {p?.amount
                        ? formatStorefrontAmount(p.amount, currency, locale)
                        : t("unavailable")}
                    </bdi>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(id)}
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
            <div className="moda-fr31-total">
              <span>{t("receiptTotal")}</span>
              <bdi>
                {subtotal === null
                  ? t("unavailable")
                  : formatCartAmount(subtotal, currency, locale)}
              </bdi>
            </div>
            <p role="status">{message}</p>
            {customerId && (
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
              </div>
            )}
            <div className="moda-instant-actions">
              <button
                className="button"
                type="button"
                disabled={
                  pending ||
                  !view ||
                  !ids.length ||
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
              <button
                type="button"
                className="button moda-fr31-ai"
                disabled
                aria-describedby="instant-real-view-note"
              >
                {t("realView")}
              </button>
              {customerId ? (
                <button
                  className="button-outline"
                  type="button"
                  disabled={pending || !view || !ids.length || !name.trim()}
                  onClick={() => start(save)}
                >
                  {editing ? t("update") : t("save")}
                </button>
              ) : (
                <Link
                  className="button-outline"
                  href={`/${locale}/account/login?next=/${locale}/fitting-room`}
                >
                  {t("loginSave")}
                </Link>
              )}
            </div>
            <p id="instant-real-view-note" className="moda-fr31-empty">
              {t("realViewUnavailable")}
            </p>
          </section>
        </div>
      </div>
      <p className="moda-fr-disclaimer">{t("help")}</p>
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
