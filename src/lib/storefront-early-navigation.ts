// This inline bootstrap must run before the parser reaches storefront links.
// A native navigation while the parser is active can stop execution of the
// inlined Flight scripts even when the document response finishes successfully.
// Keep Next Link, modifier clicks, downloads and native fragment links intact.
export const storefrontEarlyNavigation = String.raw`(() => {
  if (document.readyState !== "loading") return;
  let destination;

  function onClick(event) {
    if (
      document.readyState !== "loading" ||
      event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      !(event.target instanceof Element)
    ) return;

    const link = event.target.closest(".storefront-app a[href]");
    if (!link || link.hasAttribute("download") ||
        (link.target && link.target.toLowerCase() !== "_self")) return;

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^\/(fa|tr|en)(\/|$)/.test(url.pathname)) return;
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return;
    // A later click handled by Next Link takes precedence over a queued link.
    if (event.defaultPrevented) {
      destination = undefined;
      return;
    }

    event.preventDefault();
    destination = url.href;
  }

  window.addEventListener("click", onClick);
  document.addEventListener("readystatechange", () => {
    window.removeEventListener("click", onClick);
    if (destination) {
      // Let the parser and the framework finish their synchronous callbacks.
      setTimeout(() => location.assign(destination), 0);
    }
  }, { once: true });
})();`;
