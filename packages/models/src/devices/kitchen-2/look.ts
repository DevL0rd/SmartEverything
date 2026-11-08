import type {
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecCondition,
  ModelSpecMaterial,
  ModelSpecPart,
} from '@smarteverything/domain';
import { part, placed, type Place, type Vec } from '../../helpers/geometry';

export const HEAT = '#F29A4E';
export const WARM = '#F2B45E';
export const PRIMARY = '#5ED3CF';
export const COOL = '#8EAEFF';
export const WATER = '#5EA8D3';
export const WARNING = '#F2C14E';
export const FAULT = '#E5484D';
export const DAYLIGHT = '#E6EAF0';

export const HOUSE = { yaw: 30, pitch: 18, fov: 28 } as const;

type Table = Readonly<Record<string, number | string | boolean>>;

type Mount = 'wall' | 'floor' | 'desk';

type Target = readonly [string, ModelSpecChannel['property']];

type Source = readonly [string, Table];

export const GLOW: ModelSpecMaterial = { color: WARM, roughness: 0.3, opacity: 0 };

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

export function axisLook(
  id: string,
  [target, property, axis]: readonly [string, ModelSpecChannel['property'], 'x' | 'y' | 'z'],
  [source, table]: Source,
  easeMs = 300,
): ModelSpecChannel {
  return { ...look(id, [target, property], [source, table], easeMs), axis };
}

export function ramp(
  id: string,
  [target, property, axis]: readonly [string, ModelSpecChannel['property'], ('x' | 'y' | 'z')?],
  [source, from, to]: readonly [string, readonly [number, number], readonly [number, number]],
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
  [periodS, amplitude]: readonly [number, number],
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
  [target, axis]: readonly [string, 'x' | 'y' | 'z'],
  [source, table]: Source,
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'rotate',
    axis,
    source,
    map: { type: 'enum', table },
    motion: { type: 'spin' },
    reduced: 'hold',
  };
}

export function glow(
  id: string,
  target: string,
  [source, opacity, emissive]: readonly [string, Table, Table],
  easeMs = 300,
): ModelSpecChannel[] {
  return [
    look(`${id}Show`, [target, 'opacity'], [source, opacity], easeMs),
    look(`${id}Lit`, [target, 'emissive'], [source, emissive], easeMs),
  ];
}

export function offline(target: string): ModelSpecChannel[] {
  return [
    look(`${target}OfflineShow`, [target, 'opacity'], ['online', { false: 0 }], 450),
    look(`${target}OfflineLit`, [target, 'emissive'], ['online', { false: 0 }], 450),
  ];
}

export function phases<Name extends string>(
  names: readonly Name[],
  values: Partial<Record<Name, number | string | boolean>>,
  rest: number | string | boolean = 0,
): Record<string, number | string | boolean> {
  return Object.fromEntries(names.map((name) => [name, values[name] ?? rest]));
}

export function whenPhase(...values: readonly string[]): ModelSpecCondition {
  return {
    anyOf: values.map((value) => ({ allOf: [{ signal: 'phase', op: 'eq', value }] })),
  };
}

export function hinged(
  hinge: Vec,
  offset: Vec,
  axis: 'x' | 'y',
  deg: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const [x, y, z] = offset;
  const turned: Vec =
    axis === 'x' ? [x, y * c - z * s, y * s + z * c] : [x * c + z * s, y, -x * s + z * c];
  return {
    position: [hinge[0] + turned[0], hinge[1] + turned[1], hinge[2] + turned[2]],
    rotation: axis === 'x' ? [deg, 0, 0] : [0, deg, 0],
  };
}

export function hingePoses(
  hinge: Vec,
  offset: Vec,
  axis: 'x' | 'y',
  open: Readonly<Record<string, number>>,
): NonNullable<ModelSpecPart['poses']> {
  return {
    closed: hinged(hinge, offset, axis, 0),
    ...Object.fromEntries(
      Object.entries(open).map(([name, deg]) => [name, hinged(hinge, offset, axis, deg)]),
    ),
  };
}

export function puck(
  id: string,
  [radius, height, bevel]: readonly [number, number, number],
  material: string,
  place: Place,
): ModelSpecPart {
  const segments = place.segments ?? 32;
  return part(
    id,
    { type: 'cylinder', height, topRadius: radius, bottomRadius: radius, bevel, segments },
    material,
    placed(place),
  );
}

export function plane(
  id: string,
  [width, height, radius]: readonly [number, number, number],
  material: string,
  place: Place,
): ModelSpecPart {
  const geometry = { type: 'roundedPlane', width, height, radius, segments: 4 } as const;
  return part(id, geometry, material, placed(place));
}

export function halo(
  id: string,
  [width, height]: readonly [number, number],
  place: Place,
): ModelSpecPart {
  return part(id, { type: 'glow', width, height, segments: 24 }, 'accent', placed(place));
}

export function anchorsOf([width, height, depth]: Vec, mount: Mount): ModelSpecAnchor[] {
  return [
    { kind: 'mount', id: 'mount', position: [0, 0, mount === 'wall' ? -depth / 2 : 0], mount },
    { kind: 'label', id: 'pin', position: [0, height + 0.05, 0] },
    { kind: 'hit', id: 'tap', position: [0, height / 2, 0], size: [width, height, depth] },
  ];
}
