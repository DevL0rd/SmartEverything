import type { ModelSpec } from '@smarteverything/domain';
import { blob, block, by, cyl, decorItem, woodFinishes, woodOf } from '../fc30/kit';

const THICK = 0.04;
const DEEP = 0.2;

export const FLOATING_SHELF_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.floating-shelf',
  title: 'Floating shelf',
  footprint: { width: 0.9, depth: DEEP, height: 0.2 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Floating shelf',
      synonyms: ['wall shelf', 'shelf', 'mounted shelf', 'display shelf', 'ledge shelf'],
    },
    sizeClass: 'medium',
  },
  params: { length: { min: 0.4, max: 1.6, default: 0.9, unit: 'm' } },
  materials: {
    wood: woodOf('oak'),
    ceramic: { finish: 'ceramic' },
    bracket: { finish: 'graphite' },
    accent: { color: '#6F8A5E', roughness: 0.8 },
  },
  finish: {
    finishes: {
      ...woodFinishes(['wood']),
      black: { wood: { finish: 'satin-black' }, ceramic: { finish: 'warm-white' } },
    },
    defaultFinish: 'oak',
  },
  mount: 'wall',
  parts: [
    block('board', 'wood', [by('length', 1), THICK, DEEP], {
      at: [0, THICK / 2, 0],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
    block('bracket', 'bracket', [by('length', 1, -0.12), 0.012, 0.004], {
      at: [0, 0.006, -DEEP / 2 + 0.002],
      round: 0.0015,
      segments: 3,
      minLod: 2,
    }),
    block('bookLow', 'ceramic', [0.2, 0.03, 0.15], {
      at: [by('length', -0.5, 0.15), THICK + 0.015, 0.01],
      turn: [0, 4, 0],
      round: 0.004,
      segments: 3,
    }),
    block('bookHigh', 'wood', [0.17, 0.025, 0.13], {
      at: [by('length', -0.5, 0.155), THICK + 0.0425, 0.01],
      turn: [0, -6, 0],
      round: 0.004,
      segments: 3,
    }),
    cyl(
      'pot',
      'ceramic',
      { height: 0.09, top: 0.05, bottom: 0.038, bevel: 0.006, segments: 40 },
      { at: [by('length', 0.5, -0.12), THICK + 0.045, 0.01] },
    ),
    blob('leafA', 'accent', [0.03, 0.05, 0.016], {
      at: [by('length', 0.5, -0.135), THICK + 0.125, 0.01],
      turn: [0, 0, 18],
      segments: 20,
      minLod: 1,
    }),
    blob('leafB', 'accent', [0.03, 0.055, 0.016], {
      at: [by('length', 0.5, -0.105), THICK + 0.13, 0.01],
      turn: [0, 40, -16],
      segments: 20,
      minLod: 1,
    }),
    blob('leafC', 'accent', [0.026, 0.045, 0.016], {
      at: [by('length', 0.5, -0.12), THICK + 0.135, 0.015],
      turn: [0, -40, 4],
      segments: 20,
      minLod: 1,
    }),
  ],
});
