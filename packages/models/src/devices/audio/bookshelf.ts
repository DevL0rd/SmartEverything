import type { ModelSpec } from '@smarteverything/domain';
import { driverChannels, ledChannels, PLAY_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 30, pitch: 10, fov: 28, padding: 0.1, focus: 'woofer' } as const;
const WIDTH = 0.2;
const HEIGHT = 0.32;
const DEPTH = 0.26;
const FRONT = DEPTH / 2;
const BODY_Y = HEIGHT / 2;

export const BOOKSHELF_SPEAKER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.speaker.bookshelf',
  version: '1.0.0',
  title: 'Bookshelf speaker',
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
      focus: 'woofer',
      zoom: 1.4,
      yaw: 12,
      pitch: 6,
      easeMs: 700,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Bookshelf speaker',
      synonyms: ['speaker', 'hifi speaker', 'stereo speaker', 'monitor speaker', 'smart speaker'],
    },
    sizeClass: 'small',
    variants: ['walnut', 'white', 'black'],
  },
  materials: {
    body: { finish: 'walnut' },
    baffle: { finish: 'satin-black' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    walnut: {},
    white: { body: { finish: 'matte-white' }, baffle: { finish: 'warm-white' } },
    black: { body: { finish: 'satin-black' }, baffle: { finish: 'graphite' } },
  },
  defaultFinish: 'walnut',
  parts: [
    {
      id: 'cabinet',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEIGHT,
        depth: DEPTH,
        radius: 0.014,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, BODY_Y, 0] },
      contact: true,
    },
    {
      id: 'baffle',
      parent: 'cabinet',
      geometry: {
        type: 'roundedBox',
        width: WIDTH - 0.016,
        height: HEIGHT - 0.016,
        depth: 0.008,
        radius: 0.008,
        segments: 4,
      },
      material: 'baffle',
      transform: { position: [0, 0, FRONT - 0.002] },
    },
    {
      id: 'woofer',
      parent: 'cabinet',
      geometry: {
        type: 'cylinder',
        height: 0.014,
        topRadius: 0.056,
        bottomRadius: 0.062,
        bevel: 0.004,
        segments: 64,
      },
      material: 'trim',
      transform: { position: [0, -0.052, FRONT + 0.003], rotation: [90, 0, 0] },
    },
    {
      id: 'wooferCap',
      parent: 'woofer',
      geometry: { type: 'sphere', radius: 0.02, thetaLength: 80, segments: 32 },
      material: 'baffle',
      transform: { position: [0, 0.007, 0], scale: [1, 0.45, 1] },
      minLod: 1,
    },
    {
      id: 'wooferRing',
      parent: 'cabinet',
      geometry: { type: 'torus', radius: 0.064, tube: 0.0035, segments: 48 },
      material: 'body',
      transform: { position: [0, -0.052, FRONT + 0.0035] },
      minLod: 1,
    },
    {
      id: 'tweeter',
      parent: 'cabinet',
      geometry: { type: 'sphere', radius: 0.0175, thetaLength: 90, segments: 32 },
      material: 'trim',
      transform: { position: [0, 0.088, FRONT + 0.0015], rotation: [90, 0, 0], scale: [1, 0.5, 1] },
    },
    {
      id: 'tweeterRing',
      parent: 'cabinet',
      geometry: { type: 'torus', radius: 0.0215, tube: 0.0025, segments: 32 },
      material: 'body',
      transform: { position: [0, 0.088, FRONT + 0.0025] },
      minLod: 1,
    },
    {
      id: 'port',
      parent: 'cabinet',
      geometry: { type: 'torus', radius: 0.014, tube: 0.004, segments: 32 },
      material: 'trim',
      transform: { position: [0, -0.134, FRONT + 0.0012] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'cabinet',
      geometry: { type: 'sphere', radius: 0.0022, segments: 14 },
      material: 'accent',
      transform: { position: [0, 0.133, FRONT + 0.0018] },
      minLod: 1,
    },
    {
      id: 'terminalPlate',
      parent: 'cabinet',
      geometry: {
        type: 'roundedBox',
        width: 0.07,
        height: 0.05,
        depth: 0.003,
        radius: 0.004,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, -0.07, -FRONT] },
      minLod: 2,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'shelf', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.03, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, BODY_Y, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [
    ...ledChannels('led'),
    ...driverChannels('woofer', 0.12),
    ...driverChannels('tweeter', 0.2),
  ],
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true, playing: false },
    playing: { power: true, online: true, playing: true, volume: 0.5 },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
