import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by } from '../../living/fc06/kit';
import { metalFinishes, officeItem } from '../fc19/kit';

const WIDTH = 0.42;
const DEPTH = 0.62;
const PLINTH = 0.03;
const PITCH = 0.3;
const DRAWERS = 4;

function drawer(index: number): ModelSpecPart[] {
  const y = PLINTH + PITCH * (index - 0.5);
  const visible = by('drawers', 1, -(index - 0.5));
  const name = String(index);
  return [
    block(`front${name}`, 'body', [WIDTH - 0.03, PITCH - 0.03, 0.022], {
      at: [0, y, DEPTH / 2 - 0.005],
      round: 0.008,
      segments: 3,
    }),
    block(`handle${name}`, 'accent', [0.16, 0.02, 0.022], {
      at: [0, y + 0.075, DEPTH / 2 + 0.015],
      round: 0.007,
      segments: 3,
    }),
    block(`label${name}`, 'accent', [0.1, 0.038, 0.004], {
      at: [0, y - 0.03, DEPTH / 2 + 0.008],
      round: 0.0015,
      segments: 3,
      minLod: 2,
    }),
  ].map((part) => ({ ...part, visible }));
}

export const FILING_CABINET_MODEL: ModelSpec = officeItem({
  id: 'cat.office.filing-cabinet',
  title: 'Filing cabinet',
  footprint: { width: WIDTH, depth: DEPTH, height: PLINTH + PITCH * 3 + 0.03 },
  meta: {
    names: {
      display: 'Filing cabinet',
      synonyms: [
        'file cabinet',
        'drawer cabinet',
        'office drawers',
        'document cabinet',
        'steel cabinet',
        'pedestal drawers',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.file-cabinet'],
  },
  params: { drawers: { min: 2, max: DRAWERS, default: 3, unit: 'count' } },
  materials: {
    body: { finish: 'graphite' },
    accent: { finish: 'chrome' },
  },
  finishes: metalFinishes(['body']),
  defaultFinish: 'graphite',
  pitch: 18,
  wall: true,
  parts: [
    block('plinth', 'body', [WIDTH - 0.04, PLINTH, DEPTH - 0.04], {
      at: [0, PLINTH / 2, 0],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('carcass', 'body', [WIDTH, by('drawers', PITCH, 0.03), DEPTH - 0.02], {
      at: [0, by('drawers', PITCH / 2, PLINTH + 0.015), -0.01],
      round: 0.012,
      segments: 3,
    }),
    ...Array.from({ length: DRAWERS }, (_, index) => drawer(index + 1)).flat(),
  ],
});
