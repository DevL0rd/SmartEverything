import type { ModelSpec } from '@smarteverything/domain';
import { enumChannel, statusLedChannels } from '@smarteverything/domain';

const HOUSE = { yaw: 26, pitch: 10, fov: 28, padding: 0.12, focus: 'screen' } as const;
const SIDE = 0.052;
const DEPTH = 0.016;
const FOOT_H = 0.003;
const HEIGHT = SIDE + FOOT_H;
const BODY_Y = FOOT_H + SIDE / 2;
const FRONT = DEPTH / 2;

export const TEMP_HUMIDITY_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.temp-humidity',
  version: '1.0.0',
  title: 'Temperature and humidity sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: SIDE, depth: DEPTH + 0.004, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16 },
  },
  meta: {
    names: {
      display: 'Temperature and humidity sensor',
      synonyms: [
        'thermometer',
        'hygrometer',
        'climate sensor',
        'temperature sensor',
        'humidity sensor',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    screen: { color: '#C9D3CF', roughness: 0.35, metalness: 0, clearcoat: 0.4 },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: { body: { finish: 'satin-black' }, screen: { color: '#98A3A0' } },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: SIDE,
        height: SIDE,
        depth: DEPTH,
        radius: 0.0095,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, BODY_Y, 0] },
      contact: true,
    },
    {
      id: 'foot',
      geometry: {
        type: 'roundedBox',
        width: 0.03,
        height: FOOT_H + 0.002,
        depth: 0.012,
        radius: 0.0012,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, (FOOT_H + 0.002) / 2, 0.002] },
      contact: true,
      minLod: 1,
    },
    {
      id: 'bezel',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.042,
        height: 0.036,
        depth: 0.0016,
        radius: 0.0045,
        segments: 4,
      },
      material: 'trim',
      transform: { position: [0, 0.002, FRONT - 0.0004] },
      minLod: 1,
    },
    {
      id: 'screen',
      parent: 'body',
      geometry: { type: 'roundedPlane', width: 0.037, height: 0.031, radius: 0.0035, segments: 6 },
      material: 'screen',
      transform: { position: [0, 0.002, FRONT + 0.0006] },
    },
    {
      id: 'led',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0011, segments: 12 },
      material: 'accent',
      transform: { position: [0, -SIDE / 2 + 0.0055, FRONT - 0.0002] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'screen', id: 'readout', parent: 'screen', width: 0.037, height: 0.031 },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [SIDE, HEIGHT, DEPTH] },
  ],
  channels: [
    ...statusLedChannels('led'),
    enumChannel('screenOn', ['screen', 'emissive'], ['online', { true: 0.18, false: 0 }]),
  ],
  states: {
    ok: { power: true, online: true },
    lowBattery: { power: true, online: true, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    offline: { online: false },
  },
};
