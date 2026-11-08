import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueItem, rod } from '../../kids-pets/fc35/kit';

const TOP_Y = 0.75;
const TOP_T = 0.035;
const DEPTH = 0.55;

function legs(): ModelSpecPart[] {
  return ([-1, 1] as const).flatMap((sx) =>
    ([-1, 1] as const).map((sz) =>
      rod(
        `leg${sx < 0 ? 'West' : 'East'}${sz < 0 ? 'Back' : 'Front'}`,
        'wood',
        { height: TOP_Y - TOP_T / 2, top: 0.03, bottom: 0.017, segments: 20 },
        {
          at: [by('width', sx * 0.5, -sx * 0.07), (TOP_Y - TOP_T / 2) / 2, sz * 0.2],
          contact: true,
        },
      ),
    ),
  );
}

function machine(x: number): ModelSpecPart[] {
  const base = TOP_Y + TOP_T / 2;
  const at = (dx: number, y: number): [number, number, number] => [x + dx, base + y, 0];
  return [
    block('bed', 'machine', [0.42, 0.05, 0.19], { at: at(0, 0.025), round: 0.02, segments: 3 }),
    block('pillar', 'machine', [0.075, 0.24, 0.15], {
      at: at(0.15, 0.17),
      round: 0.025,
      segments: 3,
    }),
    block('arm', 'machine', [0.36, 0.075, 0.15], { at: at(-0.01, 0.24), round: 0.03, segments: 3 }),
    block('head', 'machine', [0.08, 0.13, 0.13], { at: at(-0.15, 0.2), round: 0.025, segments: 3 }),
    rod(
      'handwheel',
      'accent',
      { height: 0.03, top: 0.048, bevel: 0.008, segments: 28 },
      { at: at(0.205, 0.19), turn: [0, 0, 90] },
    ),
    rod(
      'needle',
      'accent',
      { height: 0.1, top: 0.004, bevel: 0, segments: 8 },
      { at: at(-0.15, 0.1), minLod: 1 },
    ),
    block('plate', 'accent', [0.12, 0.004, 0.1], {
      at: at(-0.08, 0.052),
      round: 0.002,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'spoolPin',
      'accent',
      { height: 0.07, top: 0.004, bevel: 0, segments: 8 },
      { at: at(0.02, 0.3), minLod: 1 },
    ),
  ];
}

export const SEWING_TABLE_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.sewing-table',
  title: 'Sewing table',
  category: 'fitness-hobby',
  footprint: { width: 1.1, depth: DEPTH, height: TOP_Y + TOP_T / 2 + 0.31 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Sewing table',
      synonyms: [
        'sewing machine table',
        'craft table',
        'tailor table',
        'hobby desk',
        'sewing desk',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.fitness-hobby.craft-table'],
  },
  params: { width: { min: 0.9, max: 1.4, default: 1.1, unit: 'm' } },
  materials: {
    wood: tokenMaterial('oak'),
    machine: tokenMaterial('warm-white'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      oak: {},
      walnut: { wood: { finish: 'walnut' } },
      ash: { wood: { finish: 'ash' } },
      white: { wood: { color: '#F1EFEA', roughness: 0.3, clearcoat: 0.7 } },
    },
    'oak',
  ),
  parts: [
    block('top', 'wood', [by('width'), TOP_T, DEPTH], {
      at: [0, TOP_Y, 0],
      round: 0.012,
      segments: 3,
    }),
    block('apron', 'wood', [by('width', 1, -0.14), 0.1, DEPTH - 0.08], {
      at: [0, TOP_Y - TOP_T / 2 - 0.05, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('drawer', 'wood', [by('width', 0.5, -0.12), 0.07, 0.014], {
      at: [by('width', 0.2, 0), TOP_Y - TOP_T / 2 - 0.05, DEPTH / 2 - 0.036],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'knob',
      'accent',
      { height: 0.02, top: 0.012, bevel: 0.004, segments: 16 },
      {
        at: [by('width', 0.2, 0), TOP_Y - TOP_T / 2 - 0.05, DEPTH / 2 - 0.02],
        turn: [90, 0, 0],
        minLod: 1,
      },
    ),
    ...legs(),
    ...machine(-0.15),
  ],
});
