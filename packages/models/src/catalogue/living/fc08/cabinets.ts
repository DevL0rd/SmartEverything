import type { ModelSpecPart } from '@smarteverything/domain';
import { block, by, corners, furniture, legs, piece, woodFinishes, woodOf } from '../fc06/kit';

const BOARD = 0.022;
const SHELF_DEPTH = 0.3;
const PLINTH = 0.07;
const COMPARTMENTS = 5;
const PITCH = 1 / COMPARTMENTS;
const PITCH_OFFSET = -(PLINTH + BOARD) / COMPARTMENTS;
const BOOK_H = 0.2;

function caseParts(): ModelSpecPart[] {
  return [
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'sideLeft' : 'sideRight', 'body', [BOARD, by('height', 1), SHELF_DEPTH], {
        at: [by('width', side / 2, (-side * BOARD) / 2), by('height', 0.5), 0],
        round: 0.006,
        segments: 3,
        contact: true,
      }),
    ),
    block('top', 'body', [by('width', 1), BOARD, SHELF_DEPTH], {
      at: [0, by('height', 1, -BOARD / 2), 0],
      round: 0.006,
      segments: 3,
    }),
    block('plinth', 'body', [by('width', 1, -2 * BOARD), PLINTH, SHELF_DEPTH - 0.02], {
      at: [0, PLINTH / 2, -0.01],
      round: 0.006,
      segments: 3,
    }),
    block('back', 'body', [by('width', 1, -2 * BOARD), by('height', 1, -PLINTH - BOARD), 0.008], {
      at: [0, by('height', 0.5, (PLINTH - BOARD) / 2), -SHELF_DEPTH / 2 + 0.006],
      round: 0.003,
      segments: 3,
    }),
    piece(
      'shelves',
      'body',
      {
        type: 'slats',
        count: COMPARTMENTS - 1,
        spacing: by('height', PITCH, PITCH_OFFSET),
        width: by('width', 1, -2 * BOARD),
        height: BOARD,
        depth: SHELF_DEPTH - 0.02,
      },
      { at: [0, by('height', 0.5, (PLINTH - BOARD) / 2), 0.005] },
    ),
  ];
}

function bookRow(compartment: number, shift: number, material: string): ModelSpecPart {
  const floor = PLINTH + compartment * PITCH_OFFSET + (compartment > 0 ? BOARD / 2 : 0);
  return piece(
    `books${String(compartment + 1)}`,
    material,
    { type: 'slats', count: 8, spacing: 0.03, width: BOOK_H, height: 0.024, depth: 0.2 },
    {
      at: [by('width', shift), by('height', compartment * PITCH, floor + BOOK_H / 2), 0.02],
      turn: [0, 0, 90],
      minLod: 1,
    },
  );
}

export const BOOKSHELF_MODEL = furniture({
  id: 'cat.living.bookshelf',
  title: 'Bookshelf',
  footprint: { width: 0.8, depth: SHELF_DEPTH, height: 1.8 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: { display: 'Bookshelf', synonyms: ['bookcase', 'shelving', 'shelves', 'book shelf'] },
    sizeClass: 'large',
    aliases: ['cat.living.bookcase'],
  },
  params: {
    width: { min: 0.6, max: 1.2, default: 0.8, unit: 'm' },
    height: { min: 1.2, max: 2.2, default: 1.8, unit: 'm' },
  },
  materials: {
    body: woodOf('oak'),
    trim: { finish: 'terracotta' },
    accent: { finish: 'graphite' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  pitch: 12,
  wall: true,
  parts: [
    ...caseParts(),
    bookRow(0, -0.16, 'trim'),
    bookRow(2, 0.14, 'accent'),
    bookRow(4, -0.1, 'trim'),
    block('stack', 'accent', [0.18, 0.06, 0.2], {
      at: [
        by('width', 0.2),
        by('height', 3 * PITCH, PLINTH + 3 * PITCH_OFFSET + BOARD / 2 + 0.03),
        0.02,
      ],
      round: 0.006,
      segments: 3,
      minLod: 2,
    }),
  ],
});

const CABINET_DEPTH = 0.4;
const CABINET_LEG = 0.12;
const CABINET_FEET = corners(
  by('width', 0.5, -0.05),
  CABINET_DEPTH / 2 - 0.05,
  by('width', -0.5, 0.05),
  -CABINET_DEPTH / 2 + 0.05,
);
const BODY_Y = by('height', 0.5, CABINET_LEG / 2);
const BODY_H = by('height', 1, -CABINET_LEG);

function cabinetShell(): ModelSpecPart[] {
  return [
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'sideLeft' : 'sideRight', 'body', [0.03, BODY_H, CABINET_DEPTH], {
        at: [by('width', side / 2, -side * 0.015), BODY_Y, 0],
        round: 0.008,
        segments: 3,
      }),
    ),
    block('top', 'body', [by('width', 1, 0.02), 0.035, CABINET_DEPTH + 0.02], {
      at: [0, by('height', 1, -0.0175), 0],
      round: 0.01,
      segments: 3,
    }),
    block('bottom', 'body', [by('width', 1), 0.06, CABINET_DEPTH], {
      at: [0, CABINET_LEG + 0.03, 0],
      round: 0.008,
      segments: 3,
    }),
    block('back', 'body', [by('width', 1, -0.06), BODY_H, 0.01], {
      at: [0, BODY_Y, -CABINET_DEPTH / 2 + 0.008],
      round: 0.003,
      segments: 3,
    }),
    piece(
      'shelves',
      'body',
      {
        type: 'slats',
        count: 3,
        spacing: by('height', 0.25, -0.06),
        width: by('width', 1, -0.06),
        height: 0.018,
        depth: CABINET_DEPTH - 0.04,
      },
      { at: [0, by('height', 0.5, 0.075), -0.01] },
    ),
    block('mullion', 'body', [0.03, by('height', 1, -CABINET_LEG - 0.08), 0.022], {
      at: [0, by('height', 0.5, 0.08), CABINET_DEPTH / 2 - 0.008],
      round: 0.006,
      segments: 3,
    }),
    ...legs('trim', CABINET_FEET, { height: CABINET_LEG, top: 0.016, bottom: 0.011 }),
  ];
}

function cabinetFront(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    return [
      block(`glass${name}`, 'glass', [by('width', 0.5, -0.04), by('height', 1, -0.22), 0.006], {
        at: [
          by('width', side / 4, -side * 0.005),
          by('height', 0.5, 0.08),
          CABINET_DEPTH / 2 - 0.004,
        ],
        round: 0.002,
        segments: 3,
      }),
      block(`handle${name}`, 'trim', [0.01, 0.12, 0.014], {
        at: [side * 0.04, by('height', 0.5, 0.1), CABINET_DEPTH / 2 + 0.008],
        round: 0.004,
        segments: 3,
        minLod: 2,
      }),
    ];
  });
}

function cabinetObjects(): ModelSpecPart[] {
  return [
    [-0.22, 0, 0.18, 0.13],
    [0.2, 0.25, 0.144, 0.11],
    [-0.12, 0.5, 0.084, 0.09],
  ].map(([x = 0, level = 0, floor = 0, tall = 0], index) =>
    piece(
      `vase${String(index + 1)}`,
      'accent',
      {
        type: 'lathe',
        profile: [
          [0, 0],
          [0.04, 0],
          [0.05, tall * 0.4],
          [0.025, tall * 0.85],
          [0.03, tall],
          [0, tall],
        ],
        segments: 32,
      },
      { at: [by('width', x), by('height', level, floor), 0], minLod: 2 },
    ),
  );
}

export const DISPLAY_CABINET_MODEL = furniture({
  id: 'cat.living.display-cabinet',
  title: 'Display cabinet',
  footprint: { width: 0.92, depth: CABINET_DEPTH, height: 1.8 },
  size: {
    width: { param: 'width', extra: 0.02, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Display cabinet',
      synonyms: ['vitrine', 'glass cabinet', 'curio cabinet', 'china cabinet', 'cabinet'],
    },
    sizeClass: 'large',
    aliases: ['cat.living.vitrine', 'cat.living.glass-cabinet'],
  },
  params: {
    width: { min: 0.6, max: 1.2, default: 0.9, unit: 'm' },
    height: { min: 1.4, max: 2.1, default: 1.8, unit: 'm' },
  },
  materials: {
    body: woodOf('walnut'),
    glass: { finish: 'clear-glass' },
    trim: { finish: 'brushed-aluminium' },
    accent: { finish: 'ceramic' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'walnut',
  pitch: 12,
  wall: true,
  parts: [...cabinetShell(), ...cabinetFront(), ...cabinetObjects()],
});
