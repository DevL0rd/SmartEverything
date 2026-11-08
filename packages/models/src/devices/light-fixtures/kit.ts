import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecShot,
} from '@smarteverything/domain';

export const WARM_LIGHT = '#FFD9A0';

type Map = ModelSpecChannel['map'];

const TINT = { type: 'pose', easeMs: 250 } as const;
const RAMP = { type: 'pose', easeMs: 300 } as const;
const DECAY = { type: 'pose', easeMs: 450 } as const;
const DARK: Map = { type: 'enum', table: { false: 0 } };

function channel(
  [id, target]: readonly [string, string],
  [property, source]: readonly [ModelSpecChannel['property'], string],
  map: Map,
  motion: ModelSpecChannel['motion'],
): ModelSpecChannel {
  return { id, target, property, source, map, motion, reduced: 'hold' };
}

export function glowChannels(target: string, glow: readonly [number, number]): ModelSpecChannel[] {
  return [
    channel(
      [`${target}Warmth`, target],
      ['colour', 'colourTemperature'],
      { type: 'colour', from: 'temperature', kelvin: [2200, 6500] },
      TINT,
    ),
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
  ];
}

export function spillChannels(
  target: string,
  spread: readonly [number, number],
): ModelSpecChannel[] {
  return [
    ...glowChannels(target, [0.1, 1.2]),
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

export interface ShotView {
  readonly focus: string;
  readonly zoom: number;
  readonly yaw: number;
  readonly pitch: number;
}

export function glowShot(view: ShotView): ModelSpecShot {
  return {
    id: 'glow',
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
    symmetry: 360,
    stillAt: 0,
  };
}

export interface EmitterInput {
  readonly id: string;
  readonly parent: string;
  readonly position: readonly [number, number, number];
  readonly radius: number;
  readonly cone?: number;
  readonly intensity?: number;
}

export function emitter(input: EmitterInput): ModelSpecAnchor {
  return {
    kind: 'emitter',
    id: input.id,
    parent: input.parent,
    position: [...input.position],
    color: WARM_LIGHT,
    intensity: input.intensity ?? 1,
    radius: input.radius,
    ...(input.cone === undefined ? {} : { cone: input.cone }),
  };
}

export const LIGHT_STATES: NonNullable<ModelSpec['states']> = {
  off: { power: false },
  warm: { power: true, brightness: 0.8, colourTemperature: 2700 },
  daylight: { power: true, brightness: 1, colourTemperature: 6500 },
  colour: { power: true, brightness: 0.7, colour: '#5B47D6' },
  dim: { power: true, brightness: 0.12, colourTemperature: 2200 },
  offline: { online: false },
};

type LightInput = Omit<ModelSpec, 'schema' | 'version' | 'category' | 'family' | 'states'>;

export function lightModel(input: LightInput): ModelSpec {
  return {
    schema: 1,
    version: '1.0.0',
    category: 'light',
    family: 'light',
    ...input,
    states: LIGHT_STATES,
  };
}

type Geometry = ModelSpec['parts'][number]['geometry'];

export interface Round {
  readonly top: number;
  readonly bottom?: number;
  readonly height: number;
  readonly bevel?: number;
  readonly segments?: number;
}

export function cylinder(shape: Round): Geometry {
  return {
    type: 'cylinder',
    height: shape.height,
    topRadius: shape.top,
    bottomRadius: shape.bottom ?? shape.top,
    bevel: shape.bevel ?? Math.max(0.0004, 0.06 * Math.min(shape.top, shape.height)),
    segments: shape.segments ?? 48,
  };
}
