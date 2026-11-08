import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial, type FinishSet } from '../../../helpers/finishes';
import { box, by, type Len } from '../fc01/look';

export type Axis = (scale: number, offset?: number) => Len;

export function paramAxis(name: string): Axis {
  return (scale, offset = 0) => by(name, scale, offset);
}

export function fixedAxis(value: number): Axis {
  return (scale, offset = 0) => value * scale + offset;
}

export const JAMB = 0.04;
export const JAMB_D = 0.13;
export const CASING = 0.07;
export const CASING_D = 0.014;
export const GAP = 0.003;

export interface FrameSize {
  readonly w: Axis;
  readonly h: Axis;
}

function jambs({ w, h }: FrameSize): ModelSpecPart[] {
  const sides = [-1, 1].map((side) =>
    box(
      side < 0 ? 'jambLeft' : 'jambRight',
      'frame',
      { w: JAMB, h: h(1, JAMB), d: JAMB_D, r: 0.004 },
      { at: [w(side * 0.5, side * (JAMB / 2 + GAP)), h(0.5, JAMB / 2), 0], contact: true },
    ),
  );
  const head = box(
    'jambHead',
    'frame',
    { w: w(1, 2 * (JAMB + GAP)), h: JAMB, d: JAMB_D, r: 0.004 },
    { at: [0, h(1, JAMB / 2 + GAP), 0] },
  );
  return [...sides, head];
}

function casingFace({ w, h }: FrameSize, face: 1 | -1): ModelSpecPart[] {
  const name = face > 0 ? 'Front' : 'Back';
  const minLod = face > 0 ? 0 : 2;
  const z = face * (JAMB_D / 2 + CASING_D / 2);
  const reach = GAP + JAMB + CASING;
  const legs = [-1, 1].map((side) =>
    box(
      `casing${side < 0 ? 'Left' : 'Right'}${name}`,
      'frame',
      { w: CASING, h: h(1, reach), d: CASING_D, r: 0.004 },
      { at: [w(side * 0.5, side * (GAP + JAMB / 2 + CASING / 2)), h(0.5, reach / 2), z], minLod },
    ),
  );
  const head = box(
    `casingHead${name}`,
    'frame',
    { w: w(1, 2 * (GAP + JAMB / 2 + CASING)), h: CASING, d: CASING_D, r: 0.004 },
    { at: [0, h(1, reach - CASING / 2), z], minLod },
  );
  return [...legs, head];
}

export function doorFrame(size: FrameSize): ModelSpecPart[] {
  return [...jambs(size), ...casingFace(size, 1), ...casingFace(size, -1)];
}

export const DOOR_MATERIALS: ModelSpec['materials'] = {
  leaf: tokenMaterial('matte-white', { roughness: 0.48, clearcoat: 0.2 }),
  frame: tokenMaterial('warm-white', { roughness: 0.42 }),
  accent: tokenMaterial('brushed-aluminium'),
};

export function doorFinishes(defaultFinish: 'plasterWhite' | 'timber'): FinishSet {
  return finishSet(
    {
      plasterWhite: {},
      warmWhite: { leaf: { finish: 'warm-white', roughness: 0.46 } },
      concrete: { leaf: { color: '#8F8D88', roughness: 0.6 } },
      brick: { leaf: { color: '#8A4A38', roughness: 0.55 } },
      timber: { leaf: { finish: 'oak' }, frame: { finish: 'oak' } },
    },
    defaultFinish,
  );
}

export function swing(id: string, target: string, degrees: number): ModelSpecChannel {
  return {
    id,
    target,
    property: 'rotate',
    axis: 'y',
    source: 'open',
    map: { type: 'linear', in: [0, 1], out: [0, degrees], clamp: true },
    motion: { type: 'pose', easeMs: 700 },
    reduced: 'hold',
  };
}

export function slide(id: string, target: string, metres: number): ModelSpecChannel {
  return {
    id,
    target,
    property: 'translate',
    axis: 'x',
    source: 'open',
    map: { type: 'linear', in: [0, 1], out: [0, metres], clamp: true },
    motion: { type: 'pose', easeMs: 800 },
    reduced: 'hold',
  };
}

export function openShot(focus: string): NonNullable<ModelSpec['shots']>[number] {
  return {
    id: 'opening',
    when: { anyOf: [{ allOf: [{ signal: 'open', op: 'gt', value: 0 }] }] },
    focus,
    zoom: 1.1,
    yaw: -10,
    pitch: 4,
    easeMs: 900,
    loopS: 1,
    symmetry: 360,
    stillAt: 1,
  };
}

export const DOOR_STATES: ModelSpec['states'] = {
  closed: { open: 0 },
  ajar: { open: 0.35 },
  open: { open: 1 },
};
