import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  piece,
  rod,
  woodFinishes,
  woodOf,
  type BlockOptions,
  type Vec,
} from '../../living/fc06/kit';
import { DOOR_STATES, openShot, swing } from '../../structure/fc03/frame';
import { MIRROR_MATERIAL, bedroomItem } from '../fc14/kit';

const DEPTH = 0.6;
const TOP = 0.03;
const PLINTH = 0.08;
const LEAF_T = 0.02;
const FACE_Z = DEPTH / 2 - 0.01;
const DIVIDER_Z = -0.01;
const SEAM = 0.004;
const MARGIN = 0.03;
const SWING = 95;
const CLEAR_Y = (PLINTH - TOP) / 2;

type Side = -1 | 1;

interface DoorSet {
  readonly count: number;
  readonly hinges: readonly Side[];
  readonly visible: ReturnType<typeof by>;
  readonly parent?: string;
}

const SETS: readonly DoorSet[] = [
  { count: 2, hinges: [-1, 1], visible: by('doors', -1, 2.5) },
  { count: 3, hinges: [-1, -1, 1], visible: by('doors', -1, 3.5), parent: 'divider' },
  { count: 4, hinges: [-1, 1, -1, 1], visible: by('doors', 1, -3.5) },
];

const INNER_H = by('height', 1, -PLINTH - TOP);
const INNER_Y = by('height', 0.5, CLEAR_Y);

function shell(): ModelSpecPart[] {
  return [
    ...[-1, 1].map((side) =>
      block(
        side < 0 ? 'sideLeft' : 'sideRight',
        'body',
        [0.025, by('height', 1, -PLINTH), DEPTH - 0.01],
        {
          at: [by('width', side / 2, -side * 0.0125), by('height', 0.5, PLINTH / 2), -0.005],
          round: 0.006,
          segments: 3,
        },
      ),
    ),
    block('top', 'body', [by('width', 1), TOP, DEPTH], {
      at: [0, by('height', 1, -TOP / 2), 0],
      round: 0.01,
      segments: 3,
    }),
    block('plinth', 'body', [by('width', 1, -0.04), PLINTH, DEPTH - 0.06], {
      at: [0, PLINTH / 2, -0.02],
      round: 0.006,
      segments: 3,
      contact: true,
    }),
    block('back', 'body', [by('width', 1, -0.05), INNER_H, 0.015], {
      at: [0, INNER_Y, -DEPTH / 2 + 0.01],
      round: 0.003,
      segments: 3,
    }),
  ];
}

function interior(): ModelSpecPart[] {
  return [
    block('carcassFloor', 'body', [by('width', 1, -0.05), 0.025, DEPTH - 0.04], {
      at: [0, PLINTH + 0.0125, -0.005],
      round: 0.004,
      segments: 3,
      minLod: 2,
    }),
    block('shelf', 'body', [by('width', 1, -0.05), 0.022, DEPTH - 0.1], {
      at: [0, by('height', 1, -0.38), -0.02],
      round: 0.004,
      segments: 3,
      minLod: 2,
    }),
    rod(
      'hangingRail',
      'accent',
      { height: by('width', 1, -0.06), top: 0.012, segments: 24 },
      { at: [0, by('height', 1, -0.5), -0.02], turn: [0, 0, 90], minLod: 2 },
    ),
    {
      ...block('divider', 'body', [0.02, INNER_H, DEPTH - 0.06], {
        at: [0, INNER_Y, DIVIDER_Z],
        round: 0.004,
        segments: 3,
      }),
      visible: by('doors', 1, -2.5),
    },
  ];
}

interface Door {
  readonly set: DoorSet;
  readonly name: string;
  readonly pivotId: string;
  readonly leafId: string;
  readonly sign: Side;
  readonly mirrored: boolean;
  readonly place: BlockOptions;
}

const LEAF_H = by('height', 1, -PLINTH - TOP - 0.008);

function doorOf(set: DoorSet, index: number): Door {
  const n = set.count;
  const side = set.hinges[index] ?? -1;
  const offset = index + 0.5 - n / 2;
  const name = `${String(n)}${String(index + 1)}`;
  const hingeX = by(
    'width',
    offset / n + side / (2 * n),
    (-MARGIN * offset) / n + side * (-(MARGIN / 2) / n - SEAM / 2),
  );
  return {
    set,
    name,
    pivotId: `pivot${name}`,
    leafId: `leaf${name}`,
    sign: side < 0 ? 1 : -1,
    mirrored: index === n - 1,
    place:
      set.parent === undefined
        ? { at: [hingeX, INNER_Y, FACE_Z] }
        : { at: [hingeX, 0, FACE_Z - DIVIDER_Z], parent: set.parent },
  };
}

function leafOffset(door: Door, extra: number): ReturnType<typeof by> {
  const n = door.set.count;
  return by('width', door.sign / (2 * n), door.sign * (-(MARGIN / 2) / n - SEAM / 2 - extra));
}

function doorParts(set: DoorSet, index: number): ModelSpecPart[] {
  const door = doorOf(set, index);
  const n = set.count;
  const panelSize: Vec = [
    by('width', 1 / n, -MARGIN / n - SEAM - 0.1),
    by('height', 1, -PLINTH - TOP - 0.008 - 0.16),
    0.006,
  ];
  return [
    {
      ...piece(
        door.pivotId,
        'accent',
        { type: 'cylinder', height: LEAF_H, topRadius: 0.006, bottomRadius: 0.006, segments: 12 },
        door.place,
      ),
      visible: set.visible,
    },
    block(door.leafId, 'body', [by('width', 1 / n, -MARGIN / n - SEAM), LEAF_H, LEAF_T], {
      at: [leafOffset(door, 0), 0, 0],
      parent: door.pivotId,
      round: 0.006,
      segments: 3,
    }),
    block(`panel${door.name}`, door.mirrored ? 'mirror' : 'body', panelSize, {
      at: [0, 0, LEAF_T / 2 + 0.002],
      parent: door.leafId,
      round: 0.003,
      segments: 3,
      minLod: 1,
    }),
    block(`handle${door.name}`, 'accent', [0.014, 0.4, 0.016], {
      at: [leafOffset(door, 0.045), by('height', -0.5, 1 - CLEAR_Y), LEAF_T / 2 + 0.008],
      parent: door.leafId,
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
  ];
}

function channels(): ModelSpecChannel[] {
  return SETS.flatMap((set) =>
    set.hinges.map((side, index) =>
      swing(
        `swing${String(set.count)}${String(index + 1)}`,
        `pivot${String(set.count)}${String(index + 1)}`,
        side < 0 ? -SWING : SWING,
      ),
    ),
  );
}

export const WARDROBE_MODEL: ModelSpec = bedroomItem(
  {
    id: 'cat.bedroom.wardrobe',
    title: 'Wardrobe',
    footprint: { width: 1.6, depth: DEPTH, height: 2.2 },
    size: {
      width: { param: 'width', extra: 0, resizes: true },
      height: { param: 'height', extra: 0, resizes: true },
    },
    meta: {
      names: {
        display: 'Wardrobe',
        synonyms: ['closet', 'armoire', 'clothes cupboard', 'cupboard', 'fitted wardrobe'],
      },
      sizeClass: 'tall',
      aliases: ['cat.bedroom.closet'],
    },
    params: {
      width: { min: 1, max: 2.4, default: 1.6, unit: 'm' },
      height: { min: 1.9, max: 2.5, default: 2.2, unit: 'm' },
      doors: { min: 2, max: 4, default: 2, unit: 'count' },
    },
    materials: {
      body: woodOf('oak'),
      mirror: MIRROR_MATERIAL,
      accent: { finish: 'brushed-aluminium' },
    },
    finishes: woodFinishes(['body']),
    defaultFinish: 'oak',
    pitch: 12,
    wall: true,
    parts: [
      ...shell(),
      ...interior(),
      ...SETS.flatMap((set) =>
        Array.from({ length: set.count }, (_, index) => doorParts(set, index)).flat(),
      ),
    ],
  },
  { channels: channels(), shots: [openShot('back')], states: DOOR_STATES },
);
