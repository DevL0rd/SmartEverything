import type { ModelSpec } from '@smarteverything/domain';

export type Part = ModelSpec['parts'][number];
export type Channel = ModelSpec['channels'] extends readonly (infer C)[] | undefined ? C : never;
export type Vec = [number, number, number];
type Extra = Partial<Pick<Part, 'parent' | 'minLod' | 'contact'>> & {
  rotation?: Vec;
  segments?: number;
};

export const WORKING = ['cleaning', 'mopping', 'mapping', 'remote', 'summoned'] as const;
export const BUSY = ['wash_mop', 'rewash', 'dry', 'air_dry', 'dust', 'cut_hair'] as const;
export const PRIMARY = '#5ED3CF';
export const INFO = '#8EAEFF';
export const WARNING = '#F2C14E';
export const CAUTION = '#F29A4E';
export const LED = '#F6F0C8';
export const CONTACT = '#D9B45C';
export const TURRET_Y = 0.076;
export const TURRET_H = 0.028;
export const LIDAR_RISE = 0.02;
export const TURRET_Z = 0.03;

export function table(
  keys: readonly string[],
  value: number | string,
): Record<string, number | string> {
  return Object.fromEntries(keys.map((key) => [key, value]));
}

interface Solid extends Extra {
  readonly id: string;
  readonly material: string;
  readonly at: Vec;
}

export function box({
  id,
  material,
  at,
  rotation,
  size,
  radius,
  segments = 3,
  ...rest
}: Solid & { size: Vec; radius: number }): Part {
  return {
    id,
    geometry: {
      type: 'roundedBox',
      width: size[0],
      height: size[1],
      depth: size[2],
      radius,
      segments,
    },
    material,
    transform: rotation === undefined ? { position: at } : { position: at, rotation },
    ...rest,
  };
}

export function cylinder({
  id,
  material,
  at,
  rotation,
  radius,
  height,
  segments = 48,
  ...rest
}: Solid & { radius: number; height: number }): Part {
  return {
    id,
    geometry: {
      type: 'cylinder',
      height,
      topRadius: radius,
      bottomRadius: radius,
      bevel: Math.min(radius, height) * 0.3,
      segments,
    },
    material,
    transform: rotation === undefined ? { position: at } : { position: at, rotation },
    ...rest,
  };
}

type Link = readonly [id: string, target: string, property: Channel['property'], source: string];

export function channel(
  [id, target, property, source]: Link,
  entries: Record<string, number | string | boolean>,
  motion: Channel['motion'],
  axis?: Channel['axis'],
): Channel {
  const base = {
    id,
    target,
    property,
    source,
    map: { type: 'enum' as const, table: entries },
    motion,
    reduced: 'hold' as const,
  };
  return axis === undefined ? base : { ...base, axis };
}

export const POSE = { type: 'pose', easeMs: 300 } as const;
export const SPRING = { type: 'pose', easeMs: 400 } as const;
export const SPIN = { type: 'spin' } as const;

export const ROBOT_PROFILE: [number, number][] = [
  [0, 0],
  [0.16, 0],
  [0.1712, 0.008],
  [0.175, 0.02],
  [0.175, 0.066],
  [0.175, 0.074],
  [0.169, 0.085],
  [0.1615, 0.0892],
  [0.158, 0.09],
  [0, 0.09],
];

export const ARMS = [0, 120, 240].map((angle, index): Part =>
  box({
    id: `brushArm${String(index + 1)}`,
    size: [0.04, 0.0024, 0.0055],
    radius: 0.0011,
    material: 'trim',
    at: [
      0.026 * Math.cos((angle * Math.PI) / 180),
      -0.0012,
      -0.026 * Math.sin((angle * Math.PI) / 180),
    ],
    rotation: [0, angle, -4],
    parent: 'sideBrush',
    minLod: 1,
  }),
);

const ARC_COUNT = 8;
const ARC_RADIUS = 0.1175;
const ARC_HIDDEN_Y = 0.0886;
const ARC_RISE = 0.0034;
const ARC_STEPS = 2;

function arcPoints(index: number): Vec[] {
  const span = (2 * Math.PI) / ARC_COUNT;
  return Array.from({ length: ARC_STEPS + 1 }, (_, step): Vec => {
    const turn = Math.PI / 2 - index * span - (step / ARC_STEPS) * span;
    return [ARC_RADIUS * Math.cos(turn), 0, -ARC_RADIUS * Math.sin(turn)];
  });
}

export const PROGRESS_ARCS = Array.from({ length: ARC_COUNT }, (_, index): Part => ({
  id: `progressArc${String(index + 1)}`,
  parent: 'body',
  geometry: { type: 'tube', points: arcPoints(index), radius: 0.0015, segments: 4 },
  material: 'accent',
  transform: { position: [0, ARC_HIDDEN_Y, 0] },
  minLod: 1,
}));

function arcRange(index: number): [number, number] {
  return [index / ARC_COUNT, (index + 1) / ARC_COUNT];
}

export const PROGRESS_ARC_CHANNELS = PROGRESS_ARCS.flatMap((arc, index): Channel[] => [
  {
    id: `${arc.id}Rise`,
    target: arc.id,
    property: 'translate',
    axis: 'y',
    source: 'progress',
    map: { type: 'linear', in: arcRange(index), out: [0, ARC_RISE], clamp: true },
    motion: POSE,
    reduced: 'hold',
  },
  {
    id: `${arc.id}Lit`,
    target: arc.id,
    property: 'emissive',
    source: 'progress',
    map: { type: 'linear', in: arcRange(index), out: [0, 1.6], clamp: true },
    motion: POSE,
    reduced: 'hold',
  },
]);

export const LENSES = [-0.24, -0.08, 0.08, 0.24].map((angle, index): Part => ({
  id: `lens${String(index + 1)}`,
  parent: 'body',
  geometry: { type: 'sphere', radius: index === 3 ? 0.0024 : 0.0034, segments: 12 },
  material: index === 3 ? 'accent' : 'trim',
  transform: { position: [0.1772 * Math.sin(angle), 0.051, 0.1772 * Math.cos(angle)] },
  minLod: 2,
}));

export const LEGS = [-0.1, 0.1].flatMap((x, index): Part[] => [
  cylinder({
    id: `leg${String(index + 1)}`,
    radius: 0.0065,
    height: 0.03,
    material: 'trim',
    at: [x, -0.012, -0.02],
    parent: 'body',
    minLod: 1,
    segments: 16,
  }),
  cylinder({
    id: `wheel${String(index + 1)}`,
    radius: 0.018,
    height: 0.012,
    material: 'trim',
    at: [x * 0.92, -0.026, -0.02],
    parent: 'body',
    minLod: 1,
    segments: 20,
    rotation: [0, 0, 90],
  }),
]);

export const ROBOT_STATES: NonNullable<ModelSpec['states']> = {
  asleep: { power: false, phase: 'docked_full', fault: false, lifted: false },
  charging: { power: true, phase: 'charging', charging: true, fault: false, battery: 0.5 },
  cleaning: {
    power: true,
    phase: 'cleaning',
    cleanMode: 'sweep',
    lidarRaised: true,
    fault: false,
    lifted: false,
    battery: 0.8,
  },
  mopping: {
    power: true,
    phase: 'mopping',
    cleanMode: 'mop',
    lidarRaised: true,
    fault: false,
    lifted: false,
    battery: 0.7,
  },
  sweepMop: {
    power: true,
    phase: 'cleaning',
    cleanMode: 'sweep_mop',
    lidarRaised: true,
    fault: false,
    lifted: false,
    battery: 0.7,
  },
  mapping: {
    power: true,
    phase: 'mapping',
    lidarRaised: true,
    fault: false,
    lifted: false,
    battery: 0.9,
  },
  returning: { power: true, phase: 'returning', fault: false, lifted: false, battery: 0.3 },
  paused: { power: true, phase: 'paused', fault: false, lifted: false },
  lowBattery: {
    power: true,
    phase: 'idle',
    batteryLow: true,
    fault: false,
    lifted: false,
    battery: 0.12,
  },
  washing: {
    power: true,
    phase: 'washing_mop',
    mode: 'wash_mop',
    progress: 0.5,
    fault: false,
    lifted: false,
  },
  lifted: { power: true, phase: 'paused', fault: true, lifted: true },
  offline: { online: false },
};
