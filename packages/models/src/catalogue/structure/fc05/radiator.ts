import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  REST_STATES,
  STRUCTURE_FINISH_NAMES,
  WALL_VIEW,
  anchorsOf,
  box,
  by,
  cylinder,
  framingOf,
} from '../fc01/look';

const LIFT = 0.12;
const DEPTH = 0.07;
const RIBS = 6;
const PIPE_INSET = 0.06;

function pipes(): ModelSpecPart[] {
  return ([-1, 1] as const).map((side) =>
    cylinder(
      side < 0 ? 'pipeLeft' : 'pipeRight',
      'accent',
      { radius: 0.009, h: LIFT, bevel: 0.002, seg: 24 },
      { at: [by('width', side * 0.5, -side * PIPE_INSET), LIFT / 2, -0.02] },
    ),
  );
}

function valve(): ModelSpecPart[] {
  return [
    cylinder(
      'valveBody',
      'accent',
      { radius: 0.016, h: 0.04, bevel: 0.003, seg: 24 },
      { at: [by('width', -0.5, PIPE_INSET), 0.07, -0.02], turn: [0, 0, 90] },
    ),
    cylinder(
      'valveHead',
      'accent',
      { radius: 0.022, h: 0.05, bevel: 0.004, seg: 32 },
      { at: [by('width', -0.5, PIPE_INSET + 0.045), 0.07, -0.02], turn: [0, 0, 90] },
    ),
  ];
}

export const RADIATOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.radiator',
  version: '1.0.0',
  title: 'Radiator',
  category: 'structure',
  footprint: { width: 1, depth: DEPTH, height: 0.722 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0.122, resizes: true },
  },
  framing: framingOf(WALL_VIEW),
  meta: {
    names: {
      display: 'Radiator',
      synonyms: ['radiator', 'panel radiator', 'heater panel', 'hydronic radiator', 'wall heater'],
    },
    sizeClass: 'medium',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 0.4, max: 2, default: 1, unit: 'm' },
    height: { min: 0.3, max: 1.2, default: 0.6, unit: 'm' },
  },
  materials: {
    body: tokenMaterial('matte-white', { roughness: 0.5, clearcoat: 0.2 }),
    trim: tokenMaterial('graphite'),
    accent: tokenMaterial('chrome'),
  },
  ...finishSet(
    {
      plasterWhite: {},
      warmWhite: { body: { finish: 'warm-white', roughness: 0.46 } },
      concrete: { body: { color: '#8C8A85', roughness: 0.7 } },
      brick: { body: { color: '#9A5540', roughness: 0.6 } },
      timber: { body: { finish: 'oak' } },
    },
    'plasterWhite',
  ),
  parts: [
    box(
      'body',
      'body',
      { w: by('width'), h: by('height'), d: DEPTH, r: 0.014 },
      { at: [0, by('height', 0.5, LIFT), 0], contact: true },
    ),
    {
      id: 'ribs',
      geometry: {
        type: 'slats',
        count: RIBS,
        spacing: by('height', 1 / (RIBS + 1)),
        width: by('width', 1, -0.06),
        height: 0.014,
        depth: 0.016,
      },
      material: 'body',
      transform: { position: [0, by('height', 0.5, LIFT), DEPTH / 2 + 0.003] },
    },
    {
      id: 'grille',
      geometry: {
        type: 'grille',
        width: by('width', 1, -0.08),
        height: 0.05,
        rows: 1,
        columns: 22,
        holeRadius: 0.006,
      },
      material: 'trim',
      transform: { position: [0, by('height', 1, LIFT + 0.002), 0], rotation: [-90, 0, 0] },
    },
    ...pipes(),
    ...valve(),
  ],
  anchors: anchorsOf({ id: 'radiator', mount: 'wall', size: [1, 0.72, DEPTH], centreY: 0.36 }),
  states: REST_STATES,
};
