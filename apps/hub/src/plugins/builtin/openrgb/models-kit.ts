import type {
  ModelMatch,
  ModelSpec,
  ModelSpecChannel,
  ModelSpecGeometry,
  ModelSpecPart,
  ModelSpecShot,
} from '@smarteverything/domain';

export const OPENRGB_DEVICE_TYPE_PRODUCTS = {
  motherboard: 'openrgb-motherboard',
  dram: 'openrgb-dram',
  gpu: 'openrgb-gpu',
  cooler: 'openrgb-cooler',
  keyboard: 'openrgb-keyboard',
  mouse: 'openrgb-mouse',
} as const;

export type OpenRgbKind = keyof typeof OPENRGB_DEVICE_TYPE_PRODUCTS;

export function openRgbMatch(kind: OpenRgbKind): Partial<ModelMatch> {
  return { product: [OPENRGB_DEVICE_TYPE_PRODUCTS[kind]] };
}

export const RGB_LED = '#F4F1FF';

export const RGB_UNLIT = '#4A4D55';

const TINT = { type: 'pose', easeMs: 250 } as const;
const RAMP = { type: 'pose', easeMs: 300 } as const;
const DECAY = { type: 'pose', easeMs: 450 } as const;
const DARK: ModelSpecChannel['map'] = { type: 'enum', table: { false: 0 } };
const UNLIT: ModelSpecChannel['map'] = { type: 'enum', table: { false: RGB_UNLIT } };

function channel(
  [id, target]: readonly [string, string],
  [property, source]: readonly [ModelSpecChannel['property'], string],
  map: ModelSpecChannel['map'],
  motion: ModelSpecChannel['motion'],
): ModelSpecChannel {
  return { id, target, property, source, map, motion, reduced: 'hold' };
}

export function rgbChannels(target: string, glow: readonly [number, number]): ModelSpecChannel[] {
  return [
    channel(
      [`${target}Tint`, target],
      ['colour', 'colour'],
      { type: 'colour', from: 'signal' },
      TINT,
    ),
    channel(
      [`${target}Level`, target],
      ['emissive', 'brightness'],
      { type: 'linear', in: [0, 1], out: [glow[0], glow[1]], clamp: true },
      RAMP,
    ),
    channel([`${target}Off`, target], ['emissive', 'power'], DARK, DECAY),
    channel([`${target}Offline`, target], ['emissive', 'online'], DARK, DECAY),
    channel([`${target}Unlit`, target], ['colour', 'power'], UNLIT, DECAY),
    channel([`${target}Dead`, target], ['colour', 'online'], UNLIT, DECAY),
  ];
}

export function spillChannels(
  target: string,
  spread: readonly [number, number],
): ModelSpecChannel[] {
  return [
    ...rgbChannels(target, [0.1, 1.3]),
    channel(
      [`${target}Spread`, target],
      ['opacity', 'brightness'],
      { type: 'linear', in: [0, 1], out: [spread[0], spread[1]], clamp: true },
      RAMP,
    ),
    channel([`${target}Dark`, target], ['opacity', 'power'], DARK, DECAY),
    channel([`${target}Gone`, target], ['opacity', 'online'], DARK, DECAY),
  ];
}

export function spinChannel(target: string, axis: 'x' | 'y' | 'z'): ModelSpecChannel {
  return {
    id: `${target}Spin`,
    target,
    property: 'rotate',
    axis,
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] },
    motion: { type: 'spin' },
    reduced: 'hold',
  };
}

export interface ShotView {
  readonly focus: string;
  readonly zoom: number;
  readonly yaw: number;
  readonly pitch: number;
}

export function rgbShot(view: ShotView, symmetry = 360): ModelSpecShot {
  return {
    id: 'lit',
    when: {
      anyOf: [
        {
          allOf: [
            { signal: 'power', op: 'eq', value: true },
            { signal: 'brightness', op: 'gt', value: 0 },
          ],
        },
      ],
    },
    ...view,
    easeMs: 800,
    loopS: 1,
    symmetry,
    stillAt: 0,
  };
}

export const RGB_STATES: NonNullable<ModelSpec['states']> = {
  off: { power: false },
  violet: { power: true, brightness: 1, colour: '#7B5CFF' },
  red: { power: true, brightness: 0.9, colour: '#FF3B5C' },
  cyan: { power: true, brightness: 0.85, colour: '#22D3EE' },
  dim: { power: true, brightness: 0.15, colour: '#7B5CFF' },
  offline: { online: false },
};

type RgbInput = Omit<ModelSpec, 'schema' | 'version' | 'category' | 'family' | 'states'>;

export function rgbModel(
  input: RgbInput,
  states: NonNullable<ModelSpec['states']> = RGB_STATES,
): ModelSpec {
  return {
    schema: 1,
    version: '1.0.0',
    category: 'rgb',
    family: 'light',
    ...input,
    states,
  };
}

export type Size3 = readonly [number, number, number];

export function box(size: Size3, segments = 4, round = 0.2): ModelSpecGeometry {
  return {
    type: 'roundedBox',
    width: size[0],
    height: size[1],
    depth: size[2],
    radius: Math.max(0.0003, round * Math.min(size[0], size[1], size[2])),
    segments,
  };
}

export interface Round {
  readonly radius: number;
  readonly height: number;
  readonly bevel?: number;
  readonly segments?: number;
}

export function disc(shape: Round): ModelSpecGeometry {
  return {
    type: 'cylinder',
    height: shape.height,
    topRadius: shape.radius,
    bottomRadius: shape.radius,
    bevel: shape.bevel ?? Math.max(0.0003, 0.1 * Math.min(shape.radius, shape.height)),
    segments: shape.segments ?? 48,
  };
}

export function piece(
  id: string,
  geometry: ModelSpecGeometry,
  material: string,
  options: Omit<ModelSpecPart, 'id' | 'geometry' | 'material'> = {},
): ModelSpecPart {
  return { id, geometry, material, ...options };
}

type Matrix = readonly [Size3, Size3, Size3];

const DEGREE = Math.PI / 180;

function multiply(a: Matrix, [b0, b1, b2]: Matrix): Matrix {
  const row = ([x, y, z]: Size3): Size3 => [
    x * b0[0] + y * b1[0] + z * b2[0],
    x * b0[1] + y * b1[1] + z * b2[1],
    x * b0[2] + y * b1[2] + z * b2[2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

function aboutY(degrees: number): Matrix {
  const c = Math.cos(degrees * DEGREE);
  const s = Math.sin(degrees * DEGREE);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function aboutZ(degrees: number): Matrix {
  const c = Math.cos(degrees * DEGREE);
  const s = Math.sin(degrees * DEGREE);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

const FLAT_TO_RADIAL: Matrix = [
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];

export function bladeRotation(angle: number, pitch: number): Size3 {
  const m = multiply(multiply(aboutY(angle), aboutZ(pitch)), FLAT_TO_RADIAL);
  const y = Math.asin(Math.max(-1, Math.min(1, m[0][2])));
  const x = Math.atan2(-m[1][2], m[2][2]);
  const z = Math.atan2(-m[0][1], m[0][0]);
  return [x / DEGREE, y / DEGREE, z / DEGREE];
}

export interface FanInput {
  readonly id: string;
  readonly parent: string;
  readonly at: Size3;
  readonly radius: number;
  readonly blades: number;
  readonly turn: Size3;
  readonly blade: string;
}

export function fanRotor(input: FanInput): ModelSpecPart[] {
  const { id, parent, at, radius, blades, turn, blade } = input;
  const hub = radius * 0.36;
  const span = radius - hub - radius * 0.04;
  const rotor = piece(id, disc({ radius: hub, height: radius * 0.22, segments: 40 }), 'trim', {
    parent,
    transform: { position: [...at], rotation: [...turn] },
  });
  const cap = piece(
    `${id}Cap`,
    { type: 'ring', innerRadius: hub * 0.45, outerRadius: hub * 0.7, segments: 32 },
    'body',
    {
      parent: id,
      transform: { position: [0, radius * 0.111 + 0.0003, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    },
  );
  const vanes = Array.from({ length: blades }, (_, index) => {
    const angle = (360 * index) / blades;
    const rad = (angle * Math.PI) / 180;
    const middle = hub + span / 2;
    return piece(
      `${id}Blade${String(index + 1)}`,
      {
        type: 'roundedPlane',
        width: radius * 0.46,
        height: span,
        radius: radius * 0.14,
        segments: 4,
      },
      blade,
      {
        parent: id,
        transform: {
          position: [middle * Math.sin(rad), 0, middle * Math.cos(rad)],
          rotation: [...bladeRotation(angle, 28)],
        },
      },
    );
  });
  return [rotor, cap, ...vanes];
}
