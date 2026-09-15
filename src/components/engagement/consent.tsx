"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  analyticsPublicPath,
  consentValid,
  type AnalyticsIds,
} from "@/lib/consent";
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: ((...args: unknown[]) => void) & {
    queue?: unknown[][];
    callMethod?: (...args: unknown[]) => void;
    push?: unknown;
    loaded?: boolean;
    version?: string;
  };
};
export function Consent({
  marketId,
  ids,
}: {
  marketId: string;
  ids: AnalyticsIds;
}) {
  const t = useTranslations("consent"),
    path = usePathname(),
    key = `consent:${marketId}`,
    version = `1:${ids.ga4}:${ids.gtm}:${ids.meta}`;
  const [choice, setChoice] = useState<boolean | null>(null),
    [open, setOpen] = useState(false),
    loaded = useRef(false),
    loadedFor = useRef("");
  useEffect(() => {
    if (loaded.current && loadedFor.current !== key + version) {
      window.location.reload();
      return;
    }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      setChoice(consentValid(saved, version) ? saved.accepted : null);
    } catch {
      setChoice(null);
    }
  }, [key, version]);
  useEffect(() => {
    if (loaded.current && !analyticsPublicPath(path)) {
      window.location.reload();
      return;
    }
    if (choice !== true || loaded.current || !analyticsPublicPath(path)) return;
    const w = window as AnalyticsWindow;
    const add = (src: string) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      document.head.append(script);
    };
    if (ids.ga4 || ids.gtm) {
      w.dataLayer = w.dataLayer ?? [];
      w.gtag = function () {
        w.dataLayer!.push(arguments);
      };
      w.gtag("consent", "default", {
        analytics_storage: "granted",
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      });
    }
    if (ids.ga4) {
      w.gtag!("js", new Date());
      w.gtag!("config", ids.ga4, { send_page_view: false });
      add(`https://www.googletagmanager.com/gtag/js?id=${ids.ga4}`);
    }
    if (ids.gtm) {
      w.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
      add(`https://www.googletagmanager.com/gtm.js?id=${ids.gtm}`);
    }
    if (ids.meta) {
      const fbq: NonNullable<AnalyticsWindow["fbq"]> = function (
        ...args: unknown[]
      ) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      };
      fbq.queue = [];
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      w.fbq = fbq;
      fbq("init", ids.meta);
      add("https://connect.facebook.net/en_US/fbevents.js");
    }
    loaded.current = Boolean(ids.ga4 || ids.gtm || ids.meta);
    loadedFor.current = key + version;
  }, [choice, ids.ga4, ids.gtm, ids.meta, path, key, version]);
  useEffect(() => {
    if (
      choice !== true ||
      !loaded.current ||
      loadedFor.current !== key + version ||
      !analyticsPublicPath(path)
    )
      return;
    const w = window as AnalyticsWindow;
    w.gtag?.("event", "page_view", {
      page_location: window.location.origin + path,
      page_path: path,
      page_referrer: "",
    });
    w.fbq?.("track", "PageView");
  }, [choice, path, key, version]);
  useEffect(() => {
    // A full document navigation prevents already-loaded vendor scripts from
    // following the client router into an account or another consent context.
    const click = (event: MouseEvent) => {
      if (
        !loaded.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (
        event.target instanceof Element ? event.target.closest("a[href]") : null
      ) as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, location.href);
      if (
        url.origin !== location.origin ||
        (url.pathname === location.pathname && url.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      location.assign(url.href);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  function choose(accepted: boolean) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ accepted, version, at: Date.now() }),
      );
    } catch {}
    setChoice(accepted);
    setOpen(false);
    if (!accepted) {
      for (const entry of document.cookie.split(";")) {
        const name = entry.trim().split("=")[0];
        if (!/^(_ga|_gid|_gat|_fbp|_fbc)/.test(name)) continue;
        document.cookie = `${name}=;Max-Age=0;Path=/`;
        const parts = location.hostname.split(".");
        for (let i = 0; i < parts.length - 1; i++)
          document.cookie = `${name}=;Max-Age=0;Path=/;Domain=.${parts.slice(i).join(".")}`;
      }
      if (loaded.current) location.reload();
    }
  }
  return (
    <>
      <button
        type="button"
        className="m-4 min-h-11 underline"
        onClick={() => setOpen(true)}
      >
        {t("settings")}
      </button>
      {(choice === null || open) && (
        <section
          aria-label={t("title")}
          className="mx-auto my-4 grid max-w-2xl gap-3 rounded-token border bg-bg p-5 shadow-xl"
        >
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p>{t("description")}</p>
          <div className="flex flex-wrap gap-3">
            <button className="button" onClick={() => choose(false)}>
              {t("reject")}
            </button>
            <button className="button" onClick={() => choose(true)}>
              {t("accept")}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
