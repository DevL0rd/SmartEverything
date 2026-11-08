import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels, enumChannel, statusLedChannels } from '@smarteverything/domain';

const HOUSE = { yaw: 28, pitch: 24, fov: 28, padding: 0.12, focus: 'dome' } as const;
const R = 0.022;
const BASE_H = 0.012;
const DOME_R = 0.0165;
const DOME_RISE = 1.12;
const HEIGHT = BASE_H + DOME_R * DOME_RISE;

export const LIGHT_SENSOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.light',
  version: '1.0.0',
  title: 'Light sensor',
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
      display: 'Light sensor',
      synonyms: ['lux sensor', 'illuminance sensor', 'ambient light sensor', 'daylight sensor'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    dome: { finish: 'frosted-glass', opacity: 0.86, roughness: 0.68 },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black' },
      dome: { finish: 'smoked-acrylic', opacity: 0.88, roughness: 0.5 },
    },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'pad',
      geometry: {
        type: 'cylinder',
        height: 0.002,
        topRadius: R * 0.9,
        bottomRadius: R * 0.92,
        bevel: 0.0008,
        segments: 48,
      },
      material: 'trim',
      transform: { position: [0, 0.001, 0] },
      contact: true,
    },
    {
      id: 'base',
      geometry: {
        type: 'cylinder',
        height: BASE_H,
        topRadius: R * 0.94,
        bottomRadius: R,
        bevel: 0.0042,
        segments: 48,
      },
      material: 'body',
      transform: { position: [0, 0.002 + BASE_H / 2, 0] },
    },
    {
      id: 'dome',
      parent: 'base',
      geometry: { type: 'sphere', radius: DOME_R, thetaLength: 90, segments: 48 },
      material: 'dome',
      transform: { position: [0, BASE_H / 2 - 0.001, 0], scale: [1, DOME_RISE, 1] },
    },
    {
      id: 'cell',
      parent: 'base',
      geometry: { type: 'sphere', radius: 0.007, thetaLength: 90, segments: 24 },
      material: 'accent',
      transform: { position: [0, BASE_H / 2 - 0.0008, 0], scale: [1, 0.9, 1] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'base',
      geometry: { type: 'sphere', radius: 0.0011, segments: 12 },
      material: 'accent',
      transform: { position: [0, -0.0005, R * 0.97] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [2 * R, HEIGHT, 2 * R] },
  ],
  channels: [
    ...statusLedChannels('led'),
    enumChannel('cellShow', ['cell', 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel('cellTint', ['cell', 'colour'], ['online', { true: '#F2D45E' }]),
    {
      id: 'cellLevel',
      target: 'cell',
      property: 'emissive',
      source: 'level',
      map: { type: 'linear', in: [0, 1], out: [0.1, 1.8], clamp: true },
      motion: { type: 'pose', easeMs: 400 },
      reduced: 'hold',
    },
    {
      id: 'domeLevel',
      target: 'dome',
      property: 'emissive',
      source: 'level',
      map: { type: 'linear', in: [0, 1], out: [0, 0.5], clamp: true },
      motion: { type: 'pose', easeMs: 400 },
      reduced: 'hold',
    },
    ...emitterChannels('cell'),
    ...emitterChannels('dome'),
  ],
  states: {
    dark: { power: true, online: true, level: 0.05 },
    dim: { power: true, online: true, level: 0.35 },
    bright: { power: true, online: true, level: 0.9 },
    lowBattery: { power: true, online: true, level: 0.5, batteryLow: true },
    offline: { online: false },
  },
};
