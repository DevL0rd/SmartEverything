import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { tokenMaterial } from '../../../helpers/finishes';
import {
  HOUSE,
  STRUCTURE_FINISH_NAMES,
  anchorsOf,
  box,
  by,
  cylinder,
  framingOf,
} from '../fc01/look';
import {
  DOOR_MATERIALS,
  DOOR_STATES,
  GAP,
  JAMB,
  JAMB_D,
  doorFinishes,
  doorFrame,
  openShot,
  paramAxis,
  swing,
} from './frame';

const LEAF_D = 0.055;
const SILL = 0.02;
const BAR_Y = 1.05;
const FACE = LEAF_D / 2;

function leaf(): ModelSpecPart[] {
  return [
    box(
      'threshold',
      'frame',
      { w: by('width', 1, 2 * (JAMB + GAP)), h: SILL, d: JAMB_D + 0.03, r: 0.004 },
      { at: [0, SILL / 2, 0.015], contact: true },
    ),
    cylinder(
      'hinge',
      'accent',
      { radius: 0.009, h: 0.11, bevel: 0.002, seg: 24 },
      { at: [by('width', -0.5), by('height', 0.5), FACE] },
    ),
    box(
      'leaf',
      'leaf',
      {
        w: by('width', 1, -GAP * 2),
        h: by('height', 1, -SILL - 0.008),
        d: LEAF_D,
        r: 0.005,
        seg: 4,
      },
      { at: [by('width', 0.5), (SILL + 0.004) / 2, -FACE], parent: 'hinge' },
    ),
    box(
      'vision',
      'glass',
      { w: 0.12, h: by('height', 0.62), d: LEAF_D + 0.004, r: 0.004 },
      { at: [by('width', -0.5, 0.2), by('height', 0.1), 0], parent: 'leaf' },
    ),
  ];
}

function panels(): ModelSpecPart[] {
  return [-1, 1].flatMap((face) =>
    [-1, 1].map((row) =>
      box(
        `panel${row < 0 ? 'Low' : 'High'}${face > 0 ? 'Front' : 'Back'}`,
        'leaf',
        { w: by('width', 1, -0.42), h: by('height', 0.36), d: 0.008, r: 0.004 },
        {
          at: [0.11, by('height', row * 0.2), face * (FACE + 0.003)],
          parent: 'leaf',
          minLod: face > 0 ? 1 : 2,
        },
      ),
    ),
  );
}

function hardware(): ModelSpecPart[] {
  const x = by('width', 0.5, -0.09);
  const at = (dy: number): ReturnType<typeof by> => by('height', -0.5, BAR_Y + dy);
  return [
    cylinder(
      'pull',
      'accent',
      { radius: 0.014, h: 0.6, bevel: 0.004, seg: 32 },
      { at: [x, at(0), FACE + 0.06], parent: 'leaf' },
    ),
    ...[-1, 1].map((row) =>
      cylinder(
        `standoff${row < 0 ? 'Low' : 'High'}`,
        'accent',
        { radius: 0.008, h: 0.06, bevel: 0.002, seg: 16 },
        { at: [x, at(row * 0.25), FACE + 0.03], turn: [90, 0, 0], parent: 'leaf', minLod: 1 },
      ),
    ),
    cylinder(
      'lockRose',
      'accent',
      { radius: 0.022, h: 0.01, bevel: 0.003, seg: 32 },
      { at: [x, at(-0.2), FACE + 0.005], turn: [90, 0, 0], parent: 'leaf', minLod: 1 },
    ),
    box(
      'leverBack',
      'accent',
      { w: 0.12, h: 0.018, d: 0.018, r: 0.008 },
      { at: [by('width', 0.5, -0.12), at(-0.05), -FACE - 0.02], parent: 'leaf', minLod: 1 },
    ),
    ...[-1, 1].map((row) =>
      cylinder(
        `hinge${row < 0 ? 'Low' : 'High'}`,
        'accent',
        { radius: 0.009, h: 0.11, bevel: 0.002, seg: 24 },
        {
          at: [by('width', -0.5, 0.003), by('height', row * 0.5, -row * 0.25), FACE],
          parent: 'leaf',
          minLod: 1,
        },
      ),
    ),
  ];
}

export const DOOR_FRONT_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.door-front',
  version: '1.0.0',
  title: 'Front door',
  category: 'structure',
  footprint: { width: 1.106, depth: 0.17, height: 2.213 },
  size: {
    width: { param: 'width', extra: 0.186, resizes: true },
    height: { param: 'height', extra: 0.113, resizes: true },
  },
  framing: framingOf(HOUSE),
  shots: [openShot('leaf')],
  meta: {
    names: {
      display: 'Front door',
      synonyms: ['front door', 'entrance door', 'entry door', 'main door', 'exterior door'],
    },
    sizeClass: 'tall',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 0.8, max: 1.2, default: 0.92, unit: 'm' },
    height: { min: 2, max: 2.4, default: 2.1, unit: 'm' },
  },
  materials: {
    ...DOOR_MATERIALS,
    glass: tokenMaterial('frosted-glass'),
    accent: tokenMaterial('satin-black', { roughness: 0.4 }),
  },
  ...doorFinishes('timber'),
  parts: [
    ...doorFrame({ w: paramAxis('width'), h: paramAxis('height') }),
    ...leaf(),
    ...panels(),
    ...hardware(),
  ],
  anchors: anchorsOf({ id: 'frontDoor', mount: 'floor', size: [1.16, 2.22, 0.17], centreY: 1.11 }),
  channels: [swing('leafSwing', 'hinge', 95)],
  states: DOOR_STATES,
};
