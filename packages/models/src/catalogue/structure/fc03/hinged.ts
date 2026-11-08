import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
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
  doorFinishes,
  doorFrame,
  openShot,
  paramAxis,
  swing,
} from './frame';

export const LEAF_D = 0.04;
export const HANDLE_Y = 1;

export interface Leaf {
  readonly name: string;
  readonly side: 1 | -1;
  readonly share: number;
}

function hinge(leaf: Leaf): ModelSpecPart {
  return cylinder(
    `hinge${leaf.name}`,
    'accent',
    { radius: 0.008, h: 0.1, bevel: 0.002, seg: 16 },
    { at: [by('width', -leaf.side * 0.5), by('height', 0.5), LEAF_D / 2] },
  );
}

function leafBody(leaf: Leaf): ModelSpecPart {
  return box(
    `leaf${leaf.name}`,
    'leaf',
    {
      w: by('width', leaf.share, -GAP * 2),
      h: by('height', 1, -0.008),
      d: LEAF_D,
      r: 0.004,
      seg: 4,
    },
    {
      at: [by('width', leaf.side * leaf.share * 0.5), 0.002, -LEAF_D / 2],
      parent: `hinge${leaf.name}`,
    },
  );
}

function panels(leaf: Leaf): ModelSpecPart[] {
  return [-1, 1].flatMap((face) =>
    [-1, 1].map((row) =>
      box(
        `panel${leaf.name}${row < 0 ? 'Low' : 'High'}${face > 0 ? 'Front' : 'Back'}`,
        'leaf',
        { w: by('width', leaf.share, -0.2), h: by('height', 0.36), d: 0.006, r: 0.003 },
        {
          at: [0, by('height', row * 0.2), face * (LEAF_D / 2 + 0.002)],
          parent: `leaf${leaf.name}`,
          minLod: face > 0 ? 1 : 2,
        },
      ),
    ),
  );
}

function handle(leaf: Leaf, face: 1 | -1): ModelSpecPart[] {
  const name = `${leaf.name}${face > 0 ? 'Front' : 'Back'}`;
  const parent = `leaf${leaf.name}`;
  const x = by('width', leaf.side * leaf.share * 0.5, -leaf.side * 0.065);
  const y = by('height', -0.5, HANDLE_Y);
  const minLod = face > 0 ? 0 : 2;
  return [
    cylinder(
      `rose${name}`,
      'accent',
      { radius: 0.026, h: 0.01, bevel: 0.003, seg: 32 },
      { at: [x, y, face * (LEAF_D / 2 + 0.005)], turn: [90, 0, 0], parent, minLod },
    ),
    box(
      `lever${name}`,
      'accent',
      { w: 0.12, h: 0.018, d: 0.018, r: 0.008 },
      {
        at: [by('width', leaf.side * leaf.share * 0.5, -leaf.side * 0.115), y, face * 0.045],
        parent,
        minLod,
      },
    ),
  ];
}

function leafHinges(leaf: Leaf): ModelSpecPart[] {
  return [-1, 1].map((row) =>
    cylinder(
      `hinge${leaf.name}${row < 0 ? 'Low' : 'High'}`,
      'accent',
      { radius: 0.008, h: 0.1, bevel: 0.002, seg: 16 },
      {
        at: [
          by('width', -leaf.side * leaf.share * 0.5),
          by('height', row * 0.5, -row * 0.25),
          LEAF_D / 2,
        ],
        parent: `leaf${leaf.name}`,
        minLod: 1,
      },
    ),
  );
}

export function leafParts(leaf: Leaf): ModelSpecPart[] {
  return [
    hinge(leaf),
    leafBody(leaf),
    ...panels(leaf),
    ...handle(leaf, 1),
    ...handle(leaf, -1),
    ...leafHinges(leaf),
  ];
}

const SINGLE: Leaf = { name: '', side: 1, share: 1 };

const FRAME = { w: paramAxis('width'), h: paramAxis('height') };

const HEIGHT = { min: 1.9, max: 2.4, default: 2.04, unit: 'm' } as const;

function meta(display: string, synonyms: string[]): ModelSpec['meta'] {
  return { names: { display, synonyms }, sizeClass: 'tall', variants: [...STRUCTURE_FINISH_NAMES] };
}

export const DOOR_HINGED_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.door-hinged',
  version: '1.0.0',
  title: 'Interior door',
  category: 'structure',
  footprint: { width: 1.006, depth: 0.16, height: 2.153 },
  size: {
    width: { param: 'width', extra: 0.186, resizes: true },
    height: { param: 'height', extra: 0.113, resizes: true },
  },
  framing: framingOf(HOUSE),
  shots: [openShot('leaf')],
  meta: meta('Interior door', ['door', 'hinged door', 'interior door', 'swing door', 'room door']),
  params: { width: { min: 0.6, max: 1.1, default: 0.82, unit: 'm' }, height: HEIGHT },
  materials: DOOR_MATERIALS,
  ...doorFinishes('plasterWhite'),
  parts: [...doorFrame(FRAME), ...leafParts(SINGLE)],
  anchors: anchorsOf({ id: 'door', mount: 'floor', size: [1.06, 2.16, 0.16], centreY: 1.08 }),
  channels: [swing('leafSwing', 'hinge', 95)],
  states: DOOR_STATES,
};

const LEFT: Leaf = { name: 'Left', side: 1, share: 0.5 };
const RIGHT: Leaf = { name: 'Right', side: -1, share: 0.5 };

export const DOOR_DOUBLE_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.door-double',
  version: '1.0.0',
  title: 'Double door',
  category: 'structure',
  footprint: { width: 1.786, depth: 0.16, height: 2.153 },
  size: {
    width: { param: 'width', extra: 0.186, resizes: true },
    height: { param: 'height', extra: 0.113, resizes: true },
  },
  framing: framingOf(HOUSE),
  shots: [openShot('leafLeft')],
  meta: meta('Double door', ['double door', 'french door', 'pair of doors', 'twin doors']),
  params: { width: { min: 1.1, max: 2.4, default: 1.6, unit: 'm' }, height: HEIGHT },
  materials: DOOR_MATERIALS,
  ...doorFinishes('plasterWhite'),
  parts: [
    ...doorFrame(FRAME),
    ...leafParts(LEFT),
    ...leafParts(RIGHT),
    box(
      'astragal',
      'leaf',
      { w: 0.03, h: by('height', 1, -0.02), d: 0.008, r: 0.003 },
      { at: [by('width', -0.25, -0.01), 0, LEAF_D / 2 + 0.004], parent: 'leafRight', minLod: 1 },
    ),
  ],
  anchors: anchorsOf({ id: 'doubleDoor', mount: 'floor', size: [1.84, 2.16, 0.16], centreY: 1.08 }),
  channels: [swing('leftSwing', 'hingeLeft', 95), swing('rightSwing', 'hingeRight', -95)],
  states: DOOR_STATES,
};
