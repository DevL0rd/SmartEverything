import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { extrudePath, pathBuilder } from '../../../helpers/path';
import { block, by, fabric, piece, rod, storageItem, woodOf } from '../fc21/kit';

const LEG_TILT = 12;
const LEG_COS = Math.cos((LEG_TILT * Math.PI) / 180);
const LEG_X = -0.1;
const LEG_Z = 0.1;
const TOP_T = 0.03;

function outline(): ReturnType<typeof pathBuilder> {
  return pathBuilder(-0.62, -0.18)
    .line(0, -0.18)
    .cubic([0.28, -0.18], [0.4, -0.05], 0.6, -0.05)
    .quadratic(0.67, 0, 0.6, 0.05)
    .cubic([0.4, 0.05], [0.28, 0.18], 0, 0.18)
    .line(-0.62, 0.18)
    .quadratic(-0.7, 0, -0.62, -0.18);
}

function legs(): ModelSpecPart[] {
  return [-1, 1].flatMap((sz) =>
    [-1, 1].map((tilt) =>
      rod(
        `leg${sz < 0 ? 'Near' : 'Far'}${tilt < 0 ? 'A' : 'B'}`,
        'frame',
        { height: by('height', 1 / LEG_COS, -0.05 / LEG_COS), top: 0.011, segments: 16 },
        {
          at: [LEG_X, by('height', 0.5, -0.025), sz * LEG_Z],
          turn: [0, 0, tilt * LEG_TILT],
          contact: true,
        },
      ),
    ),
  );
}

function feet(): ModelSpecPart[] {
  return [-1, 1].map((sz) =>
    block(sz < 0 ? 'footNear' : 'footFar', 'trim', [0.34, 0.02, 0.04], {
      at: [LEG_X, 0.01, sz * LEG_Z],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
  );
}

export const IRONING_BOARD_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.ironing-board',
  title: 'Ironing board',
  footprint: { width: 1.4, depth: 0.36, height: 0.8663 },
  size: { height: { param: 'height', extra: 0.0163, resizes: true } },
  meta: {
    names: {
      display: 'Ironing board',
      synonyms: ['iron board', 'folding board', 'pressing board', 'laundry board'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.iron-board'],
  },
  params: { height: { min: 0.7, max: 0.95, default: 0.85, unit: 'm' } },
  materials: {
    cover: fabric('#DAD6CC'),
    frame: woodOf('oak'),
    trim: { finish: 'rubber' },
  },
  slots: ['frame'],
  pitch: 24,
  parts: [
    piece('board', 'cover', extrudePath(outline(), TOP_T, 0.004), {
      at: [0, by('height', 1, -0.019), 0],
      turn: [90, 0, 0],
    }),
    block('rest', 'trim', [0.15, 0.014, 0.09], {
      at: [0.5, by('height', 1, 0.007), 0],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...legs(),
    rod(
      'bar',
      'frame',
      { height: 2 * LEG_Z, top: 0.01, segments: 16 },
      { at: [LEG_X, by('height', 0.5, -0.025), 0], turn: [90, 0, 0], minLod: 1 },
    ),
    ...feet(),
  ],
});
