import {
  modelParamValues,
  stillParts,
  type ModelSpec,
  type ModelSpecPart,
} from '@smarteverything/domain';
import type { ModelLod, ModelParamValues } from '../helpers/estimate';
import {
  IDENTITY,
  localMatrix,
  multiply,
  projectPart,
  type Affine,
  type Loops,
  type PlanFillRule,
  type Projected,
} from './plan-outline';

export type { PlanFillRule } from './plan-outline';

export type PlanTheme = 'light' | 'dark';

export interface PlanSymbolOptions {
  readonly theme: PlanTheme;
  readonly params?: ModelParamValues;
  readonly finish?: string;
  readonly colors?: Readonly<Record<string, string>>;
}

export interface PlanLayer {
  readonly partId: string;
  readonly d: string;
  readonly fill: string;
  readonly fillOpacity: number;
  readonly fillRule: PlanFillRule;
  readonly stroke: string;
  readonly strokeWidth: 1;
  readonly vectorEffect: 'non-scaling-stroke';
  readonly top: number;
}

export interface PlanBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlanSymbol {
  readonly layers: readonly PlanLayer[];
  readonly bounds: PlanBounds;
  readonly unresolved: readonly string[];
}

export const PLAN_LOD: ModelLod = 1;

const NEUTRAL: Readonly<Record<PlanTheme, string>> = { light: '#9AA0A6', dark: '#5F6368' };
const SHADE: Readonly<Record<PlanTheme, { readonly lift: number; readonly sink: number }>> = {
  light: { lift: 0.18, sink: 0.12 },
  dark: { lift: 0.1, sink: 0.3 },
};
const OUTLINE_DARKEN = 0.35;
const WHITE = '#FFFFFF';
const BLACK = '#000000';

interface Look {
  readonly color: string;
  readonly opacity: number;
}

function worldMatrices(spec: ModelSpec, params: ModelParamValues): ReadonlyMap<string, Affine> {
  const byId = new Map(spec.parts.map((part) => [part.id, part]));
  const worlds = new Map<string, Affine>();
  const worldOf = (part: ModelSpecPart): Affine => {
    const known = worlds.get(part.id);
    if (known !== undefined) return known;
    const parent = part.parent === undefined ? undefined : byId.get(part.parent);
    const base = parent === undefined ? IDENTITY : worldOf(parent);
    const world = multiply(base, localMatrix(part.transform, params));
    worlds.set(part.id, world);
    return world;
  };
  spec.parts.forEach(worldOf);
  return worlds;
}

function finishName(spec: ModelSpec, finish: string | undefined): string | undefined {
  if (finish === undefined || spec.finishes?.[finish] === undefined) return spec.defaultFinish;
  return finish;
}

function slotLook(
  spec: ModelSpec,
  slot: string,
  finish: string | undefined,
  options: PlanSymbolOptions,
): Look | string {
  const base = spec.materials[slot];
  if (base === undefined) return `slot:${slot}`;
  const override = overrideOf(spec, slot, finish);
  const swaps = override.color !== undefined || override.finish !== undefined;
  const look = swaps ? override : base;
  const opacity = override.opacity ?? base.opacity ?? 1;
  if (look.color !== undefined) return { color: look.color, opacity };
  const token = look.finish ?? '';
  const color = options.colors?.[token];
  return color === undefined ? `token:${token}` : { color, opacity };
}

type Override = NonNullable<ModelSpec['finishes']>[string][string];

function overrideOf(spec: ModelSpec, slot: string, finish: string | undefined): Override {
  if (finish === undefined) return {};
  return spec.finishes?.[finish]?.[slot] ?? {};
}

function channels(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixColor(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  const mixed = a.map((channel, i) => Math.round(channel + ((b[i] ?? channel) - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const fmt = (value: number): string => String(Number(value.toFixed(4)));

export function loopsPath(loops: Loops): string {
  return loops.map((loop) => `M${loop.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`).join('');
}

function boundsOf(projected: readonly Projected[], spec: ModelSpec): PlanBounds {
  const points = projected.flatMap((item) => item.loops.flat());
  if (points.length === 0) {
    const { width, depth } = spec.footprint;
    return { x: -width / 2, y: -depth / 2, width, height: depth };
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function layerOf(item: Projected, look: Look, shade: number, theme: PlanTheme): PlanLayer {
  const { lift, sink } = SHADE[theme];
  const fill = mixColor(mixColor(look.color, BLACK, sink * (1 - shade)), WHITE, lift * shade);
  return {
    partId: item.part.id,
    d: loopsPath(item.loops),
    fill,
    fillOpacity: look.opacity,
    fillRule: item.rule,
    stroke: mixColor(fill, BLACK, OUTLINE_DARKEN),
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke',
    top: item.top,
  };
}

export function planSymbol(spec: ModelSpec, options: PlanSymbolOptions): PlanSymbol {
  const params = modelParamValues(spec, options.params);
  const finish = finishName(spec, options.finish);
  const worlds = worldMatrices(spec, params);
  const projected = stillParts(spec, PLAN_LOD, params)
    .map((part) => projectPart(part, worlds.get(part.id) ?? IDENTITY, params))
    .filter((item) => item.loops.length > 0)
    .sort((a, b) => a.top - b.top);
  const tops = projected.map((item) => item.top);
  const [low, high] = [Math.min(...tops), Math.max(...tops)];
  const unresolved = new Set<string>();
  if (options.finish !== undefined && finish !== options.finish)
    unresolved.add(`finish:${options.finish}`);
  const layers = projected.map((item) => {
    const found = slotLook(spec, item.part.material, finish, options);
    if (typeof found === 'string') unresolved.add(found);
    const look = typeof found === 'string' ? { color: NEUTRAL[options.theme], opacity: 1 } : found;
    const shade = high > low ? (item.top - low) / (high - low) : 1;
    return layerOf(item, look, shade, options.theme);
  });
  return { layers, bounds: boundsOf(projected, spec), unresolved: [...unresolved] };
}
