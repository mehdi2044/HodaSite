"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnline } from "./online";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PwaControls() {
  const t = useTranslations("pwa"),
    path = usePathname(),
    online = useOnline();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false),
    [ios, setIos] = useState(false);
  const [secure, setSecure] = useState(true),
    [dismissed, setDismissed] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [deferred, setDeferred] = useState(false);
  const acceptedUpdate = useRef(false);
  const home = /^\/(fa|tr|en)\/?$/.test(path);
  useEffect(() => {
    let disposed = false;
    const display = window.matchMedia("(display-mode: standalone)");
    const detect = () =>
      setStandalone(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    detect();
    display.addEventListener("change", detect);
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    setSecure(window.isSecureContext);
    try {
      setDismissed(
        Date.now() -
          Number(localStorage.getItem("hoda.install.dismissed") || 0) <
          7 * 86400000,
      );
    } catch {
      setDismissed(false);
    }
    const before = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const installed = () => {
      setStandalone(true);
      setInstall(null);
    };
    const changed = () => {
      if (acceptedUpdate.current) window.location.reload();
    };
    const message = (e: MessageEvent) => {
      if (e.data?.type === "UPDATE_DEFERRED") {
        acceptedUpdate.current = false;
        setDeferred(true);
      }
    };
    const preventOffline = (e: SubmitEvent) => {
      if (
        !navigator.onLine &&
        e.target instanceof HTMLFormElement &&
        e.target.method.toLowerCase() !== "get"
      )
        e.preventDefault();
    };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installed);
    document.addEventListener("submit", preventOffline, true);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      navigator.serviceWorker.addEventListener("message", message);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          if (disposed) return;
          setWaiting(reg.waiting);
          reg.active?.postMessage({ type: "REFRESH_PUBLIC_OFFLINE" });
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                !disposed &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaiting(reg.waiting);
            });
          });
          void reg.update().catch(() => {});
        })
        .catch(() => {
          /* Normal online shopping still works without SW support. */
        });
    }
    return () => {
      disposed = true;
      display.removeEventListener("change", detect);
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installed);
      document.removeEventListener("submit", preventOffline, true);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, []);
  async function promptInstall() {
    if (!install) return;
    try {
      await install.prompt();
      await install.userChoice;
    } catch {
      // Browser installation can be cancelled; manual instructions remain available.
    } finally {
      setInstall(null);
    }
  }
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("hoda.install.dismissed", String(Date.now()));
    } catch {}
  };
  return (
    <>
      {!online && (
        <div className="pwa-connection" role="status">
          {t("onlineRequired")}
        </div>
      )}
      {waiting && home && online && (
        <section className="shell pwa-update" aria-label={t("updateTitle")}>
          <p>{deferred ? t("updateDeferred") : t("updateBody")}</p>
          <button
            className="button"
            onClick={() => {
              acceptedUpdate.current = true;
              waiting.postMessage({ type: "ACTIVATE_UPDATE" });
            }}
          >
            {t("update")}
          </button>
        </section>
      )}
      {!standalone && (
        <section className="shell pwa-install" aria-label={t("installTitle")}>
          {home && install && !dismissed && online && (
            <div className="pwa-install-prompt">
              <div>
                <strong>{t("installTitle")}</strong>
                <p>{t("description")}</p>
              </div>
              <button className="button" onClick={() => void promptInstall()}>
                {t("install")}
              </button>
              <button className="pwa-dismiss" onClick={dismiss}>
                {t("later")}
              </button>
            </div>
          )}
          <details className="pwa-install-help">
            <summary>{t("installHelp")}</summary>
            {!secure ? (
              <p>{t("httpsRequired")}</p>
            ) : (
              <>
                <p>{t("description")}</p>
                {install && (
                  <button
                    className="button"
                    disabled={!online}
                    onClick={() => void promptInstall()}
                  >
                    {t("install")}
                  </button>
                )}
                <h3>{t(ios ? "iphone" : "android")}</h3>
                <p>{t(ios ? "iphoneHelp" : "androidHelp")}</p>
                <h3>{t(ios ? "android" : "iphone")}</h3>
                <p>{t(ios ? "androidHelp" : "iphoneHelp")}</p>
                <p className="text-sm text-muted">{t("offlinePrivacy")}</p>
              </>
            )}
          </details>
        </section>
      )}
    </>
  );
}
