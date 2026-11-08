import { emitterChannels, type ModelSpec, type ModelSpecChannel } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 30, fov: 28, padding: 0.12, focus: 'shell' } as const;

const SIDE = 0.068;
const FOOT_H = 0.0015;
const SHELL_H = 0.0135;
const SHELL_Y = FOOT_H + SHELL_H / 2;
const TOP = FOOT_H + SHELL_H;
const DOME_R = 0.0125;
const DOME_THETA = 50;
const DOME_Y = TOP - DOME_R * Math.cos((DOME_THETA * Math.PI) / 180);
const BLUE = '#6FB7FF';
const WARNING = '#F2A04E';
const POSE = { type: 'pose', easeMs: 300 } as const;

type Route = readonly [target: string, property: ModelSpecChannel['property'], source: string];

function pose(
  id: string,
  [target, property, source]: Route,
  table: Record<string, number | string>,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: POSE,
    reduced: 'hold',
  };
}

function pulse(
  id: string,
  [target, source]: readonly [target: string, source: string],
  table: Record<string, number | string>,
  [periodS, amplitude]: readonly [periodS: number, amplitude: number],
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'emissive',
    source,
    map: { type: 'enum', table },
    motion: { type: 'pulse', periodS, amplitude },
    reduced: 'hold',
  };
}

export const TUYA_S06_PRO_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.ir.tuya-s06-pro',
  version: '1.0.0',
  title: 'Tuya S06 Pro IR blaster',
  category: 'infrared',
  family: 'ir_blaster',
  footprint: { width: SIDE, depth: SIDE, height: 0.02 },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'sending',
      when: { anyOf: [{ allOf: [{ signal: 'mode', op: 'eq', value: 'sending' }] }] },
      focus: 'ring',
      zoom: 1.3,
      yaw: 0,
      pitch: 12,
      easeMs: 600,
      loopS: 1,
      symmetry: 360,
      stillAt: 0.25,
    },
  ],
  meta: {
    names: {
      display: 'Tuya S06 Pro IR blaster',
      synonyms: ['IR blaster', 'infrared blaster', 'universal remote', 'S06 Pro', 'IR remote hub'],
    },
    sizeClass: 'small',
    aliases: ['S06ProWB3S'],
  },
  materials: {
    shell: { finish: 'matte-white' },
    lens: { finish: 'smoked-acrylic', opacity: 0.85 },
    trim: { finish: 'graphite' },
    accent: { color: BLUE, roughness: 0.3 },
  },
  finishes: { white: {} },
  defaultFinish: 'white',
  parts: [
    {
      id: 'foot',
      geometry: {
        type: 'roundedBox',
        width: SIDE - 0.014,
        height: FOOT_H + 0.001,
        depth: SIDE - 0.014,
        radius: 0.0008,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, (FOOT_H + 0.001) / 2, 0] },
      contact: true,
    },
    {
      id: 'shell',
      geometry: {
        type: 'roundedBox',
        width: SIDE,
        height: SHELL_H,
        depth: SIDE,
        radius: 0.011,
        segments: 6,
      },
      material: 'shell',
      transform: { position: [0, SHELL_Y, 0] },
    },
    {
      id: 'dome',
      geometry: { type: 'sphere', radius: DOME_R, thetaLength: DOME_THETA, segments: 48 },
      material: 'lens',
      transform: { position: [0, DOME_Y, 0] },
    },
    {
      id: 'ring',
      geometry: { type: 'ring', innerRadius: 0.0104, outerRadius: 0.0122, segments: 48 },
      material: 'accent',
      transform: { position: [0, TOP + 0.0003, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'led',
      geometry: {
        type: 'roundedBox',
        width: 0.0035,
        height: 0.0035,
        depth: 0.0012,
        radius: 0.0006,
        segments: 3,
      },
      material: 'accent',
      transform: { position: [0.022, TOP + 0.0001, 0.022], rotation: [-90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'reset',
      geometry: { type: 'ring', innerRadius: 0.0006, outerRadius: 0.0013, segments: 16 },
      material: 'trim',
      transform: { position: [-0.022, TOP + 0.0002, 0.022], rotation: [-90, 0, 0] },
      minLod: 2,
    },
    {
      id: 'usb',
      geometry: {
        type: 'roundedBox',
        width: 0.009,
        height: 0.0033,
        depth: 0.002,
        radius: 0.0012,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, SHELL_Y, -SIDE / 2 + 0.0004] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'emitter',
      id: 'irGlow',
      parent: 'ring',
      position: [0, 0, 0.002],
      color: BLUE,
      intensity: 0.8,
      radius: 0.03,
    },
    {
      kind: 'effect',
      id: 'sendRipple',
      parent: 'dome',
      position: [0, DOME_R, 0],
      effect: 'ripple',
      size: 0.12,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.02 + 0.02, 0] },
    { kind: 'hit', id: 'body', position: [0, 0.01, 0], size: [SIDE, 0.02, SIDE] },
  ],
  channels: [
    pulse('ringSend', ['ring', 'mode'], { sending: 1.4 }, [0.5, 0.8]),
    pose('glowSend', ['irGlow', 'emissive', 'mode'], { sending: 1 }),
    pose('ledOnline', ['led', 'emissive', 'online'], { true: 0.6, false: 0 }),
    pulse('ledLearn', ['led', 'mode'], { learning: 1.2 }, [1, 0.7]),
    pose('ledFault', ['led', 'colour', 'fault'], { true: WARNING }),
    pulse('ledFaultGlow', ['led', 'fault'], { true: 1 }, [1, 0.6]),
    ...['ring', 'irGlow', 'led'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { online: false },
    on: { online: true, mode: 'idle' },
    sending: { online: true, mode: 'sending' },
    learning: { online: true, mode: 'learning' },
    fault: { online: true, fault: true },
  },
};

export const TUYA_MODELS: readonly ModelSpec[] = [TUYA_S06_PRO_MODEL];
