"use client";

import { useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-result";

function values(form: HTMLFormElement) {
  return JSON.stringify(
    [...new FormData(form)].map(([key, value]) => [
      key,
      typeof value === "string"
        ? value
        : [value.name, value.size, value.lastModified],
    ]),
  );
}

/** Warn before leaving edited shared admin forms; never writes or auto-saves. */
export function useUnsavedForm(state: ActionResult | null, message: string) {
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (formRef.current && (baseline.current === null || state?.ok))
      baseline.current = values(formRef.current);
  }, [state]);

  useEffect(() => {
    let confirmedNavigation = false;
    const dirty = () =>
      Boolean(
        formRef.current &&
        baseline.current !== null &&
        values(formRef.current) !== baseline.current,
      );
    const unload = (event: BeforeUnloadEvent) => {
      if (confirmedNavigation) return;
      if (!dirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !dirty()
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin === window.location.origin &&
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else confirmedNavigation = true;
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [message]);
  return formRef;
}
