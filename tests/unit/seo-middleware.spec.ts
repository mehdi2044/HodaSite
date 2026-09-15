import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
vi.mock("next-auth", () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}));
vi.mock("next-intl/middleware", () => ({
  default: () => (request: NextRequest) =>
    NextResponse.next({ request: { headers: request.headers } }),
}));
import middleware from "@/middleware";
const invoke = middleware as unknown as (
  request: NextRequest,
) => Promise<Response>;
beforeEach(() => {
  // Match next.config.ts and exercise NextRequest/NextResponse, not URL mocks.
  vi.stubEnv("__NEXT_NO_MIDDLEWARE_URL_NORMALIZE", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      Response.json(
        url.pathname === "/api/system/markets"
          ? {
              markets: [
                {
                  code: "IR",
                  isActive: true,
                  defaultLocale: "fa",
                  enabledLocales: ["fa"],
                },
                {
                  code: "TR",
                  isActive: true,
                  defaultLocale: "tr",
                  enabledLocales: ["tr", "en"],
                },
              ],
            }
          : { state: "off", effective: false, bypass: false },
      ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("SEO routing transport boundaries", () => {
  it("keeps rewrites on the request origin and forwards the route market over a conflicting cookie", async () => {
    const response = await invoke(
      new NextRequest("http://127.0.0.1:3000/fa/m/IR/p/dress", {
        headers: { cookie: "market=TR", "x-hoda-seo-market": "TR" },
      }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://127.0.0.1:3000/fa/p/dress",
    );
    expect(response.headers.get("x-middleware-request-x-hoda-seo-market")).toBe(
      "IR",
    );
    expect(response.headers.get("set-cookie")).toContain("market=IR;");
  });
  it("keeps explicit-market redirects on the same origin for PWA starts without cookies", async () => {
    const response = await invoke(
      new NextRequest("http://127.0.0.1:3000/en?market=TR"),
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/en/m/TR",
    );
  });
  it("does not forward a caller-supplied route market on legacy pages", async () => {
    const response = await invoke(
      new NextRequest("http://127.0.0.1:3000/tr", {
        headers: { "x-hoda-seo-market": "IR" },
      }),
    );
    expect(response.headers.has("x-middleware-request-x-hoda-seo-market")).toBe(
      false,
    );
  });
  it("rejects disabled canonical languages instead of falling back to a cookie market", async () => {
    const response = await invoke(
      new NextRequest("http://127.0.0.1:3000/fa/m/TR", {
        headers: { cookie: "market=IR" },
      }),
    );
    expect(response.status).toBe(404);
  });
});

it("preserves facets, cursor and attribution when an old slug redirects, excluding the routing market", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      Response.json(
        url.pathname === "/api/system/markets"
          ? {
              markets: [
                {
                  code: "TR",
                  isActive: true,
                  defaultLocale: "en",
                  enabledLocales: ["en"],
                },
              ],
            }
          : url.pathname === "/api/seo/redirect"
            ? { path: "/en/m/TR/c/new" }
            : { state: "off", effective: false, bypass: false },
      ),
    ),
  );
  const response = await invoke(
    new NextRequest(
      "http://127.0.0.1:3000/en/m/TR/c/old?brand=x&page=2&after=cuid1&utm_source=fixture&market=IR",
    ),
  );
  expect(response.status).toBe(301);
  const destination = new URL(response.headers.get("location")!);
  expect(destination.origin).toBe("http://127.0.0.1:3000");
  expect(destination.pathname).toBe("/en/m/TR/c/new");
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    brand: "x",
    page: "2",
    after: "cuid1",
    utm_source: "fixture",
  });
});
