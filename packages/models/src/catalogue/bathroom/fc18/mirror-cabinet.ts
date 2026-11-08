import type { ModelSpec } from '@smarteverything/domain';
import { block, by } from '../../living/fc06/kit';
import { bathroomItem } from '../fc17/kit';

const DEPTH = 0.14;

export const MIRROR_CABINET_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.mirror-cabinet',
  title: 'Mirror cabinet',
  footprint: { width: 0.6, depth: DEPTH, height: 0.7 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Mirror cabinet',
      synonyms: [
        'bathroom mirror cabinet',
        'medicine cabinet',
        'wall mirror cabinet',
        'mirrored wall cabinet',
        'vanity mirror',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.bathroom.medicine-cabinet'],
  },
  params: {
    width: { min: 0.4, max: 1, default: 0.6, unit: 'm' },
    height: { min: 0.5, max: 0.9, default: 0.7, unit: 'm' },
  },
  materials: {
    cabinet: { finish: 'warm-white' },
    mirror: { finish: 'chrome', roughness: 0.04 },
    accent: { finish: 'chrome' },
  },
  roles: { cabinet: 'cabinet', accent: 'fixture' },
  pitch: 12,
  wall: true,
  parts: [
    block('body', 'cabinet', [by('width', 1), by('height', 1), DEPTH], {
      at: [0, by('height', 0.5), 0],
      round: 0.014,
      segments: 3,
      contact: true,
    }),
    block('mirror', 'mirror', [by('width', 1, -0.05), by('height', 1, -0.05), 0.01], {
      at: [0, by('height', 0.5), DEPTH / 2 + 0.002],
      round: 0.004,
      segments: 3,
    }),
    block('pull', 'accent', [0.012, by('height', 0.45), 0.016], {
      at: [by('width', 0.5, -0.04), by('height', 0.5), DEPTH / 2 + 0.014],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
    ...([0.2, 0.8] as const).map((fraction, index) =>
      block(`hinge${String(index + 1)}`, 'accent', [0.012, 0.05, 0.018], {
        at: [by('width', -0.5, 0.012), by('height', fraction), DEPTH / 2 + 0.003],
        round: 0.004,
        segments: 3,
        minLod: 2,
      }),
    ),
  ],
});
