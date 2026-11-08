import {
  emitterChannels,
  type ModelSpec,
  type ModelSpecChannel,
  type ModelSpecPart,
} from '@smarteverything/domain';
import { look } from './screen-picture';

type Path = Extract<ModelSpecPart['geometry'], { type: 'extrude' }>['path'];

const CURVE_R = 1.8;
const OUTER_ARC = 1.2177;
const ACTIVE_ARC = 1.1985;
const PANEL_H = 0.355;
const ACTIVE_H = 0.3375;
const PANEL_T = 0.008;
const BEVEL = 0.0015;
const APEX_Z = 0.0165;
const PANEL_Y = 0.3518;
const HUB_BACK = -0.0623;
const HUB_FRONT = 0.014;
const STEPS = 32;
const FLIP: [number, number, number] = [90, 0, 0];

const FRONT_VIEW = { yaw: 22, pitch: 12, fov: 28, padding: 0.08, focus: 'screen' } as const;

function arcPoint(radius: number, angle: number): [number, number] {
  return [radius * Math.sin(angle), CURVE_R - radius * Math.cos(angle)];
}

function strip(from: number, to: number, near: number, far: number): Path {
  const along = Array.from({ length: STEPS + 1 }, (_, i) => from + ((to - from) * i) / STEPS);
  const front = along.map((angle) => arcPoint(near, angle));
  const back = along.map((angle) => arcPoint(far, angle)).reverse();
  const points = [...front, ...back];
  const [startX = 0, startY = 0] = points[0] ?? [];
  return [
    ...points.map(([x, y], index) => ({ op: index === 0 ? 'move' : 'line', x, y }) as const),
    { op: 'line', x: startX, y: startY },
  ];
}

interface Curve {
  readonly angles: readonly [number, number];
  readonly radii: readonly [number, number];
  readonly height: number;
  readonly bevel?: number;
}

function curved(id: string, material: string, curve: Curve): ModelSpecPart {
  const [from, to] = curve.angles;
  const [near, far] = curve.radii;
  return {
    id,
    geometry: {
      type: 'extrude',
      path: strip(from, to, near, far),
      depth: curve.height,
      ...(curve.bevel === undefined ? {} : { bevel: curve.bevel }),
    },
    material,
    transform: { position: [0, PANEL_Y, APEX_Z], rotation: FLIP },
  };
}

const OUTER_HALF = OUTER_ARC / 2 / CURVE_R - BEVEL / CURVE_R;
const ACTIVE_HALF = ACTIVE_ARC / 2 / CURVE_R;

const GLOWS = [
  { id: 'auroraA', angle: -0.27, y: 0.02, size: [0.34, 0.26], home: '#4F8BFF', playing: '#2FB5A8' },
  { id: 'auroraB', angle: -0.13, y: -0.03, size: [0.36, 0.3], home: '#7A5CFF', playing: '#F29A4E' },
  { id: 'auroraC', angle: 0.01, y: 0.04, size: [0.34, 0.22], home: '#3FC6E0', playing: '#E2557A' },
  { id: 'auroraD', angle: 0.15, y: -0.02, size: [0.36, 0.3], home: '#6A7CFF', playing: '#3FA7E0' },
  { id: 'auroraE', angle: 0.28, y: 0.03, size: [0.34, 0.26], home: '#4FC3A8', playing: '#E8B04E' },
] as const;

function glowPart(glow: (typeof GLOWS)[number]): ModelSpecPart {
  const [x, z] = arcPoint(CURVE_R - 0.0042, glow.angle);
  return {
    id: glow.id,
    geometry: { type: 'glow', width: glow.size[0], height: glow.size[1], segments: 48 },
    material: 'accent',
    transform: {
      position: [x, PANEL_Y + glow.y, APEX_Z + z],
      rotation: [0, (-glow.angle * 180) / Math.PI, 0],
    },
    minLod: 1,
  };
}

function glowChannels(glow: (typeof GLOWS)[number]): ModelSpecChannel[] {
  return [
    look(`${glow.id}Home`, [glow.id, 'colour'], ['screenOn', { true: glow.home }]),
    look(`${glow.id}Play`, [glow.id, 'colour'], ['playing', { true: glow.playing }], 1200),
    look(`${glow.id}Show`, [glow.id, 'opacity'], ['screenOn', { true: 0.6, false: 0 }]),
    look(`${glow.id}Lit`, [glow.id, 'emissive'], ['screenOn', { true: 0.8, false: 0 }]),
    look(`${glow.id}Hide`, [glow.id, 'opacity'], ['power', { false: 0 }], 450),
    ...emitterChannels(glow.id),
  ];
}

const GATES: readonly ModelSpecChannel[] = [
  look('screenColour', ['screen', 'colour'], ['screenOn', { true: '#1E2A44' }]),
  look('screenLit', ['screen', 'emissive'], ['screenOn', { true: 0.9, false: 0 }]),
  look('spillOn', ['spill', 'emissive'], ['screenOn', { true: 1, false: 0 }]),
  look('spillPlaying', ['spill', 'colour'], ['playing', { true: '#8EAEFF' }], 1200),
  look('coreShow', ['coreRing', 'opacity'], ['screenOn', { true: 0.9, false: 0 }]),
  look('coreColour', ['coreRing', 'colour'], ['screenOn', { true: '#7A5CFF' }]),
  look('coreLit', ['coreRing', 'emissive'], ['screenOn', { true: 1.1, false: 0 }]),
  look('corePlaying', ['coreRing', 'colour'], ['playing', { true: '#F29A4E' }], 1200),
  look('coreOff', ['coreRing', 'opacity'], ['power', { false: 0 }], 450),
  look('ledShow', ['led', 'opacity'], ['power', { true: 1, false: 0 }]),
  look('ledColour', ['led', 'colour'], ['screenOn', { true: '#FFFFFF', false: '#F2C14E' }]),
  look('ledLit', ['led', 'emissive'], ['power', { true: 1.2, false: 0 }]),
  ...['screen', 'spill', 'coreRing', 'led'].flatMap((id) => emitterChannels(id)),
];

export const SAMSUNG_G9_OLED_49_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.monitor.samsung-g9-oled-49',
  version: '1.0.0',
  title: 'Samsung Odyssey OLED G9 49 inch',
  category: 'media',
  family: 'television',
  footprint: { width: 1.1947, depth: 0.2369, height: 0.5293 },
  framing: {
    tile: { ...FRONT_VIEW, padding: 0.06 },
    card: FRONT_VIEW,
    hero: { ...FRONT_VIEW, padding: 0.1 },
  },
  shots: [
    {
      id: 'watch',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'power', op: 'eq', value: true },
              { signal: 'screenOn', op: 'eq', value: true },
            ],
          },
        ],
      },
      focus: 'screen',
      zoom: 1,
      yaw: 12,
      pitch: -2,
      easeMs: 800,
      loopS: 12,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Samsung Odyssey OLED G9 49 inch',
      synonyms: ['monitor', 'ultra wide', 'curved monitor', 'gaming monitor', 'g95sc'],
    },
    sizeClass: 'large',
    aliases: ['LS49CG954SEXXT'],
  },
  materials: {
    bezel: { finish: 'satin-black', roughness: 0.3, clearcoat: 0.5 },
    shell: { finish: 'brushed-aluminium', roughness: 0.45 },
    screen: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { color: '#1E2A44', roughness: 0.4, opacity: 0 },
  },
  parts: [
    curved('panel', 'bezel', {
      angles: [-OUTER_HALF, OUTER_HALF],
      radii: [CURVE_R + BEVEL, CURVE_R + PANEL_T - BEVEL],
      height: PANEL_H - 2 * BEVEL,
      bevel: BEVEL,
    }),
    curved('screen', 'screen', {
      angles: [-ACTIVE_HALF, ACTIVE_HALF],
      radii: [CURVE_R - 0.0008, CURVE_R + 0.0006],
      height: ACTIVE_H,
    }),
    ...GLOWS.map(glowPart),
    {
      id: 'hub',
      geometry: {
        type: 'roundedBox',
        width: 0.3,
        height: 0.2,
        depth: HUB_FRONT - HUB_BACK,
        radius: 0.02,
        segments: 4,
      },
      material: 'shell',
      transform: { position: [0, PANEL_Y, (HUB_FRONT + HUB_BACK) / 2] },
    },
    {
      id: 'coreRing',
      geometry: { type: 'ring', innerRadius: 0.052, outerRadius: 0.06, segments: 64 },
      material: 'accent',
      transform: { position: [0, PANEL_Y, HUB_BACK - 0.0006], rotation: [0, 180, 0] },
      minLod: 1,
    },
    {
      id: 'led',
      geometry: { type: 'sphere', radius: 0.0014, segments: 12 },
      material: 'accent',
      transform: { position: [0, PANEL_Y - PANEL_H / 2 + 0.004, APEX_Z + 0.0008] },
      minLod: 1,
    },
    {
      id: 'neck',
      geometry: {
        type: 'roundedBox',
        width: 0.07,
        height: 0.328,
        depth: 0.03,
        radius: 0.012,
        segments: 4,
      },
      material: 'shell',
      transform: { position: [0, 0.176, -0.05] },
    },
    {
      id: 'base',
      geometry: {
        type: 'roundedBox',
        width: 0.3,
        height: 0.012,
        depth: 0.215,
        radius: 0.005,
        segments: 4,
      },
      material: 'shell',
      transform: { position: [0, 0.006, -0.011] },
      contact: true,
    },
    {
      id: 'footPad',
      geometry: {
        type: 'roundedBox',
        width: 0.26,
        height: 0.002,
        depth: 0.18,
        radius: 0.0008,
        segments: 3,
      },
      material: 'bezel',
      transform: { position: [0, 0.0006, -0.011] },
      minLod: 2,
    },
    {
      id: 'neckCap',
      geometry: {
        type: 'roundedBox',
        width: 0.1,
        height: 0.02,
        depth: 0.05,
        radius: 0.008,
        segments: 3,
      },
      material: 'shell',
      transform: { position: [0, 0.022, -0.05] },
      minLod: 1,
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'picture',
      position: [0, PANEL_Y, APEX_Z + 0.001],
      width: 1.17,
      height: ACTIVE_H,
    },
    {
      kind: 'emitter',
      id: 'spill',
      position: [0, PANEL_Y, HUB_BACK - 0.05],
      color: '#E6EAF0',
      intensity: 0.5,
      radius: 0.5,
      cone: 160,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, PANEL_Y + PANEL_H / 2 + 0.05, APEX_Z] },
    { kind: 'hit', id: 'body', position: [0, 0.265, 0], size: [1.2, 0.53, 0.24] },
  ],
  channels: [...GATES, ...GLOWS.flatMap(glowChannels)],
  states: {
    off: { power: false, screenOn: false },
    standby: { power: true, screenOn: false },
    on: { power: true, screenOn: true, playing: false },
    playing: { power: true, screenOn: true, playing: true, volume: 0.3 },
    offline: { online: false },
  },
};
