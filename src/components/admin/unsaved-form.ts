"use client";

import { useLayoutEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { registerUnsavedHistory } from "./unsaved-history";

function values(form: HTMLFormElement) {
  return JSON.stringify(
    [...new FormData(form)].map(([key, value]) => [
      key,
      typeof value === "string"
        ? value
        : [value.name, value.size, value.name ? value.lastModified : 0],
    ]),
  );
}

/** Warn before leaving edited shared admin forms; never writes or auto-saves. */
export function useUnsavedForm(state: ActionResult | null, message: string) {
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!formRef.current) return;
    if (baseline.current === null) {
      // Capture the rendered defaults, including when typing starts before
      // hydration. Reset only a detached clone, never the customer's form.
      const initial = formRef.current.cloneNode(true) as HTMLFormElement;
      HTMLFormElement.prototype.reset.call(initial);
      baseline.current = values(initial);
    } else if (state?.ok) baseline.current = values(formRef.current);
  }, [state]);

  useLayoutEffect(() => {
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
    const unregister = registerUnsavedHistory({
      dirty,
      confirm: () => {
        const accepted = window.confirm(message);
        if (accepted) confirmedNavigation = true;
        return accepted;
      },
    });
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [message]);
  return formRef;
}
