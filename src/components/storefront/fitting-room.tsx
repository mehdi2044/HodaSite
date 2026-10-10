"use client";
import { useState, useEffect, useRef } from "react";
import { ResponsiveImage } from "./responsive-image";
import {
  formatCatalogCurrency,
  formatServiceUnits,
} from "@/modules/catalog/format";
export type FittingProduct = {
  variantId: string;
  productId: string;
  title: string;
  color: string;
  hex: string;
  size: string;
  gender: string;
  slot: string | null;
  url: string;
  amount: string | null;
  owned: boolean;
  available: boolean;
};
export type FittingModel = {
  id: string;
  label: string;
  kind: string;
  url: string;
};
type Session = {
  id: string;
  status: string;
  imageUrl: string | null;
  savedName?: string | null;
};
type Result = {
  ok: boolean;
  error?: string;
  session?: Session;
  balance?: string;
  id?: string;
};
export function FittingRoom({
  models,
  products,
  ownedProducts,
  locale,
  currency,
  costCoins,
  balance: initialBalance,
  dailyExpires,
  labels,
  generate,
  readSession,
  save,
  addToBag,
  saved = [],
}: {
  models: FittingModel[];
  products: FittingProduct[];
  ownedProducts: FittingProduct[];
  locale: "fa" | "tr" | "en";
  currency: "USD" | "CAD" | "TRY" | "IRT";
  costCoins: string;
  balance: string;
  dailyExpires: string | null;
  labels: Record<string, string>;
  generate: (input: {
    requestKey: string;
    modelId: string;
    variantIds: string[];
    confirm: true;
    expectedCostCoins: string;
  }) => Promise<Result>;
  readSession: (id: string) => Promise<Result>;
  save: (id: string, name: string) => Promise<Result>;
  addToBag: (ids: string[]) => Promise<Result>;
  saved?: { id: string; name: string | null; imageUrl: string }[];
}) {
  const [modelId, setModelId] = useState(models[0]?.id ?? ""),
    [source, setSource] = useState<"shop" | "wardrobe">("shop"),
    [selection, setSelection] = useState<string[]>([]),
    [balance, setBalance] = useState(initialBalance),
    [session, setSession] = useState<Session | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [savedLooks, setSaved] = useState(saved);
  const pending = useRef<Parameters<typeof generate>[0] | null>(null);
  const model = models.find((m) => m.id === modelId),
    gender =
      model?.kind === "WOMAN"
        ? "WOMEN"
        : model?.kind === "MAN"
          ? "MEN"
          : "KIDS";
  const all = [
    ...products,
    ...ownedProducts.filter(
      (v) => !products.some((p) => p.variantId === v.variantId),
    ),
  ];
  const selected = selection
    .map((id) => all.find((p) => p.variantId === id))
    .filter((v): v is FittingProduct => !!v);
  const candidates = (source === "shop" ? products : ownedProducts).filter(
    (p) => p.gender === gender || p.gender === "UNISEX",
  );
  const groups = [...new Set(candidates.map((p) => p.productId))].map((id) =>
    candidates.filter((p) => p.productId === id),
  );
  const inProgress =
    session && ["QUEUED", "RUNNING", "REVIEW"].includes(session.status);
  const locked = busy || !!inProgress || !!pending.current;
  useEffect(() => {
    if (!session || !["QUEUED", "RUNNING", "REVIEW"].includes(session.status))
      return;
    let live = true;
    const poll = async () => {
      try {
        const r = await readSession(session.id);
        if (live && r.ok) {
          if (r.session) setSession(r.session);
          if (r.balance) setBalance(r.balance);
        }
      } catch {}
    };
    const timer = setInterval(poll, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session, readSession]);
  function changeModel(id: string) {
    setModelId(id);
    setSelection([]);
    setSession(null);
    setError("");
  }
  function select(productId: string, variantId: string) {
    setSelection((ids) => [
      ...ids.filter(
        (id) => all.find((p) => p.variantId === id)?.productId !== productId,
      ),
      variantId,
    ]);
    setSession(null);
    setMessage("");
  }
  function removeProduct(productId: string) {
    setSelection((ids) =>
      ids.filter(
        (id) => all.find((v) => v.variantId === id)?.productId !== productId,
      ),
    );
    setSession(null);
    setMessage("");
    setError("");
  }
  async function create() {
    setBusy(true);
    setError("");
    pending.current ??= {
      requestKey: crypto.randomUUID(),
      modelId,
      variantIds: selection,
      confirm: true,
      expectedCostCoins: costCoins,
    };
    try {
      const r = await generate(pending.current);
      if (r.ok && r.id) {
        setSession({ id: r.id, status: "QUEUED", imageUrl: null });
        pending.current = null;
        const next = await readSession(r.id);
        if (next.ok) {
          if (next.session) setSession(next.session);
          if (next.balance) setBalance(next.balance);
        }
      } else {
        setError(labels[`error_${r.error}`] ?? labels.error);
        if (r.error !== "REQUEST_UNKNOWN") pending.current = null;
      }
    } catch {
      setError(labels.requestUnknown);
    } finally {
      setBusy(false);
    }
  }
  const coins = (v: string) => formatServiceUnits(v, locale);
  return (
    <section className="fitting-room" data-testid="fitting-room">
      <header className="fitting-heading">
        <div>
          <p className="shop-eyebrow">{labels.eyebrow}</p>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <div className="fitting-wallet">
          <span>{labels.balance}</span>
          <strong>
            {coins(balance)} <small>{labels.coins}</small>
          </strong>
          {dailyExpires && (
            <small>
              {labels.dailyExpiry} ·{" "}
              {new Intl.DateTimeFormat(locale, {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(dailyExpires))}
            </small>
          )}
          <a href={`/${locale}/fitting-room/coins`}>{labels.buyCoins} ↗</a>
        </div>
      </header>
      <div className="fitting-layout">
        <div className="fitting-stage">
          <div className="fitting-models" aria-label={labels.models}>
            {models.map((m) => (
              <button
                key={m.id}
                disabled={locked}
                aria-pressed={modelId === m.id}
                onClick={() => changeModel(m.id)}
              >
                <FittingImage src={m.url} alt="" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          <div className="fitting-portrait">
            {(session?.imageUrl || model?.url) && (
              <FittingImage
                src={session?.imageUrl ?? model!.url}
                alt={session?.imageUrl ? labels.generated : model?.label}
              />
            )}
            <span className="fitting-image-badge">
              {session?.imageUrl ? labels.generated : labels.modelReference}
            </span>
          </div>
          <p className="fitting-disclosure">{labels.imageHelp}</p>
          {session && (
            <p role="status" className="fitting-status">
              {labels[`status_${session.status}`] ?? session.status}
            </p>
          )}
          {session?.status === "DONE" && (
            <div className="fitting-save">
              <label>
                {labels.lookName}
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </label>
              <button
                className="button"
                disabled={!name.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await save(session.id, name);
                    if (r.ok) {
                      setMessage(labels.saved);
                      setSaved((looks) => [
                        { id: session.id, name, imageUrl: session.imageUrl! },
                        ...looks.filter((l) => l.id !== session.id),
                      ]);
                    } else setError(labels.error);
                  } catch {
                    setError(labels.error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {labels.saveLook}
              </button>
            </div>
          )}
        </div>
        <div className="fitting-builder">
          <nav className="fitting-source">
            <button
              aria-pressed={source === "shop"}
              onClick={() => setSource("shop")}
            >
              {labels.shop}
            </button>
            <button
              aria-pressed={source === "wardrobe"}
              onClick={() => setSource("wardrobe")}
            >
              {labels.wardrobe}
            </button>
          </nav>
          <p className="text-muted text-sm">
            {source === "wardrobe" ? labels.wardrobeHelp : labels.selectionHelp}
          </p>
          <div className="fitting-products">
            {groups.length ? (
              groups.map((group) => {
                const chosen = selected.find(
                    (p) => p.productId === group[0].productId,
                  ),
                  item = chosen ?? group[0];
                return (
                  <article
                    key={item.productId}
                    className={
                      chosen ? "fitting-product is-selected" : "fitting-product"
                    }
                  >
                    <FittingImage src={item.url} alt={item.title} />
                    <div>
                      <h3>{item.title}</h3>
                      <p>
                        {item.owned
                          ? labels.owned
                          : item.amount
                            ? formatCatalogCurrency(
                                item.amount,
                                currency,
                                locale,
                              )
                            : labels.priceUnavailable}
                      </p>
                      <label>
                        {labels.colorSize}
                        <select
                          className="input"
                          disabled={
                            locked || (!chosen && selection.length >= 4)
                          }
                          aria-label={`${labels.colorSize} ${item.title}`}
                          value={chosen?.variantId ?? ""}
                          onChange={(e) =>
                            e.target.value
                              ? select(item.productId, e.target.value)
                              : removeProduct(item.productId)
                          }
                        >
                          <option value="">{labels.choose}</option>
                          {group.map((v) => (
                            <option
                              key={v.variantId}
                              disabled={!v.owned && !v.available}
                              value={v.variantId}
                            >
                              {v.color} · {v.size}
                              {!v.owned && !v.available
                                ? ` · ${labels.unavailable}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </article>
                );
              })
            ) : (
              <p>{labels.emptyWardrobe}</p>
            )}
          </div>
          <div className="fitting-selection">
            <h2>
              {labels.selection} <span>{selected.length}/4</span>
            </h2>
            {selected.map((p) => (
              <div className="fitting-chip" key={p.variantId}>
                <span style={{ background: p.hex }} />
                <p>
                  {p.title}
                  <small>
                    {p.color} · {p.size}
                    {p.owned ? ` · ${labels.owned}` : ""}
                  </small>
                </p>
                <button
                  aria-label={`${labels.remove} ${p.title}`}
                  disabled={locked}
                  onClick={() => {
                    setSelection((ids) =>
                      ids.filter((id) => id !== p.variantId),
                    );
                    setSession(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <p>
              {labels.cost}{" "}
              <b>
                {coins(costCoins)} {labels.coins}
              </b>
            </p>
            <p className="text-muted text-sm">{labels.chargeHelp}</p>
            <button
              className="button fitting-generate"
              disabled={busy || !!inProgress || !modelId || !selection.length}
              onClick={create}
            >
              {busy
                ? labels.working
                : pending.current
                  ? labels.retry
                  : labels.generate}{" "}
              · {coins(costCoins)} {labels.coins}
            </button>
            {selected.some((p) => !p.owned) && (
              <button
                className="fitting-add"
                disabled={
                  busy ||
                  selected.filter((p) => !p.owned).some((p) => !p.available)
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await addToBag(
                      selected.filter((p) => !p.owned).map((p) => p.variantId),
                    );
                    r.ok ? setMessage(labels.added) : setError(labels.error);
                  } catch {
                    setError(labels.error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {labels.addNew} ↗
              </button>
            )}
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
          </div>
        </div>
      </div>
      {savedLooks.length > 0 && (
        <section className="fitting-saved">
          <h2>{labels.savedLooks}</h2>
          <div>
            {savedLooks.map((l) => (
              <figure key={l.id}>
                <FittingImage
                  src={l.imageUrl}
                  alt={l.name ?? labels.generated}
                />
                <figcaption>{l.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function FittingImage({ src, alt }: { src: string; alt?: string }) {
  return (
    <ResponsiveImage
      media={{
        url: src,
        variants: {},
        width: null,
        height: null,
        blurDataUrl: null,
        altI18n: { fa: alt ?? "", tr: alt ?? "", en: alt ?? "" },
      }}
      locale="en"
      sizes="(max-width: 760px) 100vw, 50vw"
      className="fitting-image"
      imgClassName="h-full w-full object-contain"
    />
  );
}
