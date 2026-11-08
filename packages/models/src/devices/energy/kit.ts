import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecCondition,
  ModelSpecMaterial,
  ModelSpecPart,
  ModelSpecShot,
} from '@smarteverything/domain';
import { box, part, placed, type PartOptions, type Place } from '../../helpers/geometry';

export const PRIMARY = '#5ED3CF';
export const CHARGE = '#5ED3A0';
export const HEAT = '#F29A4E';
export const WATER = '#5EA8D3';
export const WARNING = '#F2B45E';
export const FAULT = '#F2564E';

export type Vec = [number, number, number];

export const ACCENT: ModelSpecMaterial = { color: PRIMARY, roughness: 0.3, opacity: 0 };

type Table = Readonly<Record<string, number | string | boolean>>;

type Target = readonly [string, ModelSpecChannel['property']];

type Source = readonly [string, Table];

type Range = readonly [number, number];

type Axis = 'x' | 'y' | 'z';

export function house(
  focus: string,
  yaw = 28,
  pitch = 14,
): {
  tile: ModelSpec['framing']['tile'];
  card: ModelSpec['framing']['card'];
  hero: ModelSpec['framing']['hero'];
} {
  const base = { yaw, pitch, fov: 28, padding: 0.1, focus };
  return {
    tile: { ...base, padding: 0.06 },
    card: base,
    hero: { ...base, padding: 0.16 },
  };
}

export function puck(
  id: string,
  [radius, height, bevel]: readonly [number, number, number],
  material: string,
  place: Place,
): ModelSpecPart {
  const segments = place.segments ?? 40;
  return part(
    id,
    { type: 'cylinder', height, topRadius: radius, bottomRadius: radius, bevel, segments },
    material,
    placed(place),
  );
}

export function ball(id: string, radius: number, material: string, place: Place): ModelSpecPart {
  const segments = place.segments ?? 24;
  return part(id, { type: 'sphere', radius, segments }, material, placed(place));
}

export function pipe(
  id: string,
  points: readonly Vec[],
  [radius, material]: readonly [number, string],
  options: PartOptions = {},
): ModelSpecPart {
  return part(id, { type: 'tube', points: [...points], radius, segments: 10 }, material, options);
}

export function look(
  id: string,
  [target, property]: Target,
  [source, table]: Source,
  easeMs = 300,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

export function ramp(
  id: string,
  [target, property, axis]: readonly [string, ModelSpecChannel['property'], Axis?],
  [source, from, to]: readonly [string, Range, Range],
  easeMs = 300,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    ...(axis === undefined ? {} : { axis }),
    source,
    map: { type: 'linear', in: [from[0], from[1]], out: [to[0], to[1]], clamp: true },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

export function pulse(
  id: string,
  [target, property]: Target,
  [source, table]: Source,
  [periodS, amplitude]: Range,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: { type: 'pulse', periodS, amplitude },
    reduced: 'hold',
  };
}

export function spin(
  id: string,
  [target, axis]: readonly [string, Axis],
  [source, from, to]: readonly [string, Range, Range],
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'rotate',
    axis,
    source,
    map: { type: 'speed', in: [from[0], from[1]], perSecond: [to[0], to[1]] },
    motion: { type: 'spin' },
    reduced: 'hold',
  };
}

export function sway(
  id: string,
  [target, axis]: readonly [string, Axis],
  [source, table]: Source,
  [limits, speed]: readonly [Range, number],
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'translate',
    axis,
    source,
    map: { type: 'enum', table },
    motion: { type: 'oscillate', limits: [limits[0], limits[1]], speed },
    reduced: 'hold',
  };
}

export function status(target: string): ModelSpecChannel[] {
  return [
    look(`${target}Show`, [target, 'opacity'], ['online', { true: 1, false: 0 }]),
    look(`${target}Lit`, [target, 'emissive'], ['online', { true: 0.9, false: 0 }]),
    look(`${target}Off`, [target, 'emissive'], ['power', { false: 0 }], 450),
    look(`${target}OffShow`, [target, 'opacity'], ['power', { false: 0 }], 450),
    look(`${target}Warn`, [target, 'colour'], ['batteryLow', { true: WARNING }]),
    look(`${target}Fault`, [target, 'colour'], ['fault', { true: FAULT }]),
    pulse(`${target}Alert`, [target, 'emissive'], ['fault', { true: 1.6 }], [0.8, 0.8]),
  ];
}

export function glow(
  target: string,
  [source, opacity, emissive]: readonly [string, Table, Table],
): ModelSpecChannel[] {
  return [
    look(`${target}Show`, [target, 'opacity'], [source, opacity]),
    look(`${target}Lit`, [target, 'emissive'], [source, emissive]),
  ];
}

export function cells(
  prefix: string,
  [count, source, warn = false]: readonly [number, string, boolean?],
  size: readonly [number, number, number, number],
  at: (index: number) => Vec,
): { parts: ModelSpecPart[]; channels: ModelSpecChannel[] } {
  const indices = Array.from({ length: count }, (_, index) => index);
  return {
    parts: indices.map((index) =>
      box(`${prefix}${String(index)}`, size, 'accent', { at: at(index), minLod: 1 }),
    ),
    channels: indices.flatMap((index) => {
      const id = `${prefix}${String(index)}`;
      const from = index / count;
      return [
        ramp(`${id}Show`, [id, 'opacity'], [source, [from, from + 0.01], [0, 1]]),
        ramp(`${id}Lit`, [id, 'emissive'], [source, [from, from + 0.01], [0, 1.1]]),
        ...(warn ? [look(`${id}Warn`, [id, 'colour'], ['batteryLow', { true: WARNING }])] : []),
        look(`${id}Fault`, [id, 'colour'], ['fault', { true: FAULT }]),
        look(`${id}Off`, [id, 'opacity'], ['power', { false: 0 }], 450),
        look(`${id}Offline`, [id, 'opacity'], ['online', { false: 0 }], 450),
      ];
    }),
  };
}

interface Leaf {
  readonly signal: string;
  readonly op: 'eq' | 'gt';
  readonly value: number | string | boolean;
}

export function leaf(signal: string, op: Leaf['op'], value: Leaf['value']): Leaf {
  return { signal, op, value };
}

export function whenAll(...leaves: readonly Leaf[]): ModelSpecCondition {
  return { anyOf: [{ allOf: [...leaves] }] };
}

export function shot(
  id: string,
  when: ModelSpecCondition,
  focus: string,
  view: {
    zoom: number;
    yaw: number;
    pitch: number;
    loopS: number;
    symmetry?: number;
    stillAt?: number;
  },
): ModelSpecShot {
  return {
    id,
    when,
    focus,
    zoom: view.zoom,
    yaw: view.yaw,
    pitch: view.pitch,
    easeMs: 900,
    loopS: view.loopS,
    symmetry: view.symmetry ?? 360,
    stillAt: view.stillAt ?? 0,
  };
}

export function anchorsOf(
  [width, height, depth]: Vec,
  mount: 'wall' | 'floor',
  anchorFor = 0,
): ModelSpecAnchor[] {
  return [
    { kind: 'mount', id: 'mount', position: [0, 0, anchorFor], mount },
    { kind: 'label', id: 'pin', position: [0, height + 0.05, 0] },
    { kind: 'hit', id: 'tap', position: [0, height / 2, depth / 2], size: [width, height, depth] },
  ];
}
