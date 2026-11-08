import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { driverChannels, ledChannels, PLAY_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 32, pitch: 16, fov: 28, padding: 0.1, focus: 'woofer' } as const;
const SIDE = 0.3;
const FOOT_H = 0.012;
const HEIGHT = 0.34;
const BODY_H = HEIGHT - FOOT_H;
const BODY_Y = FOOT_H + BODY_H / 2;
const FRONT = SIDE / 2;

const FEET = [-1, 1].flatMap((x) =>
  [-1, 1].map((z): ModelSpecPart => ({
    id: `foot${x < 0 ? 'Left' : 'Right'}${z < 0 ? 'Back' : 'Front'}`,
    geometry: {
      type: 'cylinder',
      height: FOOT_H,
      topRadius: 0.016,
      bottomRadius: 0.019,
      bevel: 0.004,
      segments: 24,
    },
    material: 'trim',
    transform: { position: [x * 0.11, FOOT_H / 2, z * 0.11] },
    contact: true,
    minLod: 1,
  })),
);

export const SUBWOOFER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.speaker.subwoofer',
  version: '1.0.0',
  title: 'Subwoofer',
  category: 'audio',
  family: 'speaker',
  footprint: { width: SIDE, depth: SIDE, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'play',
      when: PLAY_SHOT_WHEN,
      focus: 'woofer',
      zoom: 1.35,
      yaw: 14,
      pitch: 8,
      easeMs: 700,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Subwoofer',
      synonyms: ['sub', 'bass speaker', 'bass box', 'woofer'],
    },
    sizeClass: 'medium',
    variants: ['black', 'white'],
  },
  materials: {
    body: { finish: 'satin-black' },
    cone: { finish: 'graphite' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    black: {},
    white: { body: { finish: 'matte-white' }, cone: { finish: 'warm-white' } },
  },
  defaultFinish: 'black',
  parts: [
    {
      id: 'cabinet',
      geometry: {
        type: 'roundedBox',
        width: SIDE,
        height: BODY_H,
        depth: SIDE,
        radius: 0.022,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, BODY_Y, 0] },
      contact: true,
    },
    {
      id: 'surround',
      parent: 'cabinet',
      geometry: { type: 'torus', radius: 0.108, tube: 0.008, segments: 64 },
      material: 'trim',
      transform: { position: [0, 0.01, FRONT + 0.0015] },
    },
    {
      id: 'woofer',
      parent: 'cabinet',
      geometry: {
        type: 'cylinder',
        height: 0.016,
        topRadius: 0.1,
        bottomRadius: 0.108,
        bevel: 0.005,
        segments: 72,
      },
      material: 'cone',
      transform: { position: [0, 0.01, FRONT + 0.0015], rotation: [90, 0, 0] },
    },
    {
      id: 'dustCap',
      parent: 'woofer',
      geometry: { type: 'sphere', radius: 0.034, thetaLength: 80, segments: 40 },
      material: 'body',
      transform: { position: [0, 0.008, 0], scale: [1, 0.5, 1] },
      minLod: 1,
    },
    {
      id: 'port',
      parent: 'cabinet',
      geometry: {
        type: 'roundedBox',
        width: 0.17,
        height: 0.02,
        depth: 0.008,
        radius: 0.008,
        segments: 4,
      },
      material: 'trim',
      transform: { position: [0, -BODY_H / 2 + 0.032, FRONT] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'cabinet',
      geometry: { type: 'sphere', radius: 0.0024, segments: 14 },
      material: 'accent',
      transform: { position: [0, BODY_H / 2 - 0.024, FRONT - 0.0003] },
      minLod: 1,
    },
    ...FEET,
  ],
  anchors: [
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.03, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [SIDE, HEIGHT, SIDE] },
  ],
  channels: [...ledChannels('led'), ...driverChannels('woofer', 0.1)],
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true, playing: false },
    playing: { power: true, online: true, playing: true, volume: 0.5 },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
