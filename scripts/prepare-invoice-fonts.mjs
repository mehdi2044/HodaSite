import { createRequire } from 'node:module';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('@fontsource-variable/vazirmatn/package.json'));
const target = path.resolve('public/invoice-fonts');
await mkdir(target, { recursive: true });
for (const subset of ['arabic', 'latin', 'latin-ext']) {
  const name = `vazirmatn-${subset}-wght-normal.woff2`;
  await copyFile(path.join(root, 'files', name), path.join(target, name));
}

const inter = path.dirname(require.resolve('@fontsource-variable/inter/package.json'));
for (const subset of ['latin', 'latin-ext']) {
  const name = `inter-${subset}-wght-normal.woff2`;
  await copyFile(path.join(inter, 'files', name), path.join(target, name));
}
