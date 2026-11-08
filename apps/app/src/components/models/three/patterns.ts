import type { MODEL_SPEC_PATTERNS } from '@smarteverything/domain/model-spec';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type { ModelLod } from './geometry';

export type ModelPattern = (typeof MODEL_SPEC_PATTERNS)[number];

export type PatternUse = 'tone' | 'relief';

export interface PatternStyle {
  readonly use: PatternUse;
  readonly contrast: number;
  readonly repeat: number;
}

export interface PatternPixels {
  readonly pattern: ModelPattern;
  readonly use: PatternUse;
  readonly size: number;
  readonly repeat: number;
  readonly data: Uint8Array;
}

export const PATTERN_STYLES: Readonly<Record<ModelPattern, PatternStyle>> = {
  brushed: { use: 'relief', contrast: 0.35, repeat: 1 },
  knit: { use: 'relief', contrast: 0.6, repeat: 6 },
  perforated: { use: 'relief', contrast: 0.8, repeat: 8 },
  grille: { use: 'relief', contrast: 0.8, repeat: 6 },
  'wood-grain': { use: 'tone', contrast: 0.16, repeat: 1 },
  marble: { use: 'tone', contrast: 0.22, repeat: 1 },
  terrazzo: { use: 'tone', contrast: 0.2, repeat: 2 },
  ribbed: { use: 'relief', contrast: 0.7, repeat: 4 },
  leather: { use: 'relief', contrast: 0.45, repeat: 3 },
};

const PATTERN_SIZE: Readonly<Record<ModelLod, number>> = { 0: 0, 1: 128, 2: 256 };

const TAU = Math.PI * 2;

export function patternSize(lod: ModelLod): number {
  return PATTERN_SIZE[lod];
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lattice(x: number, y: number, period: readonly [number, number], seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  const corner = (dx: number, dy: number): number =>
    hash(wrap(x0 + dx, period[0]), wrap(y0 + dy, period[1]), seed);
  const top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * sx;
  const bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * sx;
  return top + (bottom - top) * sy;
}

export function valueNoise(u: number, v: number, period: number, seed: number): number {
  return lattice(u * period, v * period, [period, period], seed);
}

function brushed(u: number, v: number): number {
  return lattice(u * 2, v * 128, [2, 128], 5) * 0.75 + lattice(u * 4, v * 32, [4, 32], 3) * 0.25;
}

function fbm(u: number, v: number, period: number, seed: number): number {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(u, v, period * 2 ** octave, seed + octave) * weight;
    total += weight;
    weight /= 2;
  }
  return sum / total;
}

interface Cell {
  readonly near: number;
  readonly second: number;
  readonly tone: number;
}

function cellular(u: number, v: number, period: number, seed: number): Cell {
  const cx = Math.floor(u * period);
  const cy = Math.floor(v * period);
  let near = Infinity;
  let second = Infinity;
  let tone = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const gx = wrap(cx + dx, period);
      const gy = wrap(cy + dy, period);
      const px = cx + dx + hash(gx, gy, seed);
      const py = cy + dy + hash(gx, gy, seed + 7);
      const distance = Math.hypot(px - u * period, py - v * period);
      if (distance < near) {
        second = near;
        near = distance;
        tone = hash(gx, gy, seed + 13);
      } else if (distance < second) second = distance;
    }
  }
  return { near, second, tone };
}

function fraction(value: number): number {
  return value - Math.floor(value);
}

function terrazzo(u: number, v: number): number {
  const cell = cellular(u, v, 10, 41);
  return cell.near < 0.32 ? 0.2 + cell.tone * 0.8 : 0.85 + fbm(u, v, 8, 43) * 0.15;
}

const FIELDS: Readonly<Record<ModelPattern, (u: number, v: number) => number>> = {
  brushed,
  knit: (u, v) => 0.5 + 0.5 * Math.sin(TAU * (8 * v + 2 * Math.abs(fraction(8 * u) - 0.5))),
  perforated: (u, v) => (Math.hypot(fraction(8 * u) - 0.5, fraction(8 * v) - 0.5) < 0.28 ? 0 : 1),
  grille: (_u, v) => (Math.abs(fraction(6 * v) - 0.5) < 0.22 ? 0 : 1),
  'wood-grain': (u, v) => 0.5 + 0.5 * Math.sin(TAU * (12 * u + 1.5 * fbm(u, v, 4, 11))),
  marble: (u, v) => Math.abs(Math.sin(TAU * (2 * u + v + 1.6 * fbm(u, v, 4, 19)))) ** 0.25,
  terrazzo,
  ribbed: (u) => 0.5 + 0.5 * Math.cos(TAU * 16 * u),
  leather: (u, v) => {
    const cell = cellular(u, v, 24, 29);
    return Math.min(1, (cell.second - cell.near) * 3);
  },
};

export function patternValue(pattern: ModelPattern, u: number, v: number): number {
  return Math.min(1, Math.max(0, FIELDS[pattern](u, v)));
}

function shade(style: PatternStyle, value: number): number {
  const level =
    style.use === 'tone' ? 1 - style.contrast * (1 - value) : 0.5 + style.contrast * (value - 0.5);
  return Math.round(level * 255);
}

export function patternPixels(pattern: ModelPattern, size: number): PatternPixels {
  const style = PATTERN_STYLES[pattern];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const level = shade(style, patternValue(pattern, (x + 0.5) / size, (y + 0.5) / size));
      const offset = (y * size + x) * 4;
      data.fill(level, offset, offset + 3);
      data[offset + 3] = 255;
    }
  }
  return { pattern, use: style.use, size, repeat: style.repeat, data };
}

export function patternTexture(pixels: PatternPixels): DataTexture {
  const texture = new DataTexture(
    pixels.data,
    pixels.size,
    pixels.size,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(pixels.repeat, pixels.repeat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = pixels.use === 'tone' ? SRGBColorSpace : NoColorSpace;
  texture.name = `pattern:${pixels.pattern}:${String(pixels.size)}`;
  texture.needsUpdate = true;
  return texture;
}
