// Copies the self-hosted webfont files we ship out of the @fontsource-variable
// packages into public/fonts/. The output is committed to the repo so the
// image build and a fresh clone do not depend on npm. Re-run this after
// bumping the @fontsource-variable/* versions in package.json:
//
//   node scripts/vendor-fonts.mjs
//
// Both families are licensed under the SIL Open Font License 1.1; the LICENSE
// file from each package is copied alongside the woff2 files.

import { mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ pkg: string, out: string, files: string[] }[]} */
const families = [
  {
    pkg: "@fontsource-variable/vazirmatn",
    out: "vazirmatn",
    files: [
      "vazirmatn-arabic-wght-normal.woff2",
      "vazirmatn-latin-wght-normal.woff2",
      "vazirmatn-latin-ext-wght-normal.woff2",
    ],
  },
  {
    pkg: "@fontsource-variable/inter",
    out: "inter",
    files: [
      "inter-latin-wght-normal.woff2",
      "inter-latin-ext-wght-normal.woff2",
    ],
  },
];

for (const { pkg, out, files } of families) {
  const src = join(root, "node_modules", pkg);
  const dest = join(root, "public", "fonts", out);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(src, "LICENSE"), join(dest, "LICENSE"));
  for (const f of files) copyFileSync(join(src, "files", f), join(dest, f));
  console.log(`vendored ${files.length} file(s) + LICENSE → public/fonts/${out}`);
}
