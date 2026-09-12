import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { sourceForBuild, workerSource } from "@/modules/pwa/worker";
const origin = "https://shop.example";
type WorkerEvent = {
  request?: Request;
  data?: unknown;
  source?: { id: string; postMessage: ReturnType<typeof vi.fn> };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (response: Promise<Response>) => void;
};
function harness(source = workerSource) {
  const handlers: Record<string, (event: WorkerEvent) => void> = {};
  const data = new Map<string, Map<string, Response>>();
  const key = (value: Request | string) =>
    new URL(typeof value === "string" ? value : value.url, origin).href;
  const caches = {
    keys: async () => [...data.keys()],
    delete: async (name: string) => data.delete(name),
    open: async (name: string) => {
      if (!data.has(name)) data.set(name, new Map());
      const map = data.get(name)!;
      return {
        put: async (url: Request | string, response: Response) => {
          map.set(key(url), response.clone());
        },
        match: async (url: Request | string) => map.get(key(url))?.clone(),
        keys: async () => [...map.keys()].map((url) => new Request(url)),
        delete: async (url: Request | string) => map.delete(key(url)),
      };
    },
  };
  const windows = [{ id: "one", url: origin + "/fa" }];
  const skipWaiting = vi.fn(),
    claim = vi.fn();
  const fetch = vi.fn(
    async () =>
      new Response("public bytes", {
        headers: {
          "cache-control": "public, max-age=300",
          "x-hoda-public-offline": "1",
        },
      }),
  );
  runInNewContext(source, {
    self: {
      location: { origin },
      clients: { claim, matchAll: async () => windows },
      skipWaiting,
      addEventListener: (name: string, fn: (e: WorkerEvent) => void) => {
        handlers[name] = fn;
      },
    },
    caches,
    fetch,
    URL,
    Request,
    Response,
    Promise,
  });
  async function dispatch(name: string, fields: Partial<WorkerEvent> = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers[name]({
      ...fields,
      waitUntil: (p) => pending.push(p),
      respondWith: (p) => {
        response = p;
      },
    });
    const result = await response;
    while (pending.length) await Promise.all(pending.splice(0));
    return result;
  }
  const request = (path: string, init?: RequestInit) =>
    new Request(new URL(path, origin), init);
  const navigate = (path: string) => {
    const r = request(path);
    Object.defineProperty(r, "mode", { value: "navigate" });
    return r;
  };
  const stored = () => [...data.values()].flatMap((m) => [...m.keys()]);
  return {
    data,
    caches,
    windows,
    skipWaiting,
    claim,
    fetch,
    dispatch,
    request,
    navigate,
    stored,
  };
}
describe("public-only PWA worker", () => {
  it("prepares exactly three generic offline documents with no cookies", async () => {
    const h = harness();
    await h.dispatch("install");
    expect(h.stored()).toHaveLength(3);
    expect(h.skipWaiting).not.toHaveBeenCalled();
    for (const call of h.fetch.mock.calls as unknown as Array<
      [string, RequestInit]
    >)
      expect(call[1].credentials).toBe("omit");
  });
  it("rejects redirects/private/offline pages without the public marker", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(
      new Response("login", { headers: { "cache-control": "private" } }),
    );
    await expect(h.dispatch("install")).rejects.toThrow("INVALID_OFFLINE_PAGE");
    expect(h.stored()).toHaveLength(0);
  });
  it.each([
    "/api/customer",
    "/api/orders/IR-1/invoices/1",
    "/media/receipts/a.png",
    "/admin",
    "/fa/cart",
    "/tr/checkout?step=3",
    "/en/account",
    "/en/orders/CA-1/pay",
    "/fa/returns",
    "/fa/p/item?_rsc=token",
    "/_next/image?url=private",
    "/_next/static/a.js?token=x",
    "https://other.example/_next/static/a.js",
  ])("does not cache or intercept %s fetch", async (path) => {
    const h = harness();
    expect(
      await h.dispatch("fetch", { request: h.request(path) }),
    ).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.stored()).toHaveLength(0);
  });
  it("never intercepts transactional POST", async () => {
    const h = harness();
    expect(
      await h.dispatch("fetch", {
        request: h.request("/fa/checkout", { method: "POST", body: "private" }),
      }),
    ).toBeUndefined();
    expect(h.stored()).toHaveLength(0);
  });
  it("does not cache authenticated or range requests to static paths", async () => {
    const h = harness();
    const examples: Record<string, string>[] = [
      { authorization: "Bearer private" },
      { range: "bytes=0-10" },
    ];
    for (const headers of examples)
      await h.dispatch("fetch", {
        request: h.request("/_next/static/a.js", {
          headers,
        }),
      });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("caches only safe immutable public assets, fetched without credentials", async () => {
    const h = harness();
    const r = h.request("/_next/static/chunks/abc.js");
    await h.dispatch("fetch", { request: r });
    await h.dispatch("fetch", { request: r });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect((h.fetch.mock.calls[0] as unknown as [Request])[0].credentials).toBe(
      "omit",
    );
  });
  it.each<Record<string, string>>([
    { "cache-control": "private" },
    { "cache-control": "no-store" },
    { vary: "Cookie" },
    { vary: "Authorization" },
    { vary: "*" },
    { "set-cookie": "session=private" },
  ])("refuses private asset responses %j", async (headers) => {
    const h = harness();
    h.fetch.mockResolvedValue(new Response("private", { headers }));
    await h.dispatch("fetch", { request: h.request("/_next/static/abc.js") });
    expect(h.stored()).toHaveLength(0);
  });
  it("bounds concurrent cache writes and preserves offline documents", async () => {
    const h = harness();
    await h.dispatch("install");
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        h.dispatch("fetch", { request: h.request(`/_next/static/${i}.js`) }),
      ),
    );
    expect(h.stored()).toHaveLength(64);
    expect(h.stored().filter((s) => s.includes("/offline"))).toHaveLength(3);
  });
  it.each(["fa", "tr", "en"])(
    "returns generic %s offline fallback without URL or sensitive response",
    async (locale) => {
      const h = harness();
      await h.dispatch("install");
      h.fetch.mockRejectedValue(Error("offline"));
      const r = await h.dispatch("fetch", {
        request: h.navigate(`/${locale}/orders/private/pay?token=secret`),
      });
      expect(await r?.text()).toBe("public bytes");
      expect(
        h.stored().some((s) => s.includes("private") || s.includes("token")),
      ).toBe(false);
    },
  );
  it("preserves HTTP denial/maintenance instead of masking it as offline", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(new Response("maintenance", { status: 503 }));
    expect(
      (await h.dispatch("fetch", { request: h.navigate("/fa") }))?.status,
    ).toBe(503);
    expect(h.stored()).toHaveLength(0);
  });
  it("deletes only old application caches at activation", async () => {
    const h = harness();
    await h.dispatch("install");
    await h.caches.open("hoda-public-pwa-old");
    await h.caches.open("another-app");
    await h.dispatch("activate");
    expect(await h.caches.keys()).toContain("another-app");
    expect(await h.caches.keys()).not.toContain("hoda-public-pwa-old");
    expect(h.claim).toHaveBeenCalledOnce();
  });
  it("refuses to activate an update while another window or checkout is open", async () => {
    const h = harness(),
      source = { id: "one", postMessage: vi.fn() };
    h.windows.push({ id: "two", url: origin + "/fa/checkout" });
    await h.dispatch("message", { source, data: { type: "ACTIVATE_UPDATE" } });
    expect(h.skipWaiting).not.toHaveBeenCalled();
    expect(source.postMessage).toHaveBeenCalledWith({
      type: "UPDATE_DEFERRED",
    });
    h.windows.pop();
    h.windows[0].url = origin + "/fa/checkout";
    await h.dispatch("message", { source, data: { type: "ACTIVATE_UPDATE" } });
    expect(h.skipWaiting).not.toHaveBeenCalled();
    h.windows[0].url = origin + "/fa";
    await h.dispatch("message", { source, data: { type: "ACTIVATE_UPDATE" } });
    expect(h.skipWaiting).toHaveBeenCalledOnce();
  });
  it("refreshes only fixed public documents, ignores arbitrary cache instructions", async () => {
    const h = harness(),
      source = { id: "one", postMessage: vi.fn() };
    await h.dispatch("message", {
      source,
      data: { type: "REFRESH_PUBLIC_OFFLINE", url: "/api/private" },
    });
    expect(h.stored()).toHaveLength(3);
    expect(h.stored().every((s) => s.includes("/pwa/"))).toBe(true);
  });
  it("uses a different version for each production build", () => {
    expect(sourceForBuild("release1")).not.toEqual(sourceForBuild("release2"));
  });
});
