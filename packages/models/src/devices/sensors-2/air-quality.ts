import type { ModelSpec } from '@smarteverything/domain';
import { enumChannel } from '@smarteverything/domain';

const HOUSE = { yaw: 28, pitch: 14, fov: 28, padding: 0.12, focus: 'window' } as const;
const R = 0.042;
const FOOT_H = 0.004;
const BODY_H = 0.092;
const HEIGHT = FOOT_H + BODY_H;
const BODY_Y = FOOT_H + BODY_H / 2;

const BANDS = {
  good: '#5ED3A0',
  fair: '#B8E06E',
  moderate: '#F2D45E',
  poor: '#F2A05E',
  bad: '#F2564E',
  severe: '#B25EF2',
} as const;

export const AIR_QUALITY_MONITOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.air-quality',
  version: '1.0.0',
  title: 'Air quality monitor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: 2 * R, depth: 2 * R, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16 },
  },
  meta: {
    names: {
      display: 'Air quality monitor',
      synonyms: ['air monitor', 'pm2.5 sensor', 'co2 sensor', 'voc sensor', 'air sensor'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    vent: { finish: 'matte-white', pattern: 'perforated' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3A0', roughness: 0.3, opacity: 0 },
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
      id: 'foot',
      geometry: {
        type: 'cylinder',
        height: FOOT_H,
        topRadius: R * 0.8,
        bottomRadius: R * 0.84,
        bevel: 0.0015,
        segments: 48,
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
        topRadius: R * 0.94,
        bottomRadius: R,
        bevel: 0.012,
        segments: 64,
      },
      material: 'body',
      transform: { position: [0, BODY_Y, 0] },
    },
    {
      id: 'vent',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: 0.003,
        topRadius: R * 0.66,
        bottomRadius: R * 0.68,
        bevel: 0.001,
        segments: 48,
      },
      material: 'vent',
      transform: { position: [0, BODY_H / 2 - 0.0005, 0] },
      minLod: 1,
    },
    {
      id: 'window',
      parent: 'body',
      geometry: { type: 'roundedPlane', width: 0.03, height: 0.022, radius: 0.005, segments: 6 },
      material: 'trim',
      transform: { position: [0, 0.012, R * 0.99] },
    },
    {
      id: 'ring',
      parent: 'body',
      geometry: { type: 'torus', radius: R * 0.985, tube: 0.0017, segments: 64 },
      material: 'accent',
      transform: { position: [0, -0.018, 0], rotation: [90, 0, 0] },
    },
    {
      id: 'led',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0016, segments: 12 },
      material: 'accent',
      transform: { position: [0, 0.032, R * 0.95] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'screen', id: 'readout', parent: 'window', width: 0.03, height: 0.022 },
    {
      kind: 'effect',
      id: 'air',
      parent: 'body',
      position: [0, BODY_H / 2, 0],
      effect: 'airflow',
      size: 0.1,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [2 * R, HEIGHT, 2 * R] },
  ],
  channels: [
    enumChannel('ringBand', ['ring', 'colour'], ['airQuality', BANDS]),
    enumChannel('ringShow', ['ring', 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel('ringLit', ['ring', 'emissive'], ['online', { true: 1, false: 0 }]),
    enumChannel('ledBand', ['led', 'colour'], ['airQuality', BANDS]),
    enumChannel('ledShow', ['led', 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel('ledLit', ['led', 'emissive'], ['online', { true: 1, false: 0 }]),
    enumChannel('ringAlarm', ['ring', 'emissive'], ['alarm', { true: 1.6 }], {
      type: 'pulse',
      periodS: 0.8,
      amplitude: 0.7,
    }),
    enumChannel('windowOn', ['window', 'emissive'], ['online', { true: 0.12, false: 0 }]),
  ],
  states: {
    good: { power: true, online: true, airQuality: 'good' },
    moderate: { power: true, online: true, airQuality: 'moderate' },
    poor: { power: true, online: true, airQuality: 'poor' },
    severe: { power: true, online: true, airQuality: 'severe', alarm: true },
    offline: { online: false },
  },
};
