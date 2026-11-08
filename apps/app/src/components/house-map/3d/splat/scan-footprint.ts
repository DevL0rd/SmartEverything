import type { RenderBounds } from '../../render-scene';

export interface SplatCentre {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SplatRead {
  readonly center: SplatCentre;
}

export interface SplatSource {
  readonly numSplats: number;
  getSplat(index: number): SplatRead;
}

export function scanPlanExtent(source: SplatSource): RenderBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < source.numSplats; index += 1) {
    const { center } = source.getSplat(index);
    minX = Math.min(minX, center.x);
    maxX = Math.max(maxX, center.x);
    minY = Math.min(minY, -center.z);
    maxY = Math.max(maxY, -center.z);
  }
  return minX < maxX && minY < maxY ? { minX, minY, maxX, maxY } : null;
}
