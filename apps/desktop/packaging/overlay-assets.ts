import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(desktop, 'dist', 'src', 'overlay');

const FILES: readonly (readonly [string, string])[] = [
  ['src/overlay/page/overlay.html', 'overlay.html'],
  ['src/overlay/kwin/overlay.js', 'overlay-kwin.js'],
];

await mkdir(target, { recursive: true });
for (const [source, name] of FILES) {
  await copyFile(path.join(desktop, source), path.join(target, name));
}
