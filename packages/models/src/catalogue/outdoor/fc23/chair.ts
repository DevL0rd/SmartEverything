import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { OUTDOOR_FRAME, block, fabric, outdoorItem, piece, CUSHION_COLOURS } from './kit';

const SEAT_Y = 0.45;
const POST_X = 0.25;
const FRONT_Z = 0.22;
const REAR_Z = -0.24;

function posts(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    return [
      block(`front${name}`, 'frame', [0.04, 0.62, 0.04], {
        at: [side * POST_X, 0.31, FRONT_Z],
        round: 0.01,
        segments: 3,
        contact: true,
      }),
      block(`rear${name}`, 'frame', [0.04, 0.9, 0.04], {
        at: [side * POST_X, 0.45, REAR_Z],
        round: 0.01,
        segments: 3,
        contact: true,
      }),
      block(`arm${name}`, 'frame', [0.05, 0.03, 0.5], {
        at: [side * POST_X, 0.62, -0.01],
        round: 0.01,
        segments: 3,
        minLod: 1,
      }),
      block(`rail${name}`, 'frame', [0.03, 0.05, 0.4], {
        at: [side * POST_X, SEAT_Y - 0.05, 0],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
}

export const PATIO_CHAIR_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.patio-chair',
  title: 'Patio chair',
  footprint: { width: 0.58, depth: 0.58, height: 0.9 },
  meta: {
    names: {
      display: 'Patio chair',
      synonyms: ['garden chair', 'outdoor chair', 'terrace chair', 'deck chair', 'dining armchair'],
    },
    sizeClass: 'medium',
    aliases: ['cat.outdoor.garden-chair', 'cat.outdoor.outdoor-chair'],
  },
  materials: { frame: OUTDOOR_FRAME, cushion: fabric(CUSHION_COLOURS.teak) },
  slots: { frame: ['frame'], cloth: ['cushion'] },
  pitch: 14,
  parts: [
    ...posts(),
    piece(
      'seat',
      'frame',
      { type: 'slats', count: 5, spacing: 0.085, width: 0.46, height: 0.07, depth: 0.022 },
      { at: [0, SEAT_Y, 0.0], turn: [90, 0, 0] },
    ),
    piece(
      'back',
      'frame',
      { type: 'slats', count: 4, spacing: 0.1, width: 0.46, height: 0.075, depth: 0.022 },
      { at: [0, 0.68, REAR_Z], turn: [-6, 0, 0] },
    ),
    block('pad', 'cushion', [0.46, 0.06, 0.44], {
      at: [0, SEAT_Y + 0.041, 0.0],
      round: 0.022,
      segments: 3,
    }),
  ],
});
