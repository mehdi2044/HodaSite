// Isolated visual prototype: no app router, database, credentials or providers.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, ".design-preview");
const require = createRequire(import.meta.url);
const bundledRequire = createRequire(require.resolve("tsx/package.json"));
const bundler = bundledRequire("esbuild") as {
  build(options: {
    entryPoints: string[];
    bundle: boolean;
    outfile: string;
    format: string;
    jsx: string;
    define: Record<string, string>;
  }): Promise<unknown>;
};
await mkdir(output, { recursive: true });
await bundler.build({
  entryPoints: [path.join(root, "previews/design-01/preview.tsx")],
  bundle: true,
  outfile: path.join(output, "preview.js"),
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
await writeFile(
  path.join(output, "baseline.css"),
  await readFile(path.join(root, "src/styles/tokens.css")),
);
const routes: Record<string, string> = {
  "/": "previews/design-01/index.html",
  "/preview.css": "previews/design-01/preview.css",
  "/preview.js": ".design-preview/preview.js",
  "/baseline.css": ".design-preview/baseline.css",
  "/hero-fa.html": "previews/design-01/hero-fa.html",
  "/hero-tr.html": "previews/design-01/hero-tr.html",
  "/hero-en.html": "previews/design-01/hero-en.html",
};
for (const language of ["fa", "tr", "en"])
  for (const width of [390, 1280])
    routes[`/current-${language}-${width}.png`] =
      `previews/design-01/evidence/hoda63-current-${language}-${width}.png`;
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const port = Number(process.env.DESIGN_PREVIEW_PORT ?? "4310");
createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const relative =
      routes[pathname] ??
      (pathname.startsWith("/assets/")
        ? `prisma/demo-assets/${pathname.slice(8)}`
        : pathname.startsWith("/fonts/")
          ? `public${pathname}`
          : null);
    if (!relative || relative.split("/").includes("..")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = await readFile(path.join(root, relative));
    res.writeHead(200, {
      "content-type":
        types[path.extname(relative)] ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `DESIGN-01.1 prototype: http://127.0.0.1:${port} (local environment only; no backend)`,
  ),
);
