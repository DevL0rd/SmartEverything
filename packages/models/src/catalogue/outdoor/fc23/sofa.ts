import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  CUSHION_COLOURS,
  OUTDOOR_FRAME,
  block,
  by,
  corners,
  fabric,
  legs,
  outdoorItem,
} from './kit';

const DEPTH = 0.85;
const SEAT_Y = 0.36;
const ARM_W = 0.12;
const LEG_CORNERS = corners(by('length', 0.5, -0.1), 0.34, by('length', -0.5, 0.1), -0.34);

function cushions(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('length', side * 0.25, -side * (ARM_W / 4));
    const width = by('length', 0.5, -ARM_W - 0.02);
    return [
      block(`seat${name}`, 'cushion', [width, 0.15, 0.62], {
        at: [x, SEAT_Y + 0.115, 0.08],
        round: 0.04,
        segments: 3,
      }),
      block(`back${name}`, 'cushion', [width, 0.4, 0.17], {
        at: [x, SEAT_Y + 0.37, -0.26],
        turn: [-10, 0, 0],
        round: 0.05,
        segments: 3,
      }),
    ];
  });
}

function frame(): ModelSpecPart[] {
  return [
    block('base', 'frame', [by('length', 1), 0.18, DEPTH], {
      at: [0, SEAT_Y - 0.02, 0],
      round: 0.02,
      segments: 3,
    }),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'armLeft' : 'armRight', 'frame', [ARM_W, 0.28, DEPTH], {
        at: [by('length', side * 0.5, -side * (ARM_W / 2)), SEAT_Y + 0.21, 0],
        round: 0.03,
        segments: 3,
      }),
    ),
    block('rail', 'frame', [by('length', 1, -2 * ARM_W), 0.34, 0.05], {
      at: [0, SEAT_Y + 0.25, -DEPTH / 2 + 0.035],
      round: 0.015,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const OUTDOOR_SOFA_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.outdoor-sofa',
  title: 'Outdoor sofa',
  footprint: { width: 2, depth: DEPTH, height: 0.8 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Outdoor sofa',
      synonyms: ['patio sofa', 'garden sofa', 'terrace sofa', 'lounge sofa', 'outdoor couch'],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.patio-sofa', 'cat.outdoor.garden-sofa'],
  },
  params: { length: { min: 1.6, max: 2.6, default: 2, unit: 'm' } },
  materials: { frame: OUTDOOR_FRAME, cushion: fabric(CUSHION_COLOURS.teak) },
  slots: { frame: ['frame'], cloth: ['cushion'] },
  parts: [
    ...frame(),
    ...cushions(),
    ...legs('frame', LEG_CORNERS, { height: 0.17, top: 0.03, bottom: 0.024 }),
  ],
});
