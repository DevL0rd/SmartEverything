import type { ModelSpec } from '@smarteverything/domain';
import { statusLedChannels } from '@smarteverything/domain';
import { ALARM_SHOT_WHEN, alarmRing } from './channels';

const HOUSE = { yaw: 28, pitch: -24, fov: 28, padding: 0.12, focus: 'ring' } as const;
const R = 0.058;
const BASE_H = 0.008;
const COVER_H = 0.032;
const HEIGHT = BASE_H + COVER_H;

export const SMOKE_DETECTOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.smoke',
  version: '1.0.0',
  title: 'Smoke detector',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: 2 * R, depth: 2 * R, height: HEIGHT },
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
      yaw: 28,
      pitch: -30,
      easeMs: 500,
      loopS: 0.8,
      symmetry: 360,
      stillAt: 0.4,
    },
  ],
  meta: {
    names: {
      display: 'Smoke detector',
      synonyms: ['smoke alarm', 'smoke sensor', 'fire alarm', 'fire detector'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    vent: { finish: 'matte-white', pattern: 'perforated' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black' },
      vent: { finish: 'satin-black', pattern: 'perforated' },
    },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'base',
      geometry: {
        type: 'cylinder',
        height: BASE_H,
        topRadius: R * 0.98,
        bottomRadius: R,
        bevel: 0.0025,
        segments: 72,
      },
      material: 'trim',
      transform: { position: [0, HEIGHT - BASE_H / 2, 0] },
    },
    {
      id: 'cover',
      geometry: {
        type: 'cylinder',
        height: COVER_H,
        topRadius: R * 0.86,
        bottomRadius: R * 0.97,
        bevel: 0.012,
        segments: 72,
      },
      material: 'body',
      transform: { position: [0, COVER_H / 2, 0] },
    },
    {
      id: 'vent',
      parent: 'cover',
      geometry: {
        type: 'cylinder',
        height: 0.004,
        topRadius: R * 0.62,
        bottomRadius: R * 0.64,
        bevel: 0.0015,
        segments: 64,
      },
      material: 'vent',
      transform: { position: [0, -COVER_H / 2 + 0.0008, 0] },
      minLod: 1,
    },
    {
      id: 'ring',
      parent: 'cover',
      geometry: { type: 'torus', radius: R * 0.52, tube: 0.0026, segments: 64 },
      material: 'accent',
      transform: { position: [0, -COVER_H / 2 - 0.0008, 0], rotation: [90, 0, 0] },
    },
    {
      id: 'button',
      parent: 'cover',
      geometry: {
        type: 'cylinder',
        height: 0.003,
        topRadius: 0.0075,
        bottomRadius: 0.0085,
        bevel: 0.001,
        segments: 32,
      },
      material: 'trim',
      transform: { position: [0, -COVER_H / 2 - 0.0014, 0] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'cover',
      geometry: { type: 'sphere', radius: 0.0026, segments: 12 },
      material: 'accent',
      transform: { position: [R * 0.4, -COVER_H / 2 - 0.0012, R * 0.4] },
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'airIn',
      parent: 'cover',
      position: [0, -COVER_H / 2, 0],
      effect: 'airflow',
      size: 0.1,
    },
    { kind: 'mount', id: 'ceiling', position: [0, HEIGHT, 0], mount: 'ceiling' },
    { kind: 'label', id: 'pin', position: [0, -0.03, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [2 * R, HEIGHT, 2 * R] },
  ],
  channels: [...statusLedChannels('led'), ...alarmRing('ring')],
  states: {
    ok: { power: true, online: true, alarm: false },
    lowBattery: { power: true, online: true, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    offline: { online: false },
  },
};
