"use client";
type Subscriber = {
  visible: boolean;
  pending: () => boolean;
  refresh: () => void;
};
const subscribers = new Set<Subscriber>();
let timer: ReturnType<typeof setInterval> | undefined;
function tick() {
  if (document.hidden || [...subscribers].some((item) => item.pending()))
    return;
  [...subscribers].find((item) => item.visible)?.refresh();
}
function schedule() {
  const active =
    !document.hidden && [...subscribers].some((item) => item.visible);
  if (active && !timer) timer = setInterval(tick, 2000);
  if (!active && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
function resume() {
  schedule();
  tick();
}
/** One refresh for all visible scenes; stop entirely offscreen/hidden. */
export function subscribeSceneRefresh(subscriber: Subscriber) {
  if (!subscribers.size) {
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
  }
  subscribers.add(subscriber);
  schedule();
  return {
    visible(value: boolean) {
      subscriber.visible = value;
      schedule();
    },
    dispose() {
      subscribers.delete(subscriber);
      schedule();
      if (!subscribers.size) {
        window.removeEventListener("focus", resume);
        document.removeEventListener("visibilitychange", resume);
      }
    },
  };
}
