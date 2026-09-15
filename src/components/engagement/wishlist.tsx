"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  readWishlistAction,
  mergeWishlistAction,
  removeWishlistAction,
  publicCardsAction,
} from "@/app/[locale]/engagement-actions";
type Context = { marketId: string; locale: "fa" | "tr" | "en" };
export function storedIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (v): v is string =>
                typeof v === "string" && v.length > 0 && v.length <= 100,
            ),
          ),
        ].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
const WishlistContext = createContext<{
  ids: string[];
  busy: boolean;
  toggle: (id: string) => Promise<void>;
  context: Context;
} | null>(null);
export function EngagementProvider({
  context,
  children,
}: {
  context: Context;
  children: React.ReactNode;
}) {
  const t = useTranslations("engagement"),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(false),
    authenticated = useRef(false),
    locked = useRef(false);
  const key = `wishlist:${context.marketId}`;
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setIds([]);
    (async () => {
      const guest = storedIds(key);
      const result = await readWishlistAction(context);
      authenticated.current = result.authenticated;
      const merged =
        result.authenticated && guest.length
          ? await mergeWishlistAction(context, guest)
          : result;
      if (cancelled) return;
      if (result.authenticated) {
        setIds(merged.ids);
        try {
          localStorage.removeItem(key);
        } catch {}
      } else setIds(guest);
    })()
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, context.marketId, context.locale]); // Context is primitives, not component identity.
  const toggle = useCallback(
    async (id: string) => {
      if (locked.current || busy) return;
      locked.current = true;
      setBusy(true);
      setError(false);
      try {
        if (authenticated.current) {
          const result = ids.includes(id)
            ? await removeWishlistAction(context, id)
            : await mergeWishlistAction(context, [id]);
          setIds(result.ids);
        } else {
          const next = ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [id, ...ids].slice(0, 100);
          localStorage.setItem(key, JSON.stringify(next));
          setIds(next);
        }
      } catch {
        setError(true);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [busy, context, ids, key],
  );
  return (
    <WishlistContext.Provider value={{ ids, busy, toggle, context }}>
      {children}
      {error && (
        <p role="alert" className="shell py-3 text-error">
          {t("failed")}
        </p>
      )}
    </WishlistContext.Provider>
  );
}
export function WishlistHeart({ productId }: { productId: string }) {
  const state = useContext(WishlistContext),
    t = useTranslations("engagement");
  if (!state) return null;
  const selected = state.ids.includes(productId);
  return (
    <button
      type="button"
      className="m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-bg p-2"
      disabled={state.busy}
      aria-label={t(selected ? "removeWishlist" : "addWishlist")}
      data-product-id={productId}
      aria-pressed={selected}
      onClick={() => void state.toggle(productId)}
    >
      <span aria-hidden="true">{selected ? "♥" : "♡"}</span>
    </button>
  );
}
export function SavedProducts({
  recentProductId,
}: {
  recentProductId?: string;
}) {
  const state = useContext(WishlistContext),
    t = useTranslations("engagement"),
    [cards, setCards] = useState<Awaited<ReturnType<typeof publicCardsAction>>>(
      [],
    ),
    [error, setError] = useState(false),
    [loaded, setLoaded] = useState(false);
  const ids = state?.ids.join(",") ?? "",
    marketId = state?.context.marketId,
    locale = state?.context.locale;
  useEffect(() => {
    if (!marketId || !locale) return;
    let cancelled = false;
    setLoaded(false);
    setError(false);
    const key = `recently-viewed:${marketId}`;
    let wanted = ids.split(",").filter(Boolean);
    if (recentProductId) {
      wanted = storedIds(key)
        .filter((id) => id !== recentProductId)
        .slice(0, 12);
      try {
        localStorage.setItem(
          key,
          JSON.stringify([recentProductId, ...wanted].slice(0, 12)),
        );
      } catch {}
    }
    publicCardsAction({ marketId, locale }, wanted)
      .then((value) => {
        if (!cancelled) setCards(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ids, marketId, locale, recentProductId]);
  return (
    <section className="my-10">
      <h2 className="mb-5 text-2xl">
        {t(recentProductId ? "recent" : "wishlist")}
      </h2>
      {error ? (
        <p role="alert">{t("failed")}</p>
      ) : !loaded ? (
        <p role="status">{t("working")}</p>
      ) : !cards.length ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {cards.map((card) => (
            <li
              key={card.id}
              className="overflow-hidden rounded-token border bg-surface"
            >
              <Link className="block p-3" href={card.href}>
                {card.image && (
                  /* Public, generated media URLs; CSS reserves layout space. */ <img
                    src={card.image}
                    alt=""
                    loading="lazy"
                    width={360}
                    height={480}
                    className="aspect-[3/4] w-full object-cover"
                  />
                )}
                <h3 className="mt-3">{card.title}</h3>
                <p>{card.price}</p>
              </Link>
              <WishlistHeart productId={card.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
