import type { ModelSpec, ModelSpecAnchor, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial, type FinishSet } from '../../../helpers/finishes';

export interface Binding {
  readonly param: string;
  readonly scale: number;
  readonly offset: number;
}

export type Len = number | Binding;

export type Vec = readonly [Len, Len, Len];

export interface BoxSize {
  readonly w: Len;
  readonly h: Len;
  readonly d: Len;
  readonly r: number;
  readonly seg?: number;
}

export interface Placement {
  readonly at: Vec;
  readonly turn?: readonly [number, number, number];
  readonly parent?: string;
  readonly minLod?: 0 | 1 | 2;
  readonly contact?: boolean;
}

export function by(param: string, scale = 1, offset = 0): Binding {
  return { param, scale, offset };
}

function transformOf(place: Placement): NonNullable<ModelSpecPart['transform']> {
  const [x, y, z] = place.at;
  return {
    position: [x, y, z],
    ...(place.turn === undefined
      ? {}
      : { rotation: [place.turn[0], place.turn[1], place.turn[2]] }),
  };
}

function optionsOf(place: Placement): Omit<ModelSpecPart, 'id' | 'geometry' | 'material'> {
  return {
    transform: transformOf(place),
    ...(place.parent === undefined ? {} : { parent: place.parent }),
    ...(place.minLod === undefined ? {} : { minLod: place.minLod }),
    ...(place.contact === undefined ? {} : { contact: place.contact }),
  };
}

export function box(id: string, material: string, size: BoxSize, place: Placement): ModelSpecPart {
  return {
    id,
    geometry: {
      type: 'roundedBox',
      width: size.w,
      height: size.h,
      depth: size.d,
      radius: size.r,
      segments: size.seg ?? 3,
    },
    material,
    ...optionsOf(place),
  };
}

export interface CylinderSize {
  readonly radius: Len;
  readonly h: Len;
  readonly bevel: number;
  readonly seg?: number;
}

export function cylinder(
  id: string,
  material: string,
  size: CylinderSize,
  place: Placement,
): ModelSpecPart {
  return {
    id,
    geometry: {
      type: 'cylinder',
      height: size.h,
      topRadius: size.radius,
      bottomRadius: size.radius,
      bevel: size.bevel,
      segments: size.seg ?? 48,
    },
    material,
    ...optionsOf(place),
  };
}

export const WALL_MATERIALS: ModelSpec['materials'] = {
  wall: tokenMaterial('matte-white', { roughness: 0.82 }),
  trim: tokenMaterial('warm-white', { roughness: 0.42 }),
};

export const STRUCTURE_FINISH_NAMES = [
  'plasterWhite',
  'warmWhite',
  'concrete',
  'brick',
  'timber',
] as const;

export const WALL_FINISHES: FinishSet = finishSet(
  {
    plasterWhite: {},
    warmWhite: { wall: { finish: 'warm-white', roughness: 0.78 } },
    concrete: {
      wall: { color: '#A6A49F', roughness: 0.9 },
      trim: { color: '#8C8A85', roughness: 0.86 },
    },
    brick: { wall: { color: '#9A5540', roughness: 0.92 } },
    timber: { wall: { finish: 'oak' }, trim: { finish: 'walnut' } },
  },
  'plasterWhite',
);

export const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.08 } as const;

export const WALL_VIEW = { yaw: 20, pitch: 10, fov: 28, padding: 0.08 } as const;

export const TALL_VIEW = { yaw: 30, pitch: 12, fov: 28, padding: 0.08 } as const;

export const FLAT_VIEW = { yaw: 30, pitch: 35, fov: 28, padding: 0.08 } as const;

export interface View {
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly padding: number;
}

export function framingOf(view: View, focus?: string): ModelSpec['framing'] {
  const aim = focus === undefined ? view : { ...view, focus };
  return {
    tile: { ...aim, padding: 0.06 },
    card: aim,
    hero: { ...aim, padding: 0.1 },
  };
}

export interface AnchorBox {
  readonly id: string;
  readonly mount: 'floor' | 'wall' | 'ceiling';
  readonly size: readonly [number, number, number];
  readonly centreY: number;
}

export function anchorsOf(area: AnchorBox): ModelSpecAnchor[] {
  const [w, h, d] = area.size;
  const top = area.mount === 'ceiling' ? area.centreY + h / 2 : 0;
  return [
    { kind: 'mount', id: 'mount', position: [0, top, 0], mount: area.mount },
    { kind: 'label', id: 'pin', position: [0, area.centreY + h / 2 + 0.08, 0] },
    { kind: 'hit', id: `${area.id}Hit`, position: [0, area.centreY, 0], size: [w, h, d] },
  ];
}

export const REST_STATES: ModelSpec['states'] = { rest: {} };

export const SKIRTING = { h: 0.09, d: 0.014 } as const;
