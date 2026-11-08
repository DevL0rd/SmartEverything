import type { ModelSpec } from '@smarteverything/domain';
import { block, by, fabric, upholsteryOf, type Upholstery } from '../../living/fc06/kit';
import { bedroomItem } from '../fc14/kit';

type Finishes = NonNullable<ModelSpec['finishes']>;

const PAIRS: Readonly<Record<string, readonly [Upholstery, Upholstery]>> = {
  oat: ['oat', 'slate'],
  slate: ['slate', 'oat'],
  forest: ['forest', 'oat'],
  rust: ['rust', 'oat'],
  ink: ['ink', 'slate'],
};

function bedding(): Finishes {
  return Object.fromEntries(
    Object.entries(PAIRS).map(([name, [duvet, cover]]) => [
      name,
      { duvet: upholsteryOf(duvet), throw: upholsteryOf(cover) },
    ]),
  );
}

const SHEET = fabric('#EEE9DF');

export const BEDDING_SET_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.bedding-set',
  title: 'Bedding set',
  footprint: { width: 1.7, depth: 1.75, height: 0.3 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Bedding set',
      synonyms: ['duvet and pillows', 'duvet', 'bedding', 'bed linen', 'comforter set'],
    },
    sizeClass: 'medium',
    aliases: ['cat.bedroom.duvet', 'cat.bedroom.bed-linen'],
  },
  params: { width: { min: 1.3, max: 2.2, default: 1.7, unit: 'm' } },
  materials: {
    duvet: upholsteryOf('slate'),
    linen: SHEET,
    throw: upholsteryOf('oat'),
  },
  finishes: bedding(),
  defaultFinish: 'slate',
  pitch: 35,
  parts: [
    block('duvet', 'duvet', [by('width', 1), 0.11, 1.3], {
      at: [0, 0.055, 0.23],
      round: 0.05,
      contact: true,
    }),
    block('fold', 'linen', [by('width', 1, -0.03), 0.125, 0.3], {
      at: [0, 0.062, -0.3],
      round: 0.05,
      minLod: 1,
    }),
    ...[-1, 1].map((side) =>
      block(`pillow${side < 0 ? 'Left' : 'Right'}`, 'linen', [by('width', 0.3, 0.1), 0.15, 0.4], {
        at: [by('width', side * 0.25), 0.075, -0.72],
        turn: [-6, 0, 0],
        round: 0.06,
      }),
    ),
    block('lumbar', 'throw', [0.46, 0.2, 0.1], {
      at: [0, 0.2, -0.5],
      turn: [-28, 0, 0],
      round: 0.045,
      minLod: 1,
    }),
    block('throw', 'throw', [by('width', 1, -0.4), 0.035, 0.4], {
      at: [0, 0.126, 0.7],
      round: 0.015,
      segments: 3,
      minLod: 1,
    }),
  ],
});
