import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

export interface ColourWorkerBundle {
  readonly script: string;
  readonly dispose: () => void;
}

export async function bundleColourWorker(): Promise<ColourWorkerBundle> {
  const folder = mkdtempSync(join(tmpdir(), 'colour-worker-'));
  const script = join(folder, 'colour-worker.mjs');
  await build({
    entryPoints: [
      fileURLToPath(new URL('../../../src/photos/edits/colour-worker.ts', import.meta.url)),
    ],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
  return {
    script,
    dispose: (): void => {
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

export interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function cornerOf(
  corners: readonly [Pixel, Pixel, Pixel, Pixel],
  at: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
): Pixel {
  const row = at.y < size.height / 2 ? 0 : 2;
  const column = at.x < size.width / 2 ? 0 : 1;
  return corners[row + column] ?? { r: 0, g: 0, b: 0 };
}

export async function quadrants(
  width: number,
  height: number,
  corners: readonly [Pixel, Pixel, Pixel, Pixel],
): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const corner = cornerOf(corners, { x, y }, { width, height });
      const at = (y * width + x) * 3;
      data[at] = corner.r;
      data[at + 1] = corner.g;
      data[at + 2] = corner.b;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

export async function rawOf(image: Buffer): Promise<{
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}> {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

export function pixelAt(
  raw: { readonly data: Buffer; readonly width: number; readonly channels: number },
  x: number,
  y: number,
): Pixel {
  const at = (y * raw.width + x) * raw.channels;
  return { r: raw.data[at] ?? -1, g: raw.data[at + 1] ?? -1, b: raw.data[at + 2] ?? -1 };
}
