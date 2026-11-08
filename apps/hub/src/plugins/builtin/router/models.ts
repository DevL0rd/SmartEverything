import type {
  ModelMatch,
  ModelSpec,
  ModelSpecChannel,
  ModelSpecPart,
} from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.1, focus: 'shell' } as const;

const BODY = 0.264;
const HALF = BODY / 2;
const FOOT_H = 0.008;
const SHELL_H = 0.066;
const SHELL_Y = FOOT_H + SHELL_H / 2;
const TOP = FOOT_H + SHELL_H;
const HINGE_INSET = 0.014;
const HINGE = HALF - HINGE_INSET;
const HINGE_Y = TOP - 0.008;
const STALK = 0.137;
const LEAN = 22;
const LEAN_RAD = (LEAN * Math.PI) / 180;
const SPREAD = 0.085;
const REACH = HINGE + (STALK / 2) * Math.sin(LEAN_RAD);
const RISE = HINGE_Y + (STALK / 2) * Math.cos(LEAN_RAD);
const ROG_RED = '#D93A4C';
const WARNING = '#F2A04E';
const POSE = { type: 'pose', easeMs: 300 } as const;

type Side = 'right' | 'left' | 'back' | 'front';

const SIDES: readonly Side[] = ['right', 'left', 'back', 'front'];

const SIDE_SIGN: Readonly<Record<Side, number>> = { right: 1, left: -1, back: -1, front: 1 };

function antennaCentre(side: Side, along: number): [number, number, number] {
  const sign = SIDE_SIGN[side];
  const across = sign * REACH;
  return side === 'right' || side === 'left' ? [across, RISE, along] : [along, RISE, across];
}

function hingeCentre(side: Side, along: number): [number, number, number] {
  const sign = SIDE_SIGN[side];
  return side === 'right' || side === 'left'
    ? [sign * HINGE, HINGE_Y, along]
    : [along, HINGE_Y, sign * HINGE];
}

function antennaRotation(side: Side): [number, number, number] {
  const sign = SIDE_SIGN[side];
  return side === 'right' || side === 'left' ? [0, 0, -sign * LEAN] : [sign * LEAN, 0, 0];
}

function antennaParts(side: Side, along: number, index: number): ModelSpecPart[] {
  const sideways = side === 'right' || side === 'left';
  const stalk: ModelSpecPart = {
    id: `antenna${String(index)}`,
    geometry: {
      type: 'roundedBox',
      width: sideways ? 0.008 : 0.012,
      height: STALK,
      depth: sideways ? 0.012 : 0.008,
      radius: 0.0035,
      segments: 3,
    },
    material: 'shell',
    transform: { position: antennaCentre(side, along), rotation: antennaRotation(side) },
  };
  const hinge: ModelSpecPart = {
    id: `hinge${String(index)}`,
    geometry: { type: 'sphere', radius: 0.0065, segments: 12 },
    material: 'trim',
    transform: { position: hingeCentre(side, along) },
    minLod: 1,
  };
  return [stalk, hinge];
}

const ANTENNAS: readonly ModelSpecPart[] = SIDES.flatMap((side, sideIndex) =>
  [-SPREAD, SPREAD].flatMap((along, slot) => antennaParts(side, along, sideIndex * 2 + slot + 1)),
);

const PORTS: readonly ModelSpecPart[] = [-0.056, -0.028, 0, 0.028, 0.056].map((x, index) => ({
  id: `port${String(index + 1)}`,
  geometry: {
    type: 'roundedBox',
    width: 0.018,
    height: 0.012,
    depth: 0.003,
    radius: 0.0012,
    segments: 3,
  },
  material: 'trim',
  transform: { position: [x, 0.03, -HALF + 0.0004] },
  minLod: 2,
}));

const PARTS: readonly ModelSpecPart[] = [
  {
    id: 'foot',
    geometry: {
      type: 'roundedBox',
      width: 0.2,
      height: FOOT_H,
      depth: 0.2,
      radius: 0.003,
      segments: 3,
    },
    material: 'trim',
    transform: { position: [0, FOOT_H / 2, 0] },
    contact: true,
  },
  {
    id: 'shell',
    geometry: {
      type: 'roundedBox',
      width: BODY,
      height: SHELL_H,
      depth: BODY,
      radius: 0.016,
      segments: 5,
    },
    material: 'shell',
    transform: { position: [0, SHELL_Y, 0] },
  },
  {
    id: 'aura',
    geometry: { type: 'roundedPlane', width: 0.2, height: 0.2, radius: 0.016, segments: 6 },
    material: 'accent',
    transform: { position: [0, TOP + 0.0004, 0], rotation: [-90, 0, 0] },
    minLod: 1,
  },
  {
    id: 'glass',
    geometry: { type: 'roundedPlane', width: 0.238, height: 0.238, radius: 0.012, segments: 6 },
    material: 'glass',
    transform: { position: [0, TOP + 0.0008, 0], rotation: [-90, 0, 0] },
  },
  {
    id: 'led',
    geometry: {
      type: 'roundedBox',
      width: 0.05,
      height: 0.003,
      depth: 0.002,
      radius: 0.001,
      segments: 3,
    },
    material: 'accent',
    transform: { position: [0, TOP - 0.01, HALF - 0.0004] },
    minLod: 1,
  },
  ...PORTS,
  ...ANTENNAS,
];

function pose(
  id: string,
  target: string,
  source: string,
  table: Record<string, number | string>,
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'emissive',
    source,
    map: { type: 'enum', table },
    motion: POSE,
    reduced: 'hold',
  };
}

const CHANNELS: readonly ModelSpecChannel[] = [
  {
    id: 'auraLevel',
    target: 'aura',
    property: 'emissive',
    source: 'level',
    map: { type: 'linear', in: [0, 1], out: [0.5, 1.5], clamp: true },
    motion: POSE,
    reduced: 'hold',
  },
  {
    id: 'auraTraffic',
    target: 'aura',
    property: 'emissive',
    source: 'level',
    map: { type: 'linear', in: [0, 1], out: [0, 1], clamp: true },
    motion: { type: 'pulse', periodS: 1.2, amplitude: 0.5 },
    reduced: 'hold',
  },
  pose('auraOffline', 'aura', 'online', { false: 0 }),
  { ...pose('auraShow', 'aura', 'online', { true: 1, false: 0 }), property: 'opacity' },
  pose('ledOnline', 'led', 'online', { true: 0.8, false: 0 }),
  pose('auraGlowOnline', 'auraGlow', 'online', { true: 0.9, false: 0 }),
  {
    id: 'ledFault',
    target: 'led',
    property: 'colour',
    source: 'fault',
    map: { type: 'enum', table: { true: WARNING } },
    motion: POSE,
    reduced: 'hold',
  },
  {
    id: 'ledFaultGlow',
    target: 'led',
    property: 'emissive',
    source: 'fault',
    map: { type: 'enum', table: { true: 1 } },
    motion: { type: 'pulse', periodS: 1, amplitude: 0.6 },
    reduced: 'hold',
  },
];

export const ASUS_GT_AXE16000_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.router.asus-gt-axe16000',
  version: '1.0.0',
  title: 'ASUS ROG Rapture GT-AXE16000',
  category: 'network',
  family: 'router',
  footprint: { width: 0.354, depth: 0.354, height: 0.193 },
  framing: {
    tile: { ...HOUSE, padding: 0.06, focus: 'shell' },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12 },
  },
  shots: [
    {
      id: 'traffic',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'online', op: 'eq', value: true },
              { signal: 'level', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'led',
      zoom: 1.2,
      yaw: 12,
      pitch: 14,
      easeMs: 700,
      loopS: 1.2,
      symmetry: 360,
      stillAt: 0.3,
    },
  ],
  meta: {
    names: {
      display: 'ASUS ROG Rapture GT-AXE16000',
      synonyms: ['router', 'wifi router', 'gaming router', 'GT-AXE16000', 'Wi-Fi 6E router'],
    },
    sizeClass: 'large',
    aliases: ['GT-AXE16000'],
  },
  materials: {
    shell: { finish: 'satin-black' },
    glass: { finish: 'smoked-acrylic', opacity: 0.8 },
    trim: { finish: 'graphite' },
    accent: { color: ROG_RED, roughness: 0.3 },
  },
  finishes: { black: {} },
  defaultFinish: 'black',
  parts: [...PARTS],
  anchors: [
    {
      kind: 'emitter',
      id: 'auraGlow',
      parent: 'aura',
      position: [0, 0, 0.004],
      color: ROG_RED,
      intensity: 0.9,
      radius: 0.18,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.193 + 0.03, 0] },
    { kind: 'hit', id: 'body', position: [0, 0.0965, 0], size: [0.354, 0.193, 0.354] },
  ],
  channels: [...CHANNELS],
  states: {
    off: { online: false },
    on: { online: true, level: 0 },
    busy: { online: true, level: 0.8 },
    fault: { online: true, level: 0.2, fault: true },
  },
};

export const ROUTER_MODELS: readonly ModelSpec[] = [ASUS_GT_AXE16000_MODEL];

export const ROUTER_MODEL_MATCH: Partial<ModelMatch> = {
  exact: ['GT-AXE16000'],
  normalised: ['GT-AXE16000', 'ROG Rapture GT-AXE16000'],
};
