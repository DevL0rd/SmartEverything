import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { blob, by, catalogueModel, glowChannel, rod, turned, whileOn, block } from './kit';

const TOP = 'height';

function base(): ModelSpecPart[] {
  return [
    rod(
      'plinth',
      'post',
      { height: 0.12, top: 0.17, bottom: 0.2, bevel: 0.025, segments: 40 },
      { at: [0, 0.06, 0], contact: true },
    ),
    turned('flare', 'post', {
      profile: [
        [0, 0.12],
        [0.15, 0.12],
        [0.125, 0.22],
        [0.08, 0.42],
        [0.055, 0.62],
        [0, 0.62],
      ],
      segments: 40,
    }),
  ];
}

function column(): ModelSpecPart[] {
  return [
    rod(
      'pole',
      'post',
      { height: by(TOP, 1, -1.16), top: 0.04, bottom: 0.052, bevel: 0.012, segments: 32 },
      { at: [0, by(TOP, 0.5, 0.02), 0] },
    ),
    rod(
      'collar',
      'accent',
      { height: 0.05, top: 0.065, bevel: 0.015, segments: 32 },
      { at: [0, 0.64, 0], minLod: 1 },
    ),
    rod(
      'neck',
      'accent',
      { height: 0.05, top: 0.06, bevel: 0.015, segments: 32 },
      { at: [0, by(TOP, 1, -0.585), 0], minLod: 1 },
    ),
  ];
}

function ribs(): ModelSpecPart[] {
  return [45, 135, 225, 315].map((angle) => {
    const x = Math.cos((angle * Math.PI) / 180) * 0.128;
    const z = Math.sin((angle * Math.PI) / 180) * 0.128;
    return block(`rib${String(angle)}`, 'post', [0.02, 0.34, 0.02], {
      round: 0.006,
      segments: 3,
      at: [x, by(TOP, 1, -0.34), z],
      minLod: 1,
    });
  });
}

function lantern(): ModelSpecPart[] {
  return [
    rod(
      'cup',
      'post',
      { height: 0.06, top: 0.1, bottom: 0.075, bevel: 0.018, segments: 32 },
      { at: [0, by(TOP, 1, -0.53), 0] },
    ),
    rod(
      'glass',
      'glass',
      { height: 0.32, top: 0.125, bottom: 0.11, bevel: 0.02, segments: 40 },
      { at: [0, by(TOP, 1, -0.34), 0] },
    ),
    ...ribs(),
    rod(
      'hood',
      'post',
      { height: 0.15, top: 0.03, bottom: 0.19, bevel: 0.02, segments: 40 },
      { at: [0, by(TOP, 1, -0.105), 0] },
    ),
    blob('finial', 'accent', [0.035, 0.035, 0.035], {
      at: [0, by(TOP, 1, -0.02), 0],
      segments: 20,
    }),
  ];
}

export const LAMP_POST_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.lamp-post',
  title: 'Lamp post',
  category: 'outdoor',
  footprint: { width: 0.4, depth: 0.4, height: 3.415 },
  size: { height: { param: 'height', extra: 0.015, resizes: true } },
  view: { yaw: 30, pitch: 10, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Lamp post',
      synonyms: ['lamp post', 'garden lamp', 'street lamp', 'lantern post', 'outdoor light pole'],
    },
    sizeClass: 'tall',
  },
  params: { height: { min: 1.6, max: 5, default: 3.4, unit: 'm' } },
  materials: {
    post: tokenMaterial('satin-black', { roughness: 0.5 }),
    glass: tokenMaterial('frosted-glass'),
    accent: colorMaterial('#B08D57', { roughness: 0.35, metalness: 0.9 }),
  },
  finish: finishSet(
    {
      black: {},
      graphite: { post: { finish: 'graphite' } },
      verdigris: { post: { color: '#4F7A6E' } },
      white: { post: { finish: 'matte-white' } },
    },
    'black',
  ),
  parts: [...base(), ...column(), ...lantern()],
  anchors: [
    {
      kind: 'emitter',
      id: 'lampLight',
      parent: 'glass',
      position: [0, 0, 0],
      color: '#FFD9A0',
      intensity: 1,
      radius: 2.4,
    },
  ],
  channels: [
    glowChannel('glassGlow', 'glass', 'brightness'),
    glowChannel('lightGlow', 'lampLight', 'brightness'),
  ],
  shots: [
    whileOn({
      id: 'lit',
      signal: 'power',
      focus: 'glass',
      zoom: 1.4,
      yaw: -10,
      pitch: -8,
      loopS: 2,
      stillAt: 0.5,
    }),
  ],
  states: {
    off: { power: false, brightness: 0 },
    on: { power: true, brightness: 1 },
    dim: { power: true, brightness: 0.4 },
  },
});
