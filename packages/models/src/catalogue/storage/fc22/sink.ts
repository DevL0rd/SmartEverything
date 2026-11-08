import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { STORAGE_ACCENT, block, by, piece, rod, storageItem, woodOf } from '../fc21/kit';

const DEPTH = 0.5;
const CABINET_H = 0.78;
const RIM_H = 0.05;
const TOP = CABINET_H + RIM_H;
const TAP_Z = -DEPTH / 2 + 0.05;
const NECK: readonly (readonly [number, number, number])[] = [
  [0, TOP, TAP_Z],
  [0, TOP + 0.2, TAP_Z],
  [0, TOP + 0.26, TAP_Z + 0.07],
  [0, TOP + 0.2, TAP_Z + 0.16],
];

function doors(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('width', side * 0.25, 0);
    return [
      block(`door${name}`, 'body', [by('width', 0.5, -0.02), CABINET_H - 0.1, 0.018], {
        at: [x, (CABINET_H + 0.06) / 2, DEPTH / 2 + 0.009],
        round: 0.006,
        segments: 3,
        minLod: 1,
      }),
      rod(
        `pull${name}`,
        'accent',
        { height: 0.1, top: 0.006, segments: 12 },
        {
          at: [by('width', side * 0.25, -side * 0.18), CABINET_H - 0.16, DEPTH / 2 + 0.03],
          minLod: 2,
        },
      ),
    ];
  });
}

export const UTILITY_SINK_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.utility-sink',
  title: 'Utility sink',
  footprint: { width: 0.8, depth: DEPTH, height: TOP + 0.26 + 0.012 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Utility sink',
      synonyms: ['laundry sink', 'utility basin', 'scullery sink', 'garage sink', 'wash tub'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.laundry-sink'],
  },
  params: { width: { min: 0.6, max: 1.2, default: 0.8, unit: 'm' } },
  materials: {
    body: woodOf('oak'),
    steel: { finish: 'brushed-aluminium' },
    basin: { finish: 'graphite' },
    accent: STORAGE_ACCENT,
  },
  slots: ['body'],
  pitch: 20,
  wall: true,
  parts: [
    block('cabinet', 'body', [by('width', 1, -0.02), CABINET_H, DEPTH - 0.02], {
      at: [0, CABINET_H / 2, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
    block('rim', 'steel', [by('width', 1), RIM_H, DEPTH], {
      at: [0, CABINET_H + RIM_H / 2, 0],
      round: 0.014,
      segments: 3,
    }),
    block('well', 'basin', [by('width', 1, -0.14), 0.01, DEPTH - 0.14], {
      at: [0, TOP + 0.001, 0.02],
      round: 0.03,
      segments: 3,
    }),
    block('splash', 'steel', [by('width', 1), 0.14, 0.02], {
      at: [0, TOP + 0.07, -DEPTH / 2 + 0.01],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'tapBase',
      'accent',
      { height: 0.04, top: 0.026, segments: 24 },
      { at: [0, TOP + 0.02, TAP_Z] },
    ),
    piece('tapNeck', 'accent', {
      type: 'tube',
      points: NECK.map((point) => [...point]),
      radius: 0.013,
      segments: 12,
    }),
    ...doors(),
  ],
});
