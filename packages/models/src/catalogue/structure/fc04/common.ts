import type {
  ModelSpec,
  ModelSpecChannel,
  ModelSpecPart,
  ModelSpecShot,
} from '@smarteverything/domain';
import { finishSet, tokenMaterial, type FinishSet } from '../../../helpers/finishes';
import { box, by, cylinder, type Len, type Placement, type Vec } from '../fc01/look';

export const GAP = 0.003;

export type Side = 1 | -1;

export function add(len: Len, offset: number): Len {
  return typeof len === 'number' ? len + offset : { ...len, offset: len.offset + offset };
}

export function mul(len: Len, factor: number): Len {
  return typeof len === 'number'
    ? len * factor
    : { param: len.param, scale: len.scale * factor, offset: len.offset * factor };
}

export function plane(
  id: string,
  material: string,
  size: { readonly w: Len; readonly h: Len },
  place: Placement,
): ModelSpecPart {
  const [x, y, z] = place.at;
  return {
    id,
    geometry: {
      type: 'roundedPlane',
      width: size.w,
      height: size.h,
      radius: 0.002,
      segments: 3,
    },
    material,
    transform: { position: [x, y, z] },
    ...(place.parent === undefined ? {} : { parent: place.parent }),
    ...(place.minLod === undefined ? {} : { minLod: place.minLod }),
  };
}

export const WINDOW_MATERIALS: ModelSpec['materials'] = {
  frame: tokenMaterial('matte-white', { roughness: 0.46, clearcoat: 0.15 }),
  glass: tokenMaterial('clear-glass'),
  accent: tokenMaterial('brushed-aluminium'),
};

export function windowFinishes(): FinishSet {
  return finishSet(
    {
      plasterWhite: {},
      warmWhite: { frame: { finish: 'warm-white', roughness: 0.44 } },
      concrete: { frame: { color: '#7C7B77', roughness: 0.6 } },
      brick: { frame: { color: '#6E3B2E', roughness: 0.5 } },
      timber: { frame: { finish: 'oak' } },
    },
    'plasterWhite',
  );
}

export const WINDOW_STATES: ModelSpec['states'] = {
  closed: { open: 0 },
  ajar: { open: 0.35 },
  open: { open: 1 },
};

export function tilt(id: string, target: string, degrees: number): ModelSpecChannel {
  return {
    id,
    target,
    property: 'rotate',
    axis: 'x',
    source: 'open',
    map: { type: 'linear', in: [0, 1], out: [0, degrees], clamp: true },
    motion: { type: 'pose', easeMs: 900 },
    reduced: 'hold',
  };
}

export interface ShotAim {
  readonly zoom: number;
  readonly yaw: number;
  readonly pitch: number;
}

export function openingShot(focus: string, aim: ShotAim): ModelSpecShot {
  return {
    id: 'opening',
    when: { anyOf: [{ allOf: [{ signal: 'open', op: 'gt', value: 0 }] }] },
    focus,
    zoom: aim.zoom,
    yaw: aim.yaw,
    pitch: aim.pitch,
    easeMs: 900,
    loopS: 1,
    symmetry: 360,
    stillAt: 1,
  };
}

export interface FrameSpec {
  readonly bar: number;
  readonly depth: number;
  readonly sill: number;
}

export function windowFrame({ bar, depth, sill }: FrameSpec): ModelSpecPart[] {
  const sides = ([-1, 1] as const).map((side) =>
    box(
      side < 0 ? 'frameLeft' : 'frameRight',
      'frame',
      { w: bar, h: by('height', 1, -sill), d: depth, r: 0.005 },
      { at: [by('width', side * 0.5, -side * (bar / 2)), by('height', 0.5, sill / 2), 0] },
    ),
  );
  return [
    ...sides,
    box(
      'frameHead',
      'frame',
      { w: by('width', 1, -2 * bar), h: bar, d: depth, r: 0.005 },
      { at: [0, by('height', 1, -bar / 2), 0] },
    ),
    box(
      'frameBottom',
      'frame',
      { w: by('width', 1, -2 * bar), h: bar, d: depth, r: 0.005 },
      { at: [0, sill + bar / 2, 0] },
    ),
    box(
      'sill',
      'frame',
      { w: by('width', 1, 0.08), h: sill, d: depth + 0.04, r: 0.006 },
      { at: [0, sill / 2, 0.02], contact: true },
    ),
  ];
}

export type Handle = 'lever' | 'latch';

export interface Sash {
  readonly name: string;
  readonly parent?: string;
  readonly at: Vec;
  readonly w: Len;
  readonly h: Len;
  readonly depth: number;
  readonly stile: number;
  readonly meet: Side;
  readonly handle?: Handle;
  readonly hinge?: Side;
  readonly z?: number;
}

function stiles(sash: Sash, root: string): ModelSpecPart[] {
  return ([-1, 1] as const).map((side) =>
    box(
      `stile${sash.name}${side < 0 ? 'Left' : 'Right'}`,
      'frame',
      { w: sash.stile, h: sash.h, d: sash.depth, r: 0.004 },
      {
        at: [add(mul(sash.w, side * 0.5), -side * (sash.stile / 2)), 0, 0],
        parent: root,
        minLod: side === sash.meet ? 0 : 1,
      },
    ),
  );
}

function rails(sash: Sash, root: string): ModelSpecPart[] {
  return ([1, -1] as const).map((side) =>
    box(
      `rail${sash.name}${side > 0 ? 'Top' : 'Bottom'}`,
      'frame',
      { w: add(sash.w, -2 * sash.stile + 0.004), h: sash.stile, d: sash.depth, r: 0.004 },
      {
        at: [0, add(mul(sash.h, side * 0.5), -side * (sash.stile / 2)), 0],
        parent: root,
        minLod: 1,
      },
    ),
  );
}

function lever(sash: Sash, root: string): ModelSpecPart[] {
  const x = add(mul(sash.w, sash.meet * 0.5), -sash.meet * (sash.stile / 2));
  const front = sash.depth / 2;
  return [
    cylinder(
      `rose${sash.name}`,
      'accent',
      { radius: 0.014, h: 0.008, bevel: 0.002, seg: 24 },
      { at: [x, 0, front + 0.004], turn: [90, 0, 0], parent: root, minLod: 1 },
    ),
    box(
      `lever${sash.name}`,
      'accent',
      { w: 0.014, h: 0.09, d: 0.014, r: 0.006 },
      { at: [x, -0.04, front + 0.016], parent: root, minLod: 1 },
    ),
  ];
}

function latch(sash: Sash, root: string): ModelSpecPart[] {
  const x = add(mul(sash.w, sash.meet * 0.5), -sash.meet * (sash.stile / 2));
  return [
    box(
      `latch${sash.name}`,
      'accent',
      { w: 0.018, h: 0.07, d: 0.012, r: 0.005 },
      { at: [x, 0, sash.depth / 2 + 0.006], parent: root, minLod: 1 },
    ),
  ];
}

function hinges(sash: Sash, root: string, side: Side): ModelSpecPart[] {
  return ([1, -1] as const).map((row) =>
    cylinder(
      `hinge${sash.name}${row > 0 ? 'Top' : 'Bottom'}`,
      'accent',
      { radius: 0.007, h: 0.07, bevel: 0.002, seg: 16 },
      {
        at: [add(mul(sash.w, side * 0.5), side * GAP), add(mul(sash.h, row * 0.5), -row * 0.1), 0],
        parent: root,
        minLod: 1,
      },
    ),
  );
}

export function sashParts(sash: Sash): ModelSpecPart[] {
  const root = `glass${sash.name}`;
  const handle = sash.handle === 'lever' ? lever(sash, root) : [];
  const latched = sash.handle === 'latch' ? latch(sash, root) : [];
  return [
    plane(
      root,
      'glass',
      { w: add(sash.w, -2 * sash.stile + 0.016), h: add(sash.h, -2 * sash.stile + 0.016) },
      sash.parent === undefined ? { at: sash.at } : { at: sash.at, parent: sash.parent },
    ),
    ...stiles(sash, root),
    ...rails(sash, root),
    ...handle,
    ...latched,
    ...(sash.hinge === undefined ? [] : hinges(sash, root, sash.hinge)),
  ];
}

export function windowMeta(
  display: string,
  synonyms: string[],
  sizeClass: string,
  variants: readonly string[],
): ModelSpec['meta'] {
  return { names: { display, synonyms }, sizeClass, variants: [...variants] };
}
