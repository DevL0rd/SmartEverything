import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import type { BakeLayer, ClipResult, LayersResult } from '../bake/bake-protocol';

const FRONT = { yaw: 0, pitch: 0, fov: 30, padding: 0.1 } as const;

const BOX = { type: 'roundedBox', width: 0.3, height: 0.05, depth: 0.2, radius: 0.01, segments: 4 };

const DISC = { type: 'cylinder', height: 0.01, topRadius: 0.1, bottomRadius: 0.1, segments: 24 };

const PARTS = [
  { id: 'base', geometry: BOX, material: 'body', contact: true },
  { id: 'blades', parent: 'base', geometry: DISC, material: 'body' },
  {
    id: 'led',
    parent: 'base',
    geometry: { type: 'sphere', radius: 0.01, segments: 12 },
    material: 'glow',
  },
];

const ANCHORS = [
  {
    kind: 'screen',
    id: 'display',
    parent: 'base',
    position: [0, 0.03, 0.101],
    width: 0.08,
    height: 0.02,
  },
  { kind: 'effect', id: 'mist', parent: 'base', position: [0, 0.3, 0], effect: 'mist', size: 0.05 },
];

const CHANNELS = [
  {
    id: 'spin',
    target: 'blades',
    property: 'rotate',
    axis: 'z',
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0, 4] },
    motion: { type: 'spin' },
    reduced: 'hold',
  },
  {
    id: 'ledGlow',
    target: 'led',
    property: 'emissive',
    source: 'brightness',
    map: { type: 'linear', in: [0, 100], out: [0, 1], clamp: true },
    motion: { type: 'pose' },
    reduced: 'hold',
  },
  {
    id: 'ledColour',
    target: 'led',
    property: 'colour',
    source: 'colour',
    map: { type: 'colour', from: 'signal' },
    motion: { type: 'pose' },
    reduced: 'hold',
  },
];

const SHOTS = [
  {
    id: 'blades',
    when: { anyOf: [{ allOf: [{ signal: 'speed', op: 'gt', value: 0 }] }] },
    focus: 'blades',
    zoom: 1.5,
    yaw: 0,
    pitch: 0,
    easeMs: 400,
    loopS: 1,
    symmetry: 72,
    stillAt: 0.2,
  },
];

export function fanSpec(): ModelSpec {
  return MODEL_SPEC.parse({
    schema: 1,
    id: 'dev.test.fan',
    version: '1.0.0',
    title: 'Fan',
    category: 'climate',
    footprint: { width: 0.3, depth: 0.2, height: 0.4 },
    framing: { tile: FRONT, card: FRONT, hero: FRONT },
    materials: { body: { finish: 'matte-white' }, glow: { color: '#ffffff' } },
    parts: PARTS,
    anchors: ANCHORS,
    channels: CHANNELS,
    shots: SHOTS,
    states: { off: { power: false, speed: 0 }, on: { power: true, speed: 0.5 } },
  });
}

const RECT = { x: 10, y: 20, width: 30, height: 40 };

export function bakeLayer(overrides: Partial<BakeLayer>): BakeLayer {
  return {
    id: 'body',
    role: 'body',
    uri: 'file:///b.png',
    rect: RECT,
    pivot: null,
    channels: [],
    ...overrides,
  };
}

export function layersImage(layers: readonly BakeLayer[]): LayersResult {
  return {
    kind: 'layers',
    id: 'x',
    width: 96,
    height: 96,
    dpr: 2,
    ms: 1,
    layers: [...layers],
    anchors: [],
  };
}

export function clipImage(overrides: Partial<ClipResult>): ClipResult {
  return {
    kind: 'clip',
    id: 'x',
    width: 96,
    height: 96,
    dpr: 2,
    ms: 1,
    shotId: 'blades',
    uri: 'file:///c.png',
    rect: RECT,
    columns: 4,
    rows: 3,
    introFrames: 2,
    loopFrames: 10,
    stillFrame: 3,
    frameS: 0.1,
    periodS: 1,
    ...overrides,
  };
}
