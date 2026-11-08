import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, furniture, piece, woodOf } from '../fc06/kit';

const WIDTH = 1.5;
const DEPTH = 0.6;
const HEIGHT = 1.26;
const BACK = 0.36;
const BACK_Z = -DEPTH / 2 + BACK / 2;
const KEYS_W = 1.23;
const WHITE = KEYS_W / 52;
const KEY_Y = 0.76;

const BLACK = { finish: 'satin-black', roughness: 0.2, clearcoat: 0.9 } as const;

const FINISHES: NonNullable<ModelSpec['finishes']> = {
  black: { body: BLACK },
  walnut: { body: woodOf('walnut', { clearcoat: 0.6 }) },
  'white-lacquer': { body: woodOf('white-lacquer') },
};

function sharpGroup(id: string, firstWhite: number, count: number): ModelSpecPart {
  const centre = -KEYS_W / 2 + (firstWhite + 1 + (count - 1) / 2) * WHITE;
  return piece(
    id,
    'trim',
    { type: 'slats', count, spacing: WHITE, width: 0.018, height: WHITE * 0.55, depth: 0.09 },
    { at: [centre, KEY_Y + 0.02, 0.2], turn: [0, 0, 90], minLod: 2 },
  );
}

function blackKeys(): ModelSpecPart[] {
  return [
    sharpGroup('sharps0', 0, 1),
    ...Array.from({ length: 7 }, (_, octave) => [
      sharpGroup(`sharpsLow${String(octave + 1)}`, 2 + 7 * octave, 2),
      sharpGroup(`sharpsHigh${String(octave + 1)}`, 5 + 7 * octave, 3),
    ]).flat(),
  ];
}

function caseParts(): ModelSpecPart[] {
  return [
    block('case', 'body', [WIDTH, HEIGHT - 0.03, BACK], {
      at: [0, (HEIGHT - 0.03) / 2, BACK_Z],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    block('lid', 'body', [WIDTH + 0.02, 0.03, BACK + 0.04], {
      at: [0, HEIGHT - 0.015, BACK_Z + 0.01],
      round: 0.012,
      segments: 3,
    }),
    block('upperPanel', 'body', [WIDTH - 0.14, 0.4, 0.035], {
      at: [0, 1.03, BACK_Z + BACK / 2 + 0.0175],
      round: 0.012,
      segments: 3,
    }),
    block('kneePanel', 'body', [WIDTH - 0.14, 0.56, 0.03], {
      at: [0, 0.34, BACK_Z + BACK / 2 + 0.015],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
    block('keyShelf', 'body', [WIDTH, 0.07, 0.3], {
      at: [0, KEY_Y - 0.045, 0.14],
      round: 0.012,
      segments: 3,
    }),
    block('keyCover', 'body', [KEYS_W + 0.02, 0.1, 0.025], {
      at: [0, KEY_Y + 0.1, 0.07],
      turn: [-12, 0, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('musicDesk', 'body', [0.9, 0.03, 0.06], {
      at: [0, 0.9, 0.09],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
  ];
}

function standParts(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = (side * (WIDTH - 0.13)) / 2;
    return [
      block(`cheek${name}`, 'body', [0.13, 0.15, 0.3], {
        at: [x, KEY_Y + 0.04, 0.14],
        round: 0.02,
        segments: 3,
      }),
      block(`leg${name}`, 'body', [0.06, KEY_Y - 0.12, 0.06], {
        at: [side * 0.69, (KEY_Y - 0.12) / 2 + 0.05, 0.25],
        round: 0.015,
        segments: 3,
      }),
      block(`toe${name}`, 'body', [0.07, 0.05, 0.3], {
        at: [side * 0.69, 0.025, 0.14],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
    ];
  });
}

function keyParts(): ModelSpecPart[] {
  return [
    block('keys', 'keys', [KEYS_W, 0.024, 0.15], {
      at: [0, KEY_Y, 0.215],
      round: 0.004,
      segments: 3,
    }),
    block('keySlip', 'body', [KEYS_W + 0.02, 0.03, 0.02], {
      at: [0, KEY_Y - 0.01, 0.295],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...[-0.07, 0, 0.07].map((x, index) =>
      block(`pedal${String(index + 1)}`, 'accent', [0.03, 0.014, 0.09], {
        at: [x, 0.06, BACK_Z + BACK / 2 + 0.06],
        round: 0.005,
        segments: 3,
        minLod: 1,
      }),
    ),
    ...blackKeys(),
  ];
}

export const UPRIGHT_PIANO_MODEL = furniture({
  id: 'cat.living.upright-piano',
  title: 'Upright piano',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  meta: {
    names: { display: 'Upright piano', synonyms: ['piano', 'vertical piano', 'console piano'] },
    sizeClass: 'large',
    aliases: ['cat.living.piano'],
  },
  materials: {
    body: BLACK,
    keys: { finish: 'warm-white' },
    trim: { finish: 'satin-black' },
    accent: { finish: 'chrome' },
  },
  finishes: FINISHES,
  defaultFinish: 'black',
  pitch: 14,
  wall: true,
  parts: [...caseParts(), ...standParts(), ...keyParts()],
});
