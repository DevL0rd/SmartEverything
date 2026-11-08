import {
  emitterChannels,
  type ModelSpec,
  type ModelSpecChannel,
  type ModelSpecCondition,
} from '@smarteverything/domain';
import { DOOR_Y, FRONT, LAUNDRY_PARTS, PANEL_Y, PROGRESS_SEGMENTS } from './laundry-parts';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.1, focus: 'cabinet' } as const;

const WATER_BLUE = '#5EA8D3';

const WATER_PHASES = ['prewash', 'soak', 'wash', 'rinse'] as const;
const TUMBLE_PHASES = [...WATER_PHASES, 'weighing', 'anti_crease'] as const;
const HEAT_PHASES = ['dry', 'cool', 'steam', 'care'] as const;
const IDLE_PHASES = ['off', 'idle', 'delayed', 'paused', 'finished', 'drum_clean_done'] as const;
const ALL_PHASES = [...IDLE_PHASES, ...TUMBLE_PHASES, 'spin', ...HEAT_PHASES, 'fault'] as const;

function phaseIn(phases: readonly string[]): ModelSpecCondition {
  return { anyOf: phases.map((value) => ({ allOf: [{ signal: 'phase', op: 'eq', value }] })) };
}

function table(
  phases: readonly string[],
  on: number | string,
  rest?: number | string,
): Record<string, number | string> {
  const lit = Object.fromEntries(phases.map((phase) => [phase, on]));
  if (rest === undefined) return lit;
  return { ...Object.fromEntries(ALL_PHASES.map((phase) => [phase, rest])), ...lit };
}

function emitterGates(id: string, target: string): ModelSpecChannel[] {
  return [
    enumPose(`${id}Off`, [target, 'emissive', 'power'], { false: 0 }, 450),
    enumPose(`${id}Offline`, [target, 'emissive', 'online'], { false: 0 }, 450),
  ];
}

function drumTurn(
  id: string,
  source: string,
  map: ModelSpecChannel['map'],
  motion: ModelSpecChannel['motion'],
): ModelSpecChannel {
  return {
    id,
    target: 'drum',
    property: 'rotate',
    axis: 'y',
    source,
    map,
    motion,
    reduced: 'hold',
  };
}

const DRUM_CHANNELS: ModelSpecChannel[] = [
  drumTurn(
    'tumble',
    'phase',
    { type: 'enum', table: table(TUMBLE_PHASES, 1) },
    { type: 'oscillate', limits: [-60, 60], speed: 80 },
  ),
  drumTurn('dryTurn', 'phase', { type: 'enum', table: table(HEAT_PHASES, 0.4) }, { type: 'spin' }),
  drumTurn(
    'spinTurn',
    'drumSpeed',
    { type: 'speed', in: [400, 1400], perSecond: [1, 3] },
    { type: 'spin' },
  ),
  enumPose(
    'waterPose',
    ['water', 'pose', 'phase'],
    { ...table(ALL_PHASES, 'empty'), ...table(WATER_PHASES, 'high'), rinse: 'medium', spin: 'low' },
    900,
  ),
  enumPose('waterTint', ['water', 'colour', 'phase'], {
    ...table(WATER_PHASES, WATER_BLUE),
    spin: WATER_BLUE,
  }),
  enumPose(
    'waterShow',
    ['water', 'opacity', 'phase'],
    { ...table(ALL_PHASES, 0), ...table(WATER_PHASES, 0.55), spin: 0.4 },
    900,
  ),
];

function progressStep(index: number): ModelSpecChannel[] {
  const at = (index + 0.5) / PROGRESS_SEGMENTS;
  const step = (
    id: string,
    property: ModelSpecChannel['property'],
    top: number,
  ): ModelSpecChannel => ({
    id: `${id}${String(index + 1)}`,
    target: `progress${String(index + 1)}`,
    property,
    source: 'progress',
    map: { type: 'linear', in: [at - 0.001, at], out: [0, top], clamp: true },
    motion: { type: 'pose', easeMs: 300 },
    reduced: 'hold',
  });
  return [step('arcShow', 'opacity', 1), step('arcLit', 'emissive', 1.1)];
}

const PROGRESS_CHANNELS: ModelSpecChannel[] = Array.from(
  { length: PROGRESS_SEGMENTS },
  (_, index) => progressStep(index),
).flat();

type Route = readonly [target: string, property: ModelSpecChannel['property'], source: string];

function enumPose(
  id: string,
  [target, property, source]: Route,
  values: Record<string, number | string>,
  easeMs = 300,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table: values },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

const PANEL_CHANNELS: ModelSpecChannel[] = [
  enumPose(
    'doorPose',
    ['door', 'pose', 'door'],
    { open: 'open', closed: 'closed', locked: 'closed' },
    600,
  ),
  enumPose('lockShow', ['lockDot', 'opacity', 'door'], { locked: 1, closed: 0, open: 0 }),
  enumPose('lockGlow', ['lockDot', 'emissive', 'door'], { locked: 1.4, closed: 0, open: 0 }),
  enumPose('faultTint', ['panel', 'colour', 'fault'], { true: '#BA3C4A' }, 250),
];

const LIGHT_CHANNELS: ModelSpecChannel[] = [
  enumPose('drumLamp', ['drumLight', 'emissive', 'lamp'], { true: 1, false: 0 }),
  ...emitterGates('drumLamp', 'drumLight'),
  enumPose('dryHeat', ['dryGlow', 'emissive', 'phase'], {
    ...table(ALL_PHASES, 0),
    dry: 1,
    cool: 0.3,
  }),
  ...emitterGates('dryHeat', 'dryGlow'),
];

function drumShot(
  id: string,
  phases: readonly string[],
  [zoom, loopS, stillAt]: readonly [zoom: number, loopS: number, stillAt: number],
): NonNullable<ModelSpec['shots']>[number] {
  return {
    id,
    when: phaseIn(phases),
    focus: 'doorGlass',
    zoom,
    yaw: 22,
    pitch: 16,
    easeMs: 1000,
    loopS,
    symmetry: 120,
    stillAt,
  };
}

export const MIJIA_WASHER_DRYER_F29GL_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.laundry.mijia-washer-dryer-f29gl',
  version: '1.0.0',
  title: 'Mijia washer-dryer',
  category: 'appliance',
  family: 'laundry',
  footprint: { width: 0.598, depth: 0.57, height: 0.85 },
  framing: { tile: HOUSE, card: HOUSE, hero: { ...HOUSE, padding: 0.12 } },
  shots: [
    drumShot('spin', ['spin'], [1.5, 1, 0.33]),
    drumShot('wash', TUMBLE_PHASES, [1.5, 3, 1.5]),
    drumShot('dry', HEAT_PHASES, [1.4, 7.5, 2]),
  ],
  meta: {
    names: {
      display: 'Mijia washer-dryer',
      synonyms: ['washer dryer', 'washing machine', 'washer', 'dryer', 'laundry'],
    },
    sizeClass: 'large',
    aliases: ['mibx5.washer.f29gl'],
  },
  materials: {
    body: { finish: 'matte-white', roughness: 0.38, clearcoat: 0.8 },
    glass: { finish: 'smoked-acrylic', opacity: 0.62 },
    metal: { finish: 'chrome', roughness: 0.16 },
    accent: { color: '#F2B45E', roughness: 0.2, opacity: 0 },
  },
  parts: LAUNDRY_PARTS,
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      position: [0.07, PANEL_Y, FRONT + 0.002],
      width: 0.34,
      height: 0.074,
    },
    {
      kind: 'effect',
      id: 'drumWater',
      position: [0, DOOR_Y, FRONT + 0.01],
      effect: 'water',
      size: 0.34,
    },
    { kind: 'effect', id: 'ventSteam', position: [0, 0.85, -0.2], effect: 'steam', size: 0.2 },
    {
      kind: 'emitter',
      id: 'drumLight',
      position: [0, DOOR_Y + 0.12, FRONT - 0.02],
      color: '#E6EAF0',
      intensity: 0.6,
      radius: 0.12,
      cone: 120,
    },
    {
      kind: 'emitter',
      id: 'dryGlow',
      position: [0, DOOR_Y - 0.04, FRONT + 0.03],
      color: '#F2B45E',
      intensity: 0.5,
      radius: 0.14,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 0.9, 0] },
  ],
  channels: [
    ...DRUM_CHANNELS,
    ...PANEL_CHANNELS,
    ...LIGHT_CHANNELS,
    ...PROGRESS_CHANNELS,
    ...emitterChannels('lockDot'),
    enumPose('progressArcsOff', ['progressArcs', 'visible', 'power'], { false: 0 }),
    enumPose('progressArcsOffline', ['progressArcs', 'visible', 'online'], { false: 0 }),
  ],
  states: {
    off: { power: false, door: 'closed', lamp: false },
    idleOpen: { power: true, phase: 'idle', door: 'open', lamp: true },
    washing: { power: true, phase: 'wash', progress: 0.3, door: 'locked', lamp: false },
    rinsing: { power: true, phase: 'rinse', progress: 0.6, door: 'locked', lamp: false },
    spin: {
      power: true,
      phase: 'spin',
      drumSpeed: 1400,
      progress: 0.8,
      door: 'locked',
      lamp: false,
    },
    drying: { power: true, phase: 'dry', progress: 0.9, door: 'locked', lamp: false },
    done: { power: true, phase: 'finished', door: 'closed', lamp: false },
    fault: { power: true, phase: 'fault', fault: true, door: 'closed', lamp: false },
    offline: { online: false },
  },
};
