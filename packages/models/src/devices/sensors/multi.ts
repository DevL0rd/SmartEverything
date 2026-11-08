import type { ModelSpec } from '@smarteverything/domain';
import { ledChannels, lensChannels, SENSE_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.12, focus: 'dome' } as const;
const FOOT_H = 0.004;
const BODY_H = 0.04;
const BODY_Y = FOOT_H + BODY_H / 2;
const DOME_R = 0.0215;
const DOME_Y = BODY_H / 2 - 0.002;
const TOP = BODY_Y + DOME_Y + DOME_R;
const FRONT = 0.0272;

export const MULTI_SENSOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.multi',
  version: '1.0.0',
  title: 'Multi sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: 0.06, depth: 0.06, height: TOP },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'sense',
      when: SENSE_SHOT_WHEN,
      focus: 'dome',
      zoom: 1.2,
      yaw: 30,
      pitch: 18,
      easeMs: 600,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.7,
    },
  ],
  meta: {
    names: {
      display: 'Multi sensor',
      synonyms: ['multisensor', 'motion temperature light sensor', 'environment sensor', 'sensor'],
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
      id: 'foot',
      geometry: {
        type: 'cylinder',
        height: FOOT_H,
        topRadius: 0.029,
        bottomRadius: 0.03,
        bevel: 0.0016,
        segments: 64,
      },
      material: 'trim',
      transform: { position: [0, FOOT_H / 2, 0] },
      contact: true,
    },
    {
      id: 'body',
      geometry: {
        type: 'cylinder',
        height: BODY_H,
        topRadius: 0.0262,
        bottomRadius: 0.0272,
        bevel: 0.0075,
        segments: 64,
      },
      material: 'body',
      transform: { position: [0, BODY_Y, 0] },
    },
    {
      id: 'band',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: 0.004,
        topRadius: 0.0276,
        bottomRadius: 0.0276,
        bevel: 0.0012,
        segments: 64,
      },
      material: 'trim',
      transform: { position: [0, -0.012, 0] },
      minLod: 1,
    },
    {
      id: 'dome',
      parent: 'body',
      geometry: { type: 'sphere', radius: DOME_R, thetaLength: 90, segments: 48 },
      material: 'lens',
      transform: { position: [0, DOME_Y, 0] },
    },
    {
      id: 'window',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.009,
        height: 0.007,
        depth: 0.0014,
        radius: 0.0005,
        segments: 3,
      },
      material: 'lens',
      transform: { position: [0, 0.005, FRONT - 0.0004] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0013, segments: 12 },
      material: 'accent',
      transform: { position: [0.011, 0.005, FRONT - 0.0003] },
      minLod: 1,
    },
    {
      id: 'vents',
      parent: 'body',
      geometry: {
        type: 'grille',
        width: 0.018,
        height: 0.008,
        rows: 2,
        columns: 6,
        holeRadius: 0.0011,
      },
      material: 'trim',
      transform: { position: [0, -0.008, FRONT + 0.0008] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'scanField',
      parent: 'dome',
      position: [0, DOME_R, 0],
      effect: 'scan',
      size: 0.14,
    },
    { kind: 'mount', id: 'shelf', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, TOP + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, TOP / 2, 0], size: [0.06, TOP, 0.06] },
  ],
  channels: [...ledChannels('led'), ...lensChannels('dome')],
  states: {
    clear: { power: true, online: true, presence: false, motion: false },
    present: { power: true, online: true, presence: true, motion: false },
    motion: { power: true, online: true, presence: true, motion: true },
    lowBattery: { power: true, online: true, presence: false, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    offline: { online: false },
  },
};
