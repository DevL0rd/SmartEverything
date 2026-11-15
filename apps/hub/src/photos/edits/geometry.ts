import type { GeometryStep, PhotoBox } from '@smarteverything/domain';
import sharp from 'sharp';
import { imageOf, rasterOf, type Raster } from './raster';

const QUARTER = 90;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

export type PatchLoader = (patchId: string) => Promise<Buffer>;

export function inscribedSize(
  width: number,
  height: number,
  degrees: number,
): { readonly width: number; readonly height: number } {
  const turn = (Math.abs(degrees) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const fit = Math.min(width / (width * cos + height * sin), height / (width * sin + height * cos));
  return {
    width: Math.max(1, Math.floor(width * fit)),
    height: Math.max(1, Math.floor(height * fit)),
  };
}

export function pixelBox(
  box: PhotoBox,
  width: number,
  height: number,
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const left = Math.min(width - 1, Math.round(box.x * width));
  const top = Math.min(height - 1, Math.round(box.y * height));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(box.w * width))),
    height: Math.max(1, Math.min(height - top, Math.round(box.h * height))),
  };
}

async function patched(
  raster: Raster,
  step: Extract<GeometryStep, { kind: 'patch' }>,
  load: PatchLoader,
): Promise<Raster> {
  const place = pixelBox(step.box, raster.width, raster.height);
  const patch = await sharp(await load(step.patchId))
    .ensureAlpha()
    .resize(place.width, place.height, { fit: 'fill' })
    .png()
    .toBuffer();
  return rasterOf(
    imageOf(raster).composite([{ input: patch, left: place.left, top: place.top, blend: 'over' }]),
  );
}

async function straightened(raster: Raster, degrees: number): Promise<Raster> {
  const turned = await rasterOf(imageOf(raster).rotate(degrees, { background: TRANSPARENT }));
  const inside = inscribedSize(raster.width, raster.height, degrees);
  const left = Math.max(0, Math.floor((turned.width - inside.width) / 2));
  const top = Math.max(0, Math.floor((turned.height - inside.height) / 2));
  return rasterOf(
    imageOf(turned).extract({
      left,
      top,
      width: Math.min(inside.width, turned.width - left),
      height: Math.min(inside.height, turned.height - top),
    }),
  );
}

async function applyStep(raster: Raster, step: GeometryStep, load: PatchLoader): Promise<Raster> {
  switch (step.kind) {
    case 'patch':
      return patched(raster, step, load);
    case 'flip': {
      const image = imageOf(raster);
      return rasterOf(
        step.horizontal && step.vertical
          ? image.flip().flop()
          : step.vertical
            ? image.flip()
            : image.flop(),
      );
    }
    case 'rotate':
      return rasterOf(imageOf(raster).rotate(step.quarterTurns * QUARTER));
    case 'straighten':
      return straightened(raster, step.degrees);
    case 'crop':
      return rasterOf(imageOf(raster).extract(pixelBox(step.box, raster.width, raster.height)));
  }
}

export async function applyGeometry(
  raster: Raster,
  steps: readonly GeometryStep[],
  load: PatchLoader,
): Promise<Raster> {
  let current = raster;
  for (const step of steps) current = await applyStep(current, step, load);
  return current;
}
