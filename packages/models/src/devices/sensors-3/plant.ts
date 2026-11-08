import type { ModelSpec } from '@smarteverything/domain';
import { enumChannel, statusLedChannels } from '@smarteverything/domain';

const HOUSE = { yaw: 26, pitch: 8, fov: 28, padding: 0.1, focus: 'head' } as const;
const WIDTH = 0.032;
const DEPTH = 0.011;
const STAKE_L = 0.09;
const HEAD_H = 0.058;
const HEIGHT = STAKE_L + HEAD_H;
const HEAD_Y = STAKE_L + HEAD_H / 2;

export const PLANT_SENSOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.plant',
  version: '1.0.0',
  title: 'Plant sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  meta: {
    names: {
      display: 'Plant sensor',
      synonyms: ['soil sensor', 'soil moisture sensor', 'flower sensor', 'garden sensor'],
    },
    sizeClass: 'small',
    variants: ['white', 'green'],
  },
  materials: {
    body: { finish: 'matte-white' },
    probe: { finish: 'graphite' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3A0', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    green: { body: { color: '#CFE3D2', roughness: 0.6 } },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'stake',
      geometry: {
        type: 'extrude',
        path: [
          { op: 'move', x: -0.0105, y: 0 },
          { op: 'line', x: -0.0105, y: STAKE_L - 0.008 },
          { op: 'quadratic', cx: -0.0105, cy: STAKE_L, x: -0.007, y: STAKE_L },
          { op: 'line', x: 0.007, y: STAKE_L },
          { op: 'quadratic', cx: 0.0105, cy: STAKE_L, x: 0.0105, y: STAKE_L - 0.008 },
          { op: 'line', x: 0.0105, y: 0.018 },
          { op: 'line', x: 0, y: 0 },
          { op: 'line', x: -0.0105, y: 0.018 },
          { op: 'line', x: -0.0105, y: STAKE_L - 0.008 },
        ],
        depth: 0.0032,
        bevel: 0.0009,
      },
      material: 'probe',
      transform: { position: [0, 0, -0.0016] },
      contact: true,
    },
    {
      id: 'head',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEAD_H,
        depth: DEPTH,
        radius: 0.0052,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, HEAD_Y, 0] },
    },
    {
      id: 'cell',
      parent: 'head',
      geometry: {
        type: 'roundedBox',
        width: 0.014,
        height: 0.006,
        depth: 0.0012,
        radius: 0.0025,
        segments: 4,
      },
      material: 'accent',
      transform: { position: [0, HEAD_H / 2 - 0.016, DEPTH / 2 - 0.0002] },
      minLod: 1,
    },
    {
      id: 'moisture',
      parent: 'head',
      geometry: {
        type: 'roundedBox',
        width: 0.004,
        height: 0.02,
        depth: 0.0012,
        radius: 0.0018,
        segments: 3,
      },
      material: 'accent',
      transform: { position: [0, -0.004, DEPTH / 2 - 0.0002] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'head',
      geometry: { type: 'sphere', radius: 0.0011, segments: 12 },
      material: 'accent',
      transform: { position: [0, -HEAD_H / 2 + 0.0065, DEPTH / 2 - 0.0002] },
      minLod: 1,
    },
    {
      id: 'collar',
      parent: 'head',
      geometry: {
        type: 'roundedBox',
        width: WIDTH * 0.8,
        height: 0.0035,
        depth: DEPTH * 0.82,
        radius: 0.0012,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, -HEAD_H / 2 - 0.0008, 0] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'effect', id: 'soil', position: [0, 0.01, 0], effect: 'water', size: 0.06 },
    { kind: 'mount', id: 'soilMount', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [
    ...statusLedChannels('led'),
    enumChannel('cellShow', ['cell', 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel('moistureShow', ['moisture', 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel(
      'moistureDry',
      ['moisture', 'colour'],
      ['waterLow', { true: '#F2B45E', false: '#5ED3CF' }],
    ),
    {
      id: 'moistureLevel',
      target: 'moisture',
      property: 'emissive',
      source: 'waterLevel',
      map: { type: 'linear', in: [0, 1], out: [0.2, 1.6], clamp: true },
      motion: { type: 'pose', easeMs: 400 },
      reduced: 'hold',
    },
    {
      id: 'moistureFill',
      target: 'moisture',
      property: 'scale',
      axis: 'y',
      source: 'waterLevel',
      map: { type: 'linear', in: [0, 1], out: [0.2, 1], clamp: true },
      motion: { type: 'pose', easeMs: 400 },
      reduced: 'hold',
    },
  ],
  states: {
    moist: { power: true, online: true, waterLevel: 0.7, waterLow: false },
    dry: { power: true, online: true, waterLevel: 0.12, waterLow: true },
    lowBattery: { power: true, online: true, waterLevel: 0.6, batteryLow: true },
    offline: { online: false },
  },
};
