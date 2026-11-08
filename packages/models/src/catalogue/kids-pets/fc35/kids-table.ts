import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueItem, paintedFinishes, rod } from './kit';

const TOP_T = 0.03;

function legs(): ModelSpecPart[] {
  return ([-1, 1] as const).flatMap((sx) =>
    ([-1, 1] as const).map((sz) => {
      const name = `${sx < 0 ? 'West' : 'East'}${sz < 0 ? 'Back' : 'Front'}`;
      return rod(
        `leg${name}`,
        'trim',
        { height: by('height', 1, -TOP_T), top: 0.024, bottom: 0.017, segments: 20 },
        {
          at: [
            by('size', sx * 0.5, -sx * 0.06),
            by('height', 0.5, -TOP_T / 2),
            by('size', sz * 0.5, -sz * 0.06),
          ],
          contact: true,
        },
      );
    }),
  );
}

function feet(): ModelSpecPart[] {
  return ([-1, 1] as const).flatMap((sx) =>
    ([-1, 1] as const).map((sz) =>
      rod(
        `cap${sx < 0 ? 'West' : 'East'}${sz < 0 ? 'Back' : 'Front'}`,
        'accent',
        { height: 0.012, top: 0.018, bevel: 0.004, segments: 16 },
        {
          at: [by('size', sx * 0.5, -sx * 0.06), 0.006, by('size', sz * 0.5, -sz * 0.06)],
          minLod: 2,
        },
      ),
    ),
  );
}

export const KIDS_TABLE_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.kids-table',
  title: 'Kids table',
  category: 'kids-pets',
  footprint: { width: 0.6, depth: 0.6, height: 0.484 },
  size: {
    width: { param: 'size', extra: 0, resizes: true },
    depth: { param: 'size', extra: 0, resizes: true },
    height: { param: 'height', extra: 0.004, resizes: true },
  },
  meta: {
    names: {
      display: 'Kids table',
      synonyms: ['children table', 'play table', 'activity table', 'toddler table', 'craft table'],
    },
    sizeClass: 'small',
    aliases: ['cat.kids-pets.play-table'],
  },
  params: {
    size: { min: 0.5, max: 0.9, default: 0.6, unit: 'm' },
    height: { min: 0.4, max: 0.55, default: 0.48, unit: 'm' },
  },
  materials: {
    body: tokenMaterial('oak'),
    trim: tokenMaterial('ash'),
    accent: tokenMaterial('rubber'),
  },
  finish: finishSet(paintedFinishes(['body'], { trim: { finish: 'oak' } }), 'oak'),
  parts: [
    block('top', 'body', [by('size'), TOP_T, by('size')], {
      at: [0, by('height', 1, -TOP_T / 2), 0],
      round: 0.03,
      segments: 4,
    }),
    block('inlay', 'trim', [by('size', 1, -0.14), 0.006, by('size', 1, -0.14)], {
      at: [0, by('height', 1, 0.001), 0],
      round: 0.015,
      segments: 3,
      minLod: 1,
    }),
    block('apron', 'body', [by('size', 1, -0.12), 0.06, by('size', 1, -0.12)], {
      at: [0, by('height', 1, -TOP_T - 0.03), 0],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
    ...legs(),
    ...feet(),
  ],
});
