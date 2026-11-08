import { emitterChannels, type ModelSpec, type ModelSpecTransform } from '@smarteverything/domain';
import {
  DEPTH,
  FACE,
  HALF_H,
  HEIGHT,
  look,
  PICTURE_CHANNELS,
  PICTURE_PARTS,
  SCREEN_H,
  SCREEN_W,
  WIDTH,
} from './screen-picture';

const FRONT_FACING = { yaw: 20, pitch: 12, fov: 28, padding: 0.08, focus: 'bezel' } as const;

const LIFT = 0.067;
const STAND_ONLY = { param: 'mount', scale: -1, offset: 1 };
const STAND_SCALE: ModelSpecTransform['scale'] = [STAND_ONLY, STAND_ONLY, STAND_ONLY];

function band(id: string, x: number, width: number, z: number): ModelSpec['parts'][number] {
  const lean = 0.34;
  return {
    id,
    parent: 'bezel',
    geometry: {
      type: 'extrude',
      path: [
        { op: 'move', x: x - lean, y: -HALF_H },
        { op: 'line', x: x - lean + width, y: -HALF_H },
        { op: 'line', x: x + lean + width, y: HALF_H },
        { op: 'line', x: x + lean, y: HALF_H },
        { op: 'line', x: x - lean, y: -HALF_H },
      ],
      depth: 0.0004,
    },
    material: 'sheen',
    transform: { position: [0, 0, z] },
  };
}

const PORTS = [-0.06, -0.02, 0.02].map((x, index): ModelSpec['parts'][number] => ({
  id: `port${String(index + 1)}`,
  parent: 'rearBox',
  geometry: {
    type: 'roundedBox',
    width: 0.014,
    height: 0.006,
    depth: 0.002,
    radius: 0.001,
    segments: 3,
  },
  material: 'panel',
  transform: { position: [0.36 + x, -0.1, -0.0176] },
  minLod: 2,
}));

const STAND: ModelSpec['parts'] = [
  {
    id: 'standBase',
    geometry: {
      type: 'roundedBox',
      width: 0.363,
      height: 0.008,
      depth: 0.287,
      radius: 0.004,
      segments: 4,
    },
    material: 'metal',
    transform: { position: [0, 0.004, -0.04], scale: STAND_SCALE },
    contact: true,
  },
  {
    id: 'standNeck',
    geometry: {
      type: 'roundedBox',
      width: 0.2,
      height: 0.13,
      depth: 0.03,
      radius: 0.006,
      segments: 4,
    },
    material: 'metal',
    transform: { position: [0, 0.073, -0.03], scale: STAND_SCALE },
  },
];

export const SAMSUNG_S95B_65_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.television.samsung-s95b-65',
  version: '1.0.0',
  title: 'Samsung S95B 65 inch',
  category: 'media',
  family: 'television',
  footprint: { width: WIDTH, depth: 0.287, height: 0.892 },
  framing: {
    tile: FRONT_FACING,
    card: FRONT_FACING,
    hero: { ...FRONT_FACING, padding: 0.1 },
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
      focus: 'screenGlow',
      zoom: 0.92,
      yaw: 14,
      pitch: 10,
      easeMs: 800,
      loopS: 12,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Samsung S95B 65 inch',
      synonyms: ['television', 'tv', 'oled tv', 'qd-oled'],
    },
    sizeClass: 'large',
    aliases: ['QA65S95BAKXXT'],
  },
  params: { mount: { min: 0, max: 1, default: 0, unit: 'count' } },
  materials: {
    panel: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    metal: { finish: 'brushed-aluminium', roughness: 0.28 },
    sheen: { color: '#FFFFFF', roughness: 0.05, opacity: 0.07 },
    accent: { color: '#1E2A44', roughness: 0.4, opacity: 0 },
  },
  parts: [
    {
      id: 'bezel',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEIGHT,
        depth: DEPTH,
        radius: 0.004,
        segments: 4,
      },
      material: 'metal',
      transform: { position: [0, { param: 'mount', scale: -LIFT, offset: LIFT + HEIGHT / 2 }, 0] },
    },
    {
      id: 'panel',
      parent: 'bezel',
      geometry: {
        type: 'roundedPlane',
        width: WIDTH - 0.006,
        height: HEIGHT - 0.006,
        radius: 0.003,
        segments: 3,
      },
      material: 'panel',
      transform: { position: [0, 0, FACE + 0.0012] },
    },
    {
      id: 'screenGlow',
      parent: 'bezel',
      geometry: {
        type: 'roundedPlane',
        width: SCREEN_W,
        height: SCREEN_H,
        radius: 0.002,
        segments: 3,
      },
      material: 'panel',
      transform: { position: [0, 0, FACE + 0.0026] },
    },
    ...PICTURE_PARTS,
    band('glare', -0.36, 0.16, FACE + 0.0135),
    band('glareThin', -0.1, 0.035, FACE + 0.0135),
    {
      id: 'rearBox',
      parent: 'bezel',
      geometry: {
        type: 'roundedBox',
        width: 0.9,
        height: 0.42,
        depth: 0.035,
        radius: 0.012,
        segments: 4,
      },
      material: 'metal',
      transform: { position: [0, -0.15, -0.0215] },
      minLod: 1,
    },
    ...PORTS,
    ...STAND,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'picture',
      parent: 'bezel',
      position: [0, 0, FACE + 0.0145],
      width: SCREEN_W,
      height: SCREEN_H,
    },
    {
      kind: 'emitter',
      id: 'spill',
      parent: 'bezel',
      position: [0, 0, -0.06],
      color: '#E6EAF0',
      intensity: 0.5,
      radius: 0.6,
      cone: 160,
    },
    { kind: 'mount', id: 'stand', position: [0, 0, 0], mount: 'desk' },
    { kind: 'mount', id: 'wall', parent: 'bezel', position: [0, 0, -0.04], mount: 'wall' },
    { kind: 'label', id: 'pin', parent: 'bezel', position: [0, HEIGHT / 2 + 0.06, 0] },
  ],
  channels: [
    {
      id: 'glowShow',
      target: 'screenGlow',
      property: 'colour',
      source: 'screenOn',
      map: { type: 'enum', table: { true: '#1E2A44' } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'glowLit',
      target: 'screenGlow',
      property: 'emissive',
      source: 'screenOn',
      map: { type: 'enum', table: { true: 0.9, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'glowPlaying',
      target: 'screenGlow',
      property: 'emissive',
      source: 'playing',
      map: { type: 'enum', table: { true: 0.9 } },
      motion: { type: 'pulse', periodS: 6, amplitude: 0.12 },
      reduced: 'hold',
    },
    ...emitterChannels('screenGlow'),
    {
      id: 'spillOn',
      target: 'spill',
      property: 'emissive',
      source: 'screenOn',
      map: { type: 'enum', table: { true: 1, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    ...emitterChannels('spill'),
    look('spillPlaying', ['spill', 'colour'], ['playing', { true: '#8EAEFF' }], 1200),
    look('glareLit', ['glare', 'opacity'], ['screenOn', { true: 0.025 }]),
    look('glareThinLit', ['glareThin', 'opacity'], ['screenOn', { true: 0.025 }]),
    ...PICTURE_CHANNELS,
  ],
  states: {
    off: { power: false, screenOn: false },
    standby: { power: true, screenOn: false },
    on: { power: true, screenOn: true, playing: false },
    playing: { power: true, screenOn: true, playing: true, volume: 0.3 },
    offline: { online: false },
  },
};
