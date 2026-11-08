import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { statusLedChannels } from '@smarteverything/domain';
import { ALARM_SHOT_WHEN, alarmRing } from './channels';

const HOUSE = { yaw: 30, pitch: 30, fov: 28, padding: 0.12, focus: 'ring' } as const;
const R = 0.03;
const H = 0.018;
const PROBE_LEN = 0.018;
const DEPTH = 2 * R;

export const LEAK_SENSOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.leak',
  version: '1.0.0',
  title: 'Water leak sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: DEPTH, depth: DEPTH + PROBE_LEN, height: H + 0.004 },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16 },
  },
  shots: [
    {
      id: 'alert',
      when: ALARM_SHOT_WHEN,
      focus: 'ring',
      zoom: 1.25,
      yaw: 30,
      pitch: 38,
      easeMs: 500,
      loopS: 0.8,
      symmetry: 360,
      stillAt: 0.4,
    },
  ],
  meta: {
    names: {
      display: 'Water leak sensor',
      synonyms: ['leak sensor', 'flood sensor', 'water sensor', 'moisture sensor'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    probe: { finish: 'chrome' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: { body: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'base',
      geometry: {
        type: 'cylinder',
        height: 0.004,
        topRadius: R * 0.94,
        bottomRadius: R * 0.96,
        bevel: 0.0015,
        segments: 64,
      },
      material: 'trim',
      transform: { position: [0, 0.002, 0] },
      contact: true,
    },
    {
      id: 'body',
      geometry: {
        type: 'cylinder',
        height: H,
        topRadius: R * 0.9,
        bottomRadius: R,
        bevel: 0.0065,
        segments: 64,
      },
      material: 'body',
      transform: { position: [0, 0.004 + H / 2, 0] },
    },
    {
      id: 'ring',
      parent: 'body',
      geometry: { type: 'torus', radius: R * 0.62, tube: 0.0014, segments: 64 },
      material: 'accent',
      transform: { position: [0, H / 2 - 0.0004, 0], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'dimple',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.008, thetaLength: 70, segments: 32 },
      material: 'trim',
      transform: { position: [0, H / 2 - 0.0008, 0], scale: [1, 0.18, 1] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0013, segments: 12 },
      material: 'accent',
      transform: { position: [0, H / 2 - 0.0004, -R * 0.72] },
      minLod: 1,
    },
    ...[-1, 1].map((side): ModelSpecPart => ({
      id: `probe${side < 0 ? 'Left' : 'Right'}`,
      parent: 'body',
      geometry: { type: 'capsule', radius: 0.0016, length: PROBE_LEN, segments: 12 },
      material: 'probe',
      transform: {
        position: [side * 0.007, -H / 2 + 0.002, R + PROBE_LEN / 2 - 0.006],
        rotation: [90, 0, 0],
      },
      minLod: 1,
    })),
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'drip',
      parent: 'body',
      position: [0, 0, R + PROBE_LEN],
      effect: 'ripple',
      size: 0.08,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, H + 0.03, 0] },
    {
      kind: 'hit',
      id: 'bodyHit',
      position: [0, (H + 0.004) / 2, 0],
      size: [DEPTH, H + 0.004, DEPTH + PROBE_LEN],
    },
  ],
  channels: [...statusLedChannels('led'), ...alarmRing('ring')],
  states: {
    dry: { power: true, online: true, alarm: false },
    lowBattery: { power: true, online: true, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    offline: { online: false },
  },
};
