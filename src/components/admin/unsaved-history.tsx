"use client";
import { useLayoutEffect } from "react";
const KEY = "__hodaAdminHistory";
type Mark = { session: string; index: number };
type Guard = { dirty: () => boolean; confirm: () => boolean };
// History bookkeeping only, not an authentication or authorization token.
function navigationSession() {
  return `${Date.now()}-${Math.random()}`;
}
type TrackingStore = { installed: boolean; guards: Set<Guard> };
function trackingStore() {
  const client = window as Window & {
    __hodaAdminHistoryTracking?: TrackingStore;
  };
  return (client.__hodaAdminHistoryTracking ??= {
    installed: false,
    guards: new Set<Guard>(),
  });
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function mark(value: unknown): Mark | null {
  const v = object(object(value)?.[KEY]);
  return typeof v?.session === "string" && Number.isSafeInteger(v.index)
    ? { session: v.session, index: v.index as number }
    : null;
}
function navigationIndex(): number | null {
  const value = (
    window as Window & { navigation?: { currentEntry?: { index?: number } } }
  ).navigation?.currentEntry?.index;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
/** Track all admin-created entries before editing; never add a sentinel entry. */
export function installAdminHistoryTracking() {
  const store = trackingStore();
  if (store.installed) return;
  store.installed = true;
  const originalPush = history.pushState.bind(history),
    originalReplace = history.replaceState.bind(history);
  let session = mark(history.state)?.session ?? navigationSession();
  let index = navigationIndex() ?? mark(history.state)?.index ?? 0;
  let currentState: unknown = history.state,
    currentUrl = location.href,
    restoreIndex: number | null = null;
  const stamp = (data: unknown, point: number) => ({
    ...object(data),
    [KEY]: { session, index: point },
  });
  originalReplace(stamp(currentState, index), "", currentUrl);
  currentState = history.state;
  history.pushState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    const point = index + 1;
    originalPush(stamp(data, point), unused, url);
    index = navigationIndex() ?? point;
    currentState = history.state;
    currentUrl = location.href;
  };
  history.replaceState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    originalReplace(stamp(data, index), unused, url);
    currentState = history.state;
    currentUrl = location.href;
  };
  window.addEventListener(
    "popstate",
    (event) => {
      const destination =
        navigationIndex() ??
        (mark(event.state)?.session === session
          ? mark(event.state)!.index
          : null);
      if (restoreIndex !== null) {
        // The compensating traversal must not reach Next's popstate handler.
        event.stopImmediatePropagation();
        if (destination === restoreIndex) restoreIndex = null;
        else if (destination !== null) history.go(restoreIndex - destination);
        else {
          restoreIndex = null;
          session = navigationSession();
          index = 0;
          originalPush(stamp(currentState, index), "", currentUrl);
          currentState = history.state;
        }
        return;
      }
      const previous = new URL(currentUrl),
        next = new URL(location.href);
      const guard =
        previous.pathname === next.pathname && previous.search === next.search
          ? undefined
          : [...store.guards].find((g) => g.dirty());
      if (guard && !guard.confirm()) {
        event.stopImmediatePropagation();
        if (destination !== null && destination !== index) {
          restoreIndex = index;
          history.go(index - destination);
        } else {
          // A pre-tracker entry in a browser without Navigation API has no
          // recoverable direction. Retain the live form and restore its URL;
          // no field values are persisted. Only this legacy fallback appends.
          session = navigationSession();
          index = 0;
          originalPush(stamp(currentState, index), "", currentUrl);
          currentState = history.state;
        }
        return;
      }
      if (destination === null) {
        session = navigationSession();
        index = 0;
        originalReplace(stamp(event.state, index), "", location.href);
      } else index = destination;
      currentState = history.state;
      currentUrl = location.href;
    },
    true,
  );
}
export function registerUnsavedHistory(guard: Guard) {
  installAdminHistoryTracking();
  const store = trackingStore();
  store.guards.add(guard);
  return () => {
    store.guards.delete(guard);
  };
}
export function AdminHistoryTracking() {
  useLayoutEffect(() => {
    installAdminHistoryTracking();
  }, []);
  return null;
}
