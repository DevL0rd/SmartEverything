import { randomUUID } from 'node:crypto';
import type { PhotoBox, PhotoErase } from '@smarteverything/domain';
import sharp from 'sharp';
import { imageOf, rasterOf, type Raster } from './raster';

export const MODEL_EDGE = 1536;

export const ERASE_PROMPT =
  'The first image is a photo. In the second image the white area marks what to remove from the photo. Remove everything under the white area and fill it with the surrounding background as if it was never there. Keep every other pixel, the framing and the size exactly the same, and answer with the edited photo only.';

const CONTEXT = 0.5;

export interface EraseRequest {
  readonly profileId: string;
  readonly itemId: string;
  readonly crop: Buffer;
  readonly mask: Buffer;
}

export interface Eraser {
  readonly erase: (request: EraseRequest, signal: AbortSignal) => Promise<Buffer>;
}

export interface ErasePatch {
  readonly patchId: string;
  readonly box: PhotoBox;
  readonly png: Buffer;
}

interface Window {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

type Stroke = PhotoErase['strokes'][number];

export function brushDiameter(stroke: Stroke, width: number, height: number): number {
  return Math.max(1, stroke.size * Math.min(width, height));
}

export function eraseWindow(strokes: readonly Stroke[], width: number, height: number): Window {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (const stroke of strokes) {
    const reach = brushDiameter(stroke, width, height) / 2;
    for (const point of stroke.points) {
      left = Math.min(left, point.x * width - reach);
      top = Math.min(top, point.y * height - reach);
      right = Math.max(right, point.x * width + reach);
      bottom = Math.max(bottom, point.y * height + reach);
    }
  }
  const pad = Math.max(right - left, bottom - top) * CONTEXT;
  const x0 = Math.max(0, Math.floor(left - pad));
  const y0 = Math.max(0, Math.floor(top - pad));
  const x1 = Math.min(width, Math.ceil(right + pad));
  const y1 = Math.min(height, Math.ceil(bottom + pad));
  return { left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

function strokeSvg(stroke: Stroke, window: Window, full: Raster): string {
  const diameter = brushDiameter(stroke, full.width, full.height);
  const points = stroke.points.map((point) => ({
    x: point.x * full.width - window.left,
    y: point.y * full.height - window.top,
  }));
  const [only] = points;
  if (points.length === 1 && only !== undefined) {
    return `<circle cx="${String(only.x)}" cy="${String(only.y)}" r="${String(diameter / 2)}" fill="white"/>`;
  }
  const path = points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');
  return `<polyline points="${path}" fill="none" stroke="white" stroke-width="${String(diameter)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export async function maskOf(
  strokes: readonly Stroke[],
  window: Window,
  full: Raster,
): Promise<Buffer> {
  const body = strokes.map((stroke) => strokeSvg(stroke, window, full)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(window.width)}" height="${String(window.height)}"><rect width="100%" height="100%" fill="black"/>${body}</svg>`;
  return sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
}

function boxOf(window: Window, full: Raster): PhotoBox {
  return {
    x: window.left / full.width,
    y: window.top / full.height,
    w: window.width / full.width,
    h: window.height / full.height,
  };
}

async function modelInputs(
  crop: Raster,
  mask: Buffer,
): Promise<{ readonly crop: Buffer; readonly mask: Buffer }> {
  const fit = {
    width: MODEL_EDGE,
    height: MODEL_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  } as const;
  const maskImage = sharp(mask, { raw: { width: crop.width, height: crop.height, channels: 1 } });
  return {
    crop: await imageOf(crop).removeAlpha().resize(fit).jpeg({ quality: 95 }).toBuffer(),
    mask: await maskImage.resize(fit).png().toBuffer(),
  };
}

async function patchOf(answer: Buffer, window: Window, mask: Buffer): Promise<Buffer> {
  const resized = await sharp(answer)
    .resize(window.width, window.height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  return sharp(resized, { raw: { width: window.width, height: window.height, channels: 3 } })
    .joinChannel(mask, { raw: { width: window.width, height: window.height, channels: 1 } })
    .png()
    .toBuffer();
}

export interface EraseJob {
  readonly eraser: Eraser;
  readonly profileId: string;
  readonly itemId: string;
  readonly strokes: readonly Stroke[];
  readonly signal: AbortSignal;
}

export async function eraseStrokes(base: Raster, job: EraseJob): Promise<ErasePatch> {
  const window = eraseWindow(job.strokes, base.width, base.height);
  const mask = await maskOf(job.strokes, window, base);
  const crop = await rasterOf(imageOf(base).extract(window));
  const inputs = await modelInputs(crop, mask);
  const answer = await job.eraser.erase(
    { profileId: job.profileId, itemId: job.itemId, ...inputs },
    job.signal,
  );
  return {
    patchId: randomUUID(),
    box: boxOf(window, base),
    png: await patchOf(answer, window, mask),
  };
}
