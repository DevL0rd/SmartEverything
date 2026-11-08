import {
  block,
  by,
  corners,
  ferrules,
  furniture,
  legs,
  piece,
  upholsteryFinishes,
  upholsteryOf,
  woodOf,
} from './kit';

const WIDTH = 0.72;
const LEG_H = 0.1;
const BASE_H = 0.16;
const SEAT_Y = LEG_H + BASE_H;
const FEET = corners(
  by('length', 0.5, -0.07),
  WIDTH / 2 - 0.07,
  by('length', -0.5, 0.07),
  -WIDTH / 2 + 0.07,
);

export const CHAISE_MODEL = furniture({
  id: 'cat.living.chaise',
  title: 'Chaise longue',
  footprint: { width: 1.6634, depth: WIDTH, height: 0.86 },
  size: { width: { param: 'length', extra: 0.0134, resizes: true } },
  meta: {
    names: {
      display: 'Chaise longue',
      synonyms: ['chaise', 'daybed', 'lounger', 'fainting couch'],
    },
    sizeClass: 'large',
    aliases: ['cat.living.chaise-longue', 'cat.living.daybed'],
  },
  params: { length: { min: 1.4, max: 1.9, default: 1.65, unit: 'm' } },
  materials: {
    body: upholsteryOf('oat'),
    frame: woodOf('oak'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'oat',
  parts: [
    block('base', 'body', [by('length', 1), BASE_H, WIDTH], {
      at: [0, LEG_H + BASE_H / 2, 0],
      round: 0.04,
      segments: 3,
    }),
    block('seat', 'body', [by('length', 1, -0.28), 0.13, WIDTH - 0.04], {
      at: [0.12, SEAT_Y + 0.065, 0],
      round: 0.05,
    }),
    block('back', 'body', [0.2, 0.6, WIDTH], {
      at: [by('length', -0.5, 0.2), SEAT_Y + 0.28, 0],
      turn: [0, 0, 24],
      round: 0.08,
    }),
    block('armRest', 'body', [by('length', 0.45), 0.2, 0.12], {
      at: [by('length', -0.22), SEAT_Y + 0.16, -WIDTH / 2 + 0.06],
      round: 0.055,
    }),
    piece(
      'bolster',
      'body',
      { type: 'capsule', radius: 0.08, length: WIDTH - 0.24, segments: 32 },
      { at: [by('length', -0.5, 0.33), SEAT_Y + 0.22, 0], turn: [90, 0, 0], minLod: 1 },
    ),
    block('piping', 'body', [by('length', 1, -0.02), 0.014, 0.014], {
      at: [0, SEAT_Y - 0.006, WIDTH / 2 - 0.004],
      round: 0.005,
      segments: 3,
      minLod: 2,
    }),
    ...legs('frame', FEET, { height: LEG_H, top: 0.02, bottom: 0.014 }),
    ...ferrules(FEET, 0.0145),
  ],
});
