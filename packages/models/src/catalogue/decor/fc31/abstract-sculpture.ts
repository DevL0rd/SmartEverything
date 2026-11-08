import type { ModelSpec } from '@smarteverything/domain';
import {
  BRASS,
  SIZE_PARAM,
  ball,
  blob,
  block,
  decorItem,
  finishesOf,
  hoop,
  sized,
} from '../fc30/kit';

const PLINTH = 0.05;

export const ABSTRACT_SCULPTURE_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.abstract-sculpture',
  title: 'Abstract sculpture',
  footprint: { width: 0.22, depth: 0.18, height: 0.4 },
  meta: {
    names: {
      display: 'Abstract sculpture',
      synonyms: ['sculpture', 'modern sculpture', 'art object', 'statue', 'decor sculpture'],
    },
    sizeClass: 'small',
  },
  params: { size: SIZE_PARAM },
  materials: {
    base: { finish: 'marble' },
    form: { finish: 'satin-black' },
    accent: BRASS,
  },
  finish: finishesOf(
    {
      'marble-black': {},
      'terrazzo-ivory': { base: { finish: 'terrazzo' }, form: { finish: 'matte-white' } },
      'oak-terracotta': { base: { finish: 'oak' }, form: { finish: 'terracotta' } },
      'concrete-graphite': {
        base: { color: '#9A9A96', roughness: 0.85 },
        form: { finish: 'graphite' },
      },
    },
    'marble-black',
  ),
  mount: 'desk',
  parts: sized('size', [
    block('plinth', 'base', [0.2, PLINTH, 0.16], {
      at: [0, PLINTH / 2, 0],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    blob('ovoid', 'form', [0.062, 0.15, 0.062], {
      at: [-0.03, PLINTH + 0.14, 0],
      turn: [0, 0, -8],
      segments: 48,
    }),
    hoop(
      'ring',
      'accent',
      { radius: 0.088, tube: 0.012, segments: 64 },
      { at: [0.03, PLINTH + 0.15, 0], turn: [0, 40, 0] },
    ),
    ball('orb', 'form', 0.026, { at: [0.07, PLINTH + 0.026, 0.045], segments: 32 }),
  ]),
});
