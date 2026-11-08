import {
  homeMapPointInPolygon,
  homeMapProjectOnSegment,
} from '@smarteverything/domain/home-map-geometry';
import type { LightPool } from './lighting';
import type { RenderPoint, RenderPolygon } from './render-scene';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const HEX = /^#?([0-9a-f]{6})$/iu;

export function hexRgb(hex: string): readonly [number, number, number] | null {
  const digits = HEX.exec(hex.trim())?.[1];
  if (digits === undefined) return null;
  const value = Number.parseInt(digits, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const insideClip = (clip: readonly RenderPolygon[], point: RenderPoint): boolean =>
  clip.some((polygon) => homeMapPointInPolygon(polygon, point));

function poolWeightAt(pool: LightPool, point: RenderPoint): number {
  if (!insideClip(pool.clip, point)) return 0;
  const falloff = clamp01(1 - homeMapProjectOnSegment(pool, point).distance / pool.reachM);
  return pool.strength * falloff * falloff;
}

export interface PooledLight {
  readonly rgb: readonly [number, number, number];
  readonly weight: number;
}

export function pooledLightAt(pools: readonly LightPool[], point: RenderPoint): PooledLight {
  let weight = 0;
  const rgb: [number, number, number] = [0, 0, 0];
  for (const pool of pools) {
    const share = poolWeightAt(pool, point);
    const colour = hexRgb(pool.colour);
    if (share <= 0 || colour === null) continue;
    weight += share;
    colour.forEach((value, index) => {
      rgb[index] = (rgb[index] ?? 0) + value * share;
    });
  }
  return weight === 0
    ? { rgb: [0, 0, 0], weight: 0 }
    : { rgb: [rgb[0] / weight, rgb[1] / weight, rgb[2] / weight], weight };
}
