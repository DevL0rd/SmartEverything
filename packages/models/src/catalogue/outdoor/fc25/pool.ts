import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { arch, block, by, catalogueModel, glowChannel, whileOn } from './kit';

const COPING = 0.4;
const TOP = 0.1;
const FOOT: readonly [number, number, number][] = [
  [0, -0.06, -0.4],
  [0, 0.5, -0.22],
  [0, 0.68, 0],
  [0, 0.5, 0.22],
  [0, 0, 0.4],
];

function copingParts(): ModelSpecPart[] {
  const round = { round: 0.02, segments: 3 };
  return [
    block('copingFront', 'coping', [by('width', 1, COPING * 2), TOP, COPING], {
      ...round,
      at: [0, TOP / 2, by('length', 0.5, COPING / 2)],
      contact: true,
    }),
    block('copingBack', 'coping', [by('width', 1, COPING * 2), TOP, COPING], {
      ...round,
      at: [0, TOP / 2, by('length', -0.5, -COPING / 2)],
      contact: true,
    }),
    block('copingLeft', 'coping', [COPING, TOP, by('length')], {
      ...round,
      at: [by('width', -0.5, -COPING / 2), TOP / 2, 0],
      contact: true,
    }),
    block('copingRight', 'coping', [COPING, TOP, by('length')], {
      ...round,
      at: [by('width', 0.5, COPING / 2), TOP / 2, 0],
      contact: true,
    }),
  ];
}

function basin(): ModelSpecPart[] {
  return [
    block('liner', 'liner', [by('width', 1, 0.02), 0.04, by('length', 1, 0.02)], {
      round: 0.015,
      segments: 3,
      at: [0, 0.02, 0],
    }),
    block('water', 'water', [by('width', 1, -0.02), 0.05, by('length', 1, -0.02)], {
      round: 0.02,
      segments: 3,
      at: [0, 0.06, 0],
    }),
  ];
}

function ladder(): ModelSpecPart[] {
  return [-0.2, 0.2].map((side, index) =>
    arch(
      `ladderRail${String(index + 1)}`,
      'accent',
      { points: FOOT, radius: 0.02 },
      { at: [by('width', 0.5, -0.5 + side), TOP, by('length', 0.5, 0.05)] },
    ),
  );
}

export const POOL_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.pool',
  title: 'Swimming pool',
  category: 'outdoor',
  footprint: { width: 4.8, depth: 8.8688, height: 0.8 },
  size: {
    width: { param: 'width', extra: 0.8, resizes: true },
    depth: { param: 'length', extra: 0.8688, resizes: true },
  },
  view: { yaw: 30, pitch: 35, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Swimming pool',
      synonyms: ['pool', 'swimming pool', 'garden pool', 'plunge pool', 'lap pool'],
    },
    sizeClass: 'large',
  },
  params: {
    width: { min: 2, max: 8, default: 4, unit: 'm' },
    length: { min: 3, max: 16, default: 8, unit: 'm' },
  },
  materials: {
    coping: colorMaterial('#D8D2C6', { roughness: 0.6 }),
    liner: colorMaterial('#86CFE2', { roughness: 0.35, clearcoat: 0.3 }),
    water: colorMaterial('#58C4E0', { roughness: 0.1, clearcoat: 1, opacity: 0.72 }),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      aqua: {},
      lagoon: { water: { color: '#2F86C0' }, liner: { color: '#3C86B4' } },
      slate: {
        water: { color: '#5E9CB0' },
        liner: { color: '#5A7C8A' },
        coping: { color: '#77797C' },
      },
      sandstone: { coping: { color: '#DCCFB4' } },
    },
    'aqua',
  ),
  parts: [...copingParts(), ...basin(), ...ladder()],
  anchors: [
    {
      kind: 'emitter',
      id: 'poolLight',
      parent: 'water',
      position: [0, 0, 0],
      color: '#7FE3FF',
      intensity: 1,
      radius: 3,
    },
    {
      kind: 'effect',
      id: 'ripples',
      parent: 'water',
      position: [0, 0.03, 0],
      effect: 'ripple',
      size: 1.5,
    },
  ],
  channels: [
    glowChannel('waterGlow', 'water', 'power'),
    glowChannel('lightGlow', 'poolLight', 'power'),
  ],
  shots: [
    whileOn({
      id: 'lit',
      signal: 'power',
      focus: 'water',
      zoom: 1.15,
      yaw: -8,
      pitch: 38,
      loopS: 4,
      stillAt: 1,
    }),
  ],
  states: { off: { power: false }, on: { power: true } },
});
