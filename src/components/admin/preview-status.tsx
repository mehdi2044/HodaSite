"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Status = { buildSha: string; builtAt: string; contentRevision: string };

/** Only mounted for an authenticated, permitted operator on a preview build. */
export function PreviewStatus({ initial }: { initial: Status }) {
  const t = useTranslations("previewRuntime");
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState(initial);
  const [unavailable, setUnavailable] = useState(false);
  const revision = useRef(initial.contentRevision);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let sequence = 0;
    async function poll() {
      if (disposed || document.hidden) return;
      const turn = ++sequence;
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/admin/preview-status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("unavailable");
        const next: Status = await response.json();
        if (disposed || controller.signal.aborted || turn !== sequence) return;
        setStatus(next);
        setUnavailable(false);
        if (revision.current !== next.contentRevision) {
          revision.current = next.contentRevision;
          // Never refresh an editing form and discard an operator's draft.
          if (
            !pathname.startsWith("/admin") ||
            pathname.startsWith("/admin/preview/")
          )
            router.refresh();
        }
      } catch {
        if (!disposed && !controller.signal.aborted && turn === sequence)
          setUnavailable(true);
      } finally {
        if (!disposed && !document.hidden && turn === sequence)
          timer = setTimeout(poll, 2000);
      }
    }
    function visibility() {
      clearTimeout(timer);
      sequence++;
      request?.abort();
      if (!document.hidden) void poll();
    }
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility);
    };
  }, [pathname, router]);

  return (
    <aside aria-label={t("label")} className="preview-runtime">
      <strong>{t("label")}</strong> {t("build")}: <bdi>{status.buildSha}</bdi>
      {" · "}
      {t("builtAt")}: <bdi>{status.builtAt}</bdi>
      {" · "}
      {t("revision")}: <bdi data-preview-revision>{status.contentRevision}</bdi>
      {unavailable && <span role="status"> — {t("unavailable")}</span>}
    </aside>
  );
}
