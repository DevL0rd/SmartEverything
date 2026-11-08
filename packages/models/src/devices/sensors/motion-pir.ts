import type { ModelSpec } from '@smarteverything/domain';
import { ledChannels, lensChannels, SENSE_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 32, pitch: 14, fov: 28, padding: 0.12, focus: 'lens' } as const;
const WIDTH = 0.058;
const HEIGHT = 0.088;
const BODY_D = 0.034;
const PLATE_D = 0.007;
const BALL_R = 0.011;
const BODY_Z = PLATE_D + BALL_R * 1.1 + BODY_D / 2 - 0.006;
const FRONT_Z = BODY_Z + BODY_D / 2;
const LENS_BULGE = 0.0085;
const LENS_R = 0.022;
const LENS_SCALE_Z = (LENS_BULGE + 0.002) / LENS_R;
const DEPTH = FRONT_Z + LENS_BULGE;
const CENTRE_Z = DEPTH / 2;
const CENTRE_Y = HEIGHT / 2;

function z(value: number): number {
  return value - CENTRE_Z;
}

export const MOTION_PIR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.motion-pir',
  version: '1.0.0',
  title: 'Motion sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'sense',
      when: SENSE_SHOT_WHEN,
      focus: 'lens',
      zoom: 1.2,
      yaw: 24,
      pitch: 12,
      easeMs: 600,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.7,
    },
  ],
  meta: {
    names: {
      display: 'Motion sensor',
      synonyms: ['pir sensor', 'motion detector', 'infrared motion sensor', 'occupancy sensor'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    lens: { finish: 'frosted-glass', pattern: 'ribbed' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: { body: { finish: 'satin-black' }, lens: { finish: 'smoked-acrylic' } },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'plate',
      geometry: {
        type: 'roundedBox',
        width: 0.046,
        height: 0.066,
        depth: PLATE_D,
        radius: 0.0028,
        segments: 4,
      },
      material: 'trim',
      transform: { position: [0, CENTRE_Y, z(PLATE_D / 2)] },
      contact: true,
    },
    {
      id: 'ball',
      geometry: { type: 'sphere', radius: BALL_R, segments: 32 },
      material: 'body',
      transform: { position: [0, CENTRE_Y, z(PLATE_D + BALL_R * 0.55)] },
      minLod: 1,
    },
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEIGHT,
        depth: BODY_D,
        radius: 0.012,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, CENTRE_Y, z(BODY_Z)] },
    },
    {
      id: 'lens',
      parent: 'body',
      geometry: { type: 'sphere', radius: LENS_R, segments: 48 },
      material: 'lens',
      transform: {
        position: [0, -0.006, BODY_D / 2 - 0.002],
        scale: [1, 1.15, LENS_SCALE_Z],
      },
    },
    {
      id: 'led',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0013, segments: 12 },
      material: 'accent',
      transform: { position: [0, HEIGHT / 2 - 0.009, BODY_D / 2 - 0.0002] },
      minLod: 1,
    },
    {
      id: 'seam',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: WIDTH + 0.0006,
        height: 0.0012,
        depth: BODY_D * 0.7,
        radius: 0.0004,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, HEIGHT / 2 - 0.016, -0.004] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'scanField',
      parent: 'lens',
      position: [0, 0, 0.022],
      effect: 'scan',
      size: 0.16,
    },
    { kind: 'mount', id: 'wall', position: [0, CENTRE_Y, z(0)], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, CENTRE_Y, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [...ledChannels('led'), ...lensChannels('lens')],
  states: {
    clear: { power: true, online: true, presence: false, motion: false },
    present: { power: true, online: true, presence: true, motion: false },
    motion: { power: true, online: true, presence: true, motion: true },
    lowBattery: { power: true, online: true, presence: false, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    offline: { online: false },
  },
};
