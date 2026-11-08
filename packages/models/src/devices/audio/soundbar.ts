import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { driverChannels, ledChannels, PLAY_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 24, pitch: 12, fov: 28, padding: 0.1, focus: 'bar' } as const;
const WIDTH = 0.9;
const HEIGHT = 0.065;
const DEPTH = 0.095;
const FOOT_H = 0.006;
const BAR_Y = FOOT_H + HEIGHT / 2;
const FRONT = DEPTH / 2;

function driver(id: string, x: number, radius: number): ModelSpecPart {
  return {
    id,
    parent: 'bar',
    geometry: {
      type: 'cylinder',
      height: 0.006,
      topRadius: radius,
      bottomRadius: radius * 1.06,
      bevel: 0.002,
      segments: 40,
    },
    material: 'trim',
    transform: { position: [x, 0, FRONT - 0.001], rotation: [90, 0, 0] },
    minLod: 1,
  };
}

function cap(id: string, x: number, radius: number): ModelSpecPart {
  return {
    id,
    parent: 'bar',
    geometry: { type: 'sphere', radius, thetaLength: 70, segments: 24 },
    material: 'body',
    transform: { position: [x, 0, FRONT + 0.0015], rotation: [90, 0, 0], scale: [1, 0.35, 1] },
    minLod: 2,
  };
}

export const SOUNDBAR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.speaker.soundbar',
  version: '1.0.0',
  title: 'Soundbar',
  category: 'audio',
  family: 'speaker',
  footprint: { width: WIDTH, depth: DEPTH, height: BAR_Y + HEIGHT / 2 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'play',
      when: PLAY_SHOT_WHEN,
      focus: 'driverLeft',
      zoom: 1.5,
      yaw: 18,
      pitch: 10,
      easeMs: 700,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Soundbar',
      synonyms: ['sound bar', 'tv speaker', 'home theatre speaker', 'speaker bar'],
    },
    sizeClass: 'medium',
    variants: ['black', 'white'],
  },
  materials: {
    body: { finish: 'graphite' },
    grille: { finish: 'satin-black', pattern: 'perforated' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    black: {},
    white: {
      body: { finish: 'matte-white' },
      grille: { finish: 'warm-white', pattern: 'perforated' },
    },
  },
  defaultFinish: 'black',
  parts: [
    {
      id: 'bar',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEIGHT,
        depth: DEPTH,
        radius: 0.016,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, BAR_Y, 0] },
      contact: true,
    },
    {
      id: 'grille',
      parent: 'bar',
      geometry: {
        type: 'roundedBox',
        width: WIDTH - 0.03,
        height: HEIGHT - 0.012,
        depth: 0.004,
        radius: 0.01,
        segments: 4,
      },
      material: 'grille',
      transform: { position: [0, 0, FRONT - 0.001] },
    },
    driver('driverLeft', -0.3, 0.024),
    driver('driverRight', 0.3, 0.024),
    driver('driverCentre', 0, 0.016),
    cap('capLeft', -0.3, 0.012),
    cap('capRight', 0.3, 0.012),
    {
      id: 'footLeft',
      geometry: {
        type: 'roundedBox',
        width: 0.05,
        height: FOOT_H,
        depth: 0.05,
        radius: 0.0025,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [-0.36, FOOT_H / 2, 0] },
      contact: true,
      minLod: 1,
    },
    {
      id: 'footRight',
      geometry: {
        type: 'roundedBox',
        width: 0.05,
        height: FOOT_H,
        depth: 0.05,
        radius: 0.0025,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0.36, FOOT_H / 2, 0] },
      contact: true,
      minLod: 1,
    },
    {
      id: 'topPad',
      parent: 'bar',
      geometry: {
        type: 'roundedBox',
        width: 0.14,
        height: 0.0012,
        depth: 0.05,
        radius: 0.0006,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0.28, HEIGHT / 2, -0.01] },
      minLod: 2,
    },
    {
      id: 'led',
      parent: 'bar',
      geometry: {
        type: 'roundedBox',
        width: 0.09,
        height: 0.0065,
        depth: 0.002,
        radius: 0.0012,
        segments: 3,
      },
      material: 'accent',
      transform: { position: [0, -HEIGHT / 2 + 0.0115, FRONT + 0.0016] },
    },
  ],
  anchors: [
    { kind: 'mount', id: 'shelf', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, BAR_Y + HEIGHT / 2 + 0.03, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, BAR_Y, 0], size: [WIDTH, HEIGHT + FOOT_H, DEPTH] },
  ],
  channels: [
    ...ledChannels('led'),
    ...driverChannels('driverLeft', 0.18),
    ...driverChannels('driverRight', 0.18),
    ...driverChannels('driverCentre', 0.14),
  ],
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true, playing: false },
    playing: { power: true, online: true, playing: true, volume: 0.5 },
    muted: { power: true, online: true, playing: true, volume: 0 },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
