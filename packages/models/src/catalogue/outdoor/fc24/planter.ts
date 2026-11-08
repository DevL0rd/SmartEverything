import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { OUTDOOR_FRAME, block, by, outdoorItem, piece } from '../fc23/kit';

const DEPTH = 0.38;
const FOOT = 0.035;
const BOARD_H = 0.115;
const BOARD_PITCH = 0.125;
const TOP = FOOT + BOARD_H + 2 * BOARD_PITCH;

const PLANTS: readonly (readonly [number, number, number, number])[] = [
  [-0.5, 0.16, 0.12, 0.5],
  [0, 0, 0.15, 0.52],
  [0.5, -0.16, 0.12, 0.5],
];

const BLOOMS: readonly (readonly [number, number, number, number])[] = [
  [-0.3, 0.05, 0.6, 0.04],
  [-0.24, -0.04, 0.55, 0.0],
  [0, -0.06, 0.66, 0.06],
  [0.3, 0.04, 0.6, -0.04],
  [0.35, -0.03, 0.56, 0.0],
];

function plants(): ModelSpecPart[] {
  return PLANTS.map(([fraction, inset, radius, y], index) =>
    piece(
      `plant${String(index + 1)}`,
      'leaf',
      { type: 'sphere', radius, segments: 24 },
      { at: [by('length', fraction, inset), y, 0], scale: [1.15, 0.85, 1.05] },
    ),
  );
}

function blooms(): ModelSpecPart[] {
  return BLOOMS.map(([fraction, dx, y, z], index) =>
    piece(
      `bloom${String(index + 1)}`,
      'accent',
      { type: 'sphere', radius: 0.032, segments: 16 },
      { at: [by('length', fraction, dx), y, z], minLod: 1 },
    ),
  );
}

export const PLANTER_BOX_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.planter-box',
  title: 'Planter box',
  footprint: { width: 0.9, depth: DEPTH, height: 0.7 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Planter box',
      synonyms: ['window box', 'garden planter', 'plant trough', 'flower box', 'wooden planter'],
    },
    sizeClass: 'medium',
    aliases: ['cat.outdoor.planter', 'cat.outdoor.trough'],
  },
  params: { length: { min: 0.5, max: 1.6, default: 0.9, unit: 'm' } },
  materials: {
    frame: OUTDOOR_FRAME,
    soil: { color: '#4A3828', roughness: 0.95 },
    leaf: { color: '#3F7A3A', roughness: 0.75 },
    accent: { color: '#E9A8B8', roughness: 0.6 },
  },
  slots: { frame: ['frame'] },
  parts: [
    piece(
      'boards',
      'frame',
      {
        type: 'slats',
        count: 3,
        spacing: BOARD_PITCH,
        width: by('length', 1),
        height: BOARD_H,
        depth: DEPTH,
      },
      { at: [0, FOOT + (BOARD_H + 2 * BOARD_PITCH) / 2, 0], contact: true },
    ),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'footLeft' : 'footRight', 'frame', [0.07, FOOT + 0.01, DEPTH - 0.04], {
        at: [by('length', side * 0.5, -side * 0.08), (FOOT + 0.01) / 2, 0],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ),
    block('soil', 'soil', [by('length', 1, -0.06), 0.03, DEPTH - 0.06], {
      at: [0, TOP - 0.01, 0],
      round: 0.01,
      segments: 3,
    }),
    ...plants(),
    ...blooms(),
  ],
});
