import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { ledChannels, PLAY_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 28, pitch: 10, fov: 28, padding: 0.1, focus: 'cupRight' } as const;
const SPAN = 0.087;
const ARCH_R = 0.09;
const ARCH_Y = 0.088;
const CUP_R = 0.046;
const CUP_H = 0.03;
const WIDTH = 2 * (SPAN + CUP_H / 2 + 0.006);
const HEIGHT = ARCH_Y + ARCH_R + 0.006;
const DEPTH = 2 * CUP_R * 0.82;

function arch(from: number, to: number, steps: number, radius: number): [number, number, number][] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = ((from + ((to - from) * index) / steps) * Math.PI) / 180;
    return [Math.cos(angle) * radius, ARCH_Y + Math.sin(angle) * radius, 0];
  });
}

function cupFittings(side: number, name: string): ModelSpecPart[] {
  return [
    {
      id: `cap${name}`,
      parent: `cup${name}`,
      geometry: {
        type: 'cylinder',
        height: 0.004,
        topRadius: CUP_R * 0.7,
        bottomRadius: CUP_R * 0.72,
        bevel: 0.0015,
        segments: 48,
      },
      material: 'trim',
      transform: { position: [0, -side * (CUP_H / 2 + 0.001), 0] },
      minLod: 1,
    },
    {
      id: `yoke${name}`,
      geometry: {
        type: 'roundedBox',
        width: 0.006,
        height: 0.05,
        depth: 0.012,
        radius: 0.0028,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [side * (SPAN + CUP_H / 2 + 0.003), ARCH_Y - 0.01, 0] },
      minLod: 1,
    },
  ];
}

const CUPS = [-1, 1].flatMap((side): ModelSpecPart[] => {
  const name = side < 0 ? 'Left' : 'Right';
  return [
    {
      id: `cup${name}`,
      geometry: {
        type: 'cylinder',
        height: CUP_H,
        topRadius: CUP_R * 0.94,
        bottomRadius: CUP_R,
        bevel: 0.009,
        segments: 40,
      },
      material: 'body',
      transform: {
        position: [side * SPAN, CUP_R * 1.05, 0],
        rotation: [0, 0, 90],
        scale: [1, 1, 0.82],
      },
      contact: true,
    },
    {
      id: `cushion${name}`,
      parent: `cup${name}`,
      geometry: { type: 'torus', radius: CUP_R * 0.78, tube: 0.014, segments: 28 },
      material: 'cushion',
      transform: { position: [0, side * (CUP_H / 2 + 0.004), 0], rotation: [90, 0, 0] },
    },
    ...cupFittings(side, name),
  ];
});

export const HEADPHONES_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.headphones',
  version: '1.0.0',
  title: 'Headphones',
  category: 'audio',
  family: 'speaker',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'play',
      when: PLAY_SHOT_WHEN,
      focus: 'cupRight',
      zoom: 1.15,
      yaw: 40,
      pitch: 8,
      easeMs: 700,
      loopS: 2,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Headphones',
      synonyms: ['headset', 'over-ear headphones', 'wireless headphones', 'earphones'],
    },
    sizeClass: 'small',
    variants: ['graphite', 'white'],
  },
  materials: {
    body: { finish: 'graphite' },
    cushion: { finish: 'leather', roughness: 0.7 },
    trim: { finish: 'brushed-aluminium' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    graphite: {},
    white: { body: { finish: 'matte-white' }, cushion: { finish: 'warm-white', roughness: 0.7 } },
  },
  defaultFinish: 'graphite',
  parts: [
    {
      id: 'headband',
      geometry: {
        type: 'tube',
        points: arch(0, 180, 16, ARCH_R + 0.006),
        radius: 0.0068,
        segments: 8,
      },
      material: 'trim',
    },
    {
      id: 'pad',
      geometry: {
        type: 'tube',
        points: arch(60, 120, 6, ARCH_R - 0.002),
        radius: 0.011,
        segments: 8,
      },
      material: 'cushion',
    },
    ...CUPS,
    {
      id: 'led',
      parent: 'cupRight',
      geometry: { type: 'sphere', radius: 0.0046, segments: 16 },
      material: 'accent',
      transform: { position: [0, -(CUP_H / 2 + 0.003), CUP_R * 0.5], scale: [1, 0.45, 1] },
    },
  ],
  anchors: [
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.03, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: ledChannels('led'),
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true, playing: false },
    playing: { power: true, online: true, playing: true, volume: 0.5 },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
