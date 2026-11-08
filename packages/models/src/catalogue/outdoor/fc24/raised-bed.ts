import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { OUTDOOR_FRAME, block, by, outdoorItem, piece } from '../fc23/kit';

const BOARD = 0.035;
const BOARD_H = 0.14;
const PITCH = 0.15;
const BASE = 0.03;
const RISE = BASE + BOARD_H + PITCH;
const MID = BASE + (BOARD_H + PITCH) / 2;
const POST = 0.06;
const ROW_FRACTIONS = [-0.33, 0, 0.33] as const;

function sides(): ModelSpecPart[] {
  return [
    ...[-1, 1].map((side) =>
      piece(
        side < 0 ? 'boardBack' : 'boardFront',
        'frame',
        {
          type: 'slats',
          count: 2,
          spacing: PITCH,
          width: by('length', 1),
          height: BOARD_H,
          depth: BOARD,
        },
        { at: [0, MID, by('width', side * 0.5, -side * (BOARD / 2))] },
      ),
    ),
    ...[-1, 1].map((side) =>
      piece(
        side < 0 ? 'boardLeft' : 'boardRight',
        'frame',
        {
          type: 'slats',
          count: 2,
          spacing: PITCH,
          width: BOARD,
          height: BOARD_H,
          depth: by('width', 1, -2 * BOARD),
        },
        { at: [by('length', side * 0.5, -side * (BOARD / 2)), MID, 0] },
      ),
    ),
  ];
}

function posts(): ModelSpecPart[] {
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx = 1, sz = 1], index) =>
    block(`post${String(index + 1)}`, 'frame', [POST, RISE + 0.02, POST], {
      at: [
        by('length', sx * 0.5, -sx * (POST / 2)),
        (RISE + 0.02) / 2,
        by('width', sz * 0.5, -sz * (POST / 2)),
      ],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
  );
}

function crops(): ModelSpecPart[] {
  return [-1, 1].flatMap((row) =>
    ROW_FRACTIONS.map((fraction, index) =>
      piece(
        `crop${row < 0 ? 'A' : 'B'}${String(index + 1)}`,
        index === 1 ? 'accent' : 'leaf',
        { type: 'sphere', radius: 0.09, segments: 20 },
        { at: [by('length', fraction), 0.355, by('width', row * 0.22)], scale: [1.1, 0.75, 1.1] },
      ),
    ),
  );
}

export const RAISED_BED_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.raised-bed',
  title: 'Raised bed',
  footprint: { width: 1.2, depth: 0.8, height: 0.45 },
  size: {
    width: { param: 'length', extra: 0, resizes: true },
    depth: { param: 'width', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Raised bed',
      synonyms: [
        'garden bed',
        'vegetable bed',
        'raised planter',
        'growing bed',
        'timber garden bed',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.garden-bed', 'cat.outdoor.vegetable-bed'],
  },
  params: {
    length: { min: 0.8, max: 2.4, default: 1.2, unit: 'm' },
    width: { min: 0.6, max: 1.2, default: 0.8, unit: 'm' },
  },
  materials: {
    frame: OUTDOOR_FRAME,
    soil: { color: '#4A3828', roughness: 0.95 },
    leaf: { color: '#4C8A3E', roughness: 0.75 },
    accent: { color: '#8FB35B', roughness: 0.7 },
  },
  slots: { frame: ['frame'] },
  parts: [
    ...sides(),
    block('soil', 'soil', [by('length', 1, -2 * BOARD), 0.06, by('width', 1, -2 * BOARD)], {
      at: [0, 0.3, 0],
      round: 0.01,
      segments: 3,
    }),
    ...posts(),
    ...crops(),
  ],
});
