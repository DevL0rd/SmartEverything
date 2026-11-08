import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { look } from './look';

const WIDTH = 1.23;
const HEIGHT = 0.7006;
const DEPTH = 0.032;
const FACE = DEPTH / 2;
const LIFT = 0.06;
const BASE_H = 0.012;
const SCREEN_W = WIDTH - 0.016;
const SCREEN_H = HEIGHT - 0.016;
const ON_STAND = { param: 'mount', scale: -1, offset: 1 } as const;
const SIZE = { param: 'size' } as const;
const FRONT = { yaw: 20, pitch: 12, fov: 28, padding: 0.08, focus: 'bezel' } as const;
const STAND_Y = -(HEIGHT / 2 + LIFT);

const GLOWS = [
  { id: 'auroraLeft', at: [-0.22, 0.04], size: [0.74, 0.58], home: '#4F8BFF', playing: '#2FB5A8' },
  { id: 'auroraRight', at: [0.24, -0.06], size: [0.7, 0.52], home: '#7A5CFF', playing: '#F29A4E' },
] as const;

function glowPart(glow: (typeof GLOWS)[number], index: number): ModelSpecPart {
  return {
    id: glow.id,
    parent: 'bezel',
    geometry: { type: 'glow', width: glow.size[0], height: glow.size[1], segments: 48 },
    material: 'accent',
    transform: { position: [glow.at[0], glow.at[1], FACE + 0.004 + index * 0.0006] },
    minLod: 1,
  };
}

function glowChannels(glow: (typeof GLOWS)[number]): ModelSpecChannel[] {
  return [
    look(`${glow.id}Home`, [glow.id, 'colour'], ['screenOn', { true: glow.home }]),
    look(`${glow.id}Play`, [glow.id, 'colour'], ['playing', { true: glow.playing }], 1200),
    look(`${glow.id}Show`, [glow.id, 'opacity'], ['screenOn', { true: 0.7, false: 0 }]),
    look(`${glow.id}Lit`, [glow.id, 'emissive'], ['screenOn', { true: 0.8, false: 0 }]),
    look(`${glow.id}Off`, [glow.id, 'opacity'], ['power', { false: 0 }], 450),
  ];
}

const STAND: readonly ModelSpecPart[] = [
  {
    id: 'neck',
    parent: 'bezel',
    geometry: {
      type: 'roundedBox',
      width: 0.1,
      height: 0.07,
      depth: 0.03,
      radius: 0.008,
      segments: 3,
    },
    material: 'stand',
    transform: { position: [0, STAND_Y + 0.035 + BASE_H / 2, -0.012] },
    visible: ON_STAND,
  },
  {
    id: 'base',
    parent: 'bezel',
    geometry: {
      type: 'roundedBox',
      width: 0.42,
      height: BASE_H,
      depth: 0.22,
      radius: 0.005,
      segments: 4,
    },
    material: 'stand',
    transform: { position: [0, STAND_Y + BASE_H / 2, 0.01] },
    visible: ON_STAND,
    contact: true,
  },
];

export const GENERIC_TV_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.tv.generic',
  version: '1.0.0',
  title: 'Television',
  category: 'media',
  family: 'television',
  footprint: { width: WIDTH, depth: 0.22, height: HEIGHT + LIFT },
  framing: {
    tile: { ...FRONT, padding: 0.06 },
    card: FRONT,
    hero: { ...FRONT, padding: 0.1 },
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
      zoom: 1,
      yaw: 12,
      pitch: -2,
      easeMs: 800,
      loopS: 6,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Television',
      synonyms: ['tv', 'smart tv', 'led tv', 'flat screen', 'display'],
    },
    sizeClass: 'large',
    variants: ['black', 'silver'],
  },
  params: {
    size: { min: 0.6, max: 1.55, default: 1, unit: 'ratio' },
    mount: { min: 0, max: 1, default: 0, unit: 'count' },
  },
  materials: {
    frame: { finish: 'satin-black', roughness: 0.3, clearcoat: 0.45 },
    stand: { finish: 'graphite' },
    panel: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { color: '#1E2A44', roughness: 0.4, opacity: 0 },
  },
  ...finishSet(
    {
      black: {},
      silver: { frame: { finish: 'graphite' }, stand: { finish: 'brushed-aluminium' } },
    },
    'black',
  ),
  parts: [
    {
      id: 'bezel',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEIGHT,
        depth: DEPTH,
        radius: 0.005,
        segments: 4,
      },
      material: 'frame',
      transform: {
        position: [0, { param: 'size', scale: HEIGHT / 2 + LIFT }, 0],
        scale: [SIZE, SIZE, SIZE],
      },
    },
    {
      id: 'panel',
      parent: 'bezel',
      geometry: {
        type: 'roundedPlane',
        width: WIDTH - 0.008,
        height: HEIGHT - 0.008,
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
    ...GLOWS.map(glowPart),
    {
      id: 'rearBox',
      parent: 'bezel',
      geometry: {
        type: 'roundedBox',
        width: 0.84,
        height: 0.4,
        depth: 0.03,
        radius: 0.012,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, -0.06, -0.023] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'bezel',
      geometry: { type: 'sphere', radius: 0.0016, segments: 12 },
      material: 'accent',
      transform: { position: [0, -HEIGHT / 2 + 0.005, FACE + 0.0004] },
      minLod: 1,
    },
    ...STAND,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'picture',
      parent: 'bezel',
      position: [0, 0, FACE + 0.003],
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
    look('glowShow', ['screenGlow', 'colour'], ['screenOn', { true: '#1E2A44' }]),
    look('glowLit', ['screenGlow', 'emissive'], ['screenOn', { true: 0.9, false: 0 }]),
    look('glowOff', ['screenGlow', 'emissive'], ['power', { false: 0 }], 450),
    look('spillOn', ['spill', 'emissive'], ['screenOn', { true: 1, false: 0 }]),
    look('spillOff', ['spill', 'emissive'], ['power', { false: 0 }], 450),
    look('spillOffline', ['spill', 'emissive'], ['online', { false: 0 }], 450),
    look('spillPlaying', ['spill', 'colour'], ['playing', { true: '#8EAEFF' }], 1200),
    look('ledShow', ['led', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ledColour', ['led', 'colour'], ['screenOn', { true: '#FFFFFF', false: '#F2C14E' }]),
    look('ledLit', ['led', 'emissive'], ['power', { true: 1.2, false: 0 }]),
    ...GLOWS.flatMap(glowChannels),
  ],
  states: {
    off: { power: false, screenOn: false },
    standby: { power: true, screenOn: false },
    on: { power: true, screenOn: true, playing: false },
    playing: { power: true, screenOn: true, playing: true, volume: 0.3 },
    offline: { online: false },
  },
};
