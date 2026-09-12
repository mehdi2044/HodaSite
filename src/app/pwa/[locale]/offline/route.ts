import { pwaPresentation, escapeHtml as e } from "@/modules/pwa/presentation";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const p = await pwaPresentation((await params).locale),
    t = p.copy;
  // Public generic document, deliberately outside the personalized Next layout.
  const html = `<!doctype html><html lang="${p.locale}" dir="${p.locale === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>${e(t.offlineTitle)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:${e(p.colors.background)};color:${e(p.colors.text)};font:18px/1.8 system-ui,sans-serif;padding:24px}main{width:min(100%,30rem)}h1{font-size:clamp(28px,7vw,42px);line-height:1.3}a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;margin-block:12px;border:2px solid currentColor;border-radius:999px;color:inherit;text-decoration:none}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}small{display:block}</style></head><body><main><p>${e(p.name)}</p><h1>${e(t.offlineTitle)}</h1><p>${e(t.offlineBody)}</p><a href="/${p.locale}">${e(t.retry)}</a><small>${e(t.offlinePrivacy)}</small></main></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Hoda-Public-Offline": "1",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
