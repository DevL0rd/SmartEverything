import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  fabric,
  piece,
  upholsteryOf,
  woodFinishes,
  woodOf,
  type BlockOptions,
  type Vec,
} from '../../living/fc06/kit';
import { bedroomItem } from './kit';

const LENGTH = 2.05;
const HEIGHT = 1.75;
const POST = 0.07;
const RAIL_H = 0.18;
const RAIL_T = 0.035;
const INNER = POST + RAIL_T / 2;
const LEVELS = [
  { name: 'Low', y: 0.3 },
  { name: 'High', y: 1.15 },
] as const;
const LONG = LENGTH - 2 * POST;
const GUARD_Y = 1.34;

function plain(id: string, material: string, size: Vec, place: BlockOptions): ModelSpecPart {
  return block(id, material, size, { round: 0.008, segments: 3, ...place });
}

function postParts(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) =>
      block(`post${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`, 'frame', [POST, HEIGHT, POST], {
        at: [by('width', sx / 2, -sx * (POST / 2)), HEIGHT / 2, sz * (LENGTH / 2 - POST / 2)],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
    ),
  );
}

function levelParts(level: (typeof LEVELS)[number]): ModelSpecPart[] {
  const { name, y } = level;
  return [
    ...[-1, 1].map((sx) =>
      plain(`side${name}${sx < 0 ? 'L' : 'R'}`, 'frame', [RAIL_T, RAIL_H, LONG], {
        at: [by('width', sx / 2, -sx * INNER), y, 0],
      }),
    ),
    ...[-1, 1].map((sz) =>
      plain(
        `end${name}${sz < 0 ? 'B' : 'F'}`,
        'frame',
        [by('width', 1, -2 * POST), RAIL_H, RAIL_T],
        {
          at: [0, y, sz * (LENGTH / 2 - INNER)],
          minLod: 1,
        },
      ),
    ),
    plain(`slab${name}`, 'frame', [by('width', 1, -2 * POST), 0.02, LONG], {
      at: [0, y - 0.03, 0],
      minLod: 2,
    }),
    block(`mattress${name}`, 'linen', [by('width', 1, -2 * POST - 0.02), 0.15, LONG - 0.04], {
      at: [0, y + 0.055, 0],
      round: 0.04,
      segments: 3,
    }),
  ];
}

function guardParts(): ModelSpecPart[] {
  const sideX = (sx: number): ReturnType<typeof by> => by('width', sx / 2, -sx * INNER);
  const rightLength = LONG * 0.52;
  const rightZ = -LONG / 2 + rightLength / 2;
  return [
    plain('guardLeft', 'frame', [0.025, 0.2, LONG], { at: [sideX(-1), GUARD_Y, 0] }),
    plain('guardLeftRail', 'frame', [RAIL_T, 0.05, LONG], {
      at: [sideX(-1), GUARD_Y + 0.12, 0],
      minLod: 2,
    }),
    plain('guardRight', 'frame', [0.025, 0.2, rightLength], {
      at: [sideX(1), GUARD_Y, rightZ],
      minLod: 2,
    }),
    plain('guardRightRail', 'frame', [RAIL_T, 0.05, rightLength], {
      at: [sideX(1), GUARD_Y + 0.12, rightZ],
      minLod: 2,
    }),
    ...[-1, 1].map((sz) =>
      plain(`guard${sz < 0 ? 'Head' : 'Foot'}`, 'frame', [by('width', 1, -2 * POST), 0.2, 0.025], {
        at: [0, GUARD_Y, sz * (LENGTH / 2 - INNER)],
        minLod: 2,
      }),
    ),
  ];
}

function ladderParts(): ModelSpecPart[] {
  const x = by('width', 0.5, 0.045);
  const span = 0.42;
  const centreZ = 0.5;
  return [
    ...[-1, 1].map((sz) =>
      plain(`ladderRail${sz < 0 ? 'A' : 'B'}`, 'frame', [0.03, 1.3, 0.04], {
        at: [x, 0.73, centreZ + (sz * span) / 2],
        minLod: 1,
      }),
    ),
    piece(
      'ladderRungs',
      'frame',
      { type: 'slats', count: 5, spacing: 0.24, width: 0.03, height: 0.03, depth: span + 0.03 },
      { at: [x, 0.73, centreZ] },
    ),
  ];
}

export const BUNK_BED_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.bunk-bed',
  title: 'Bunk bed',
  footprint: { width: 1.03, depth: LENGTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0.06, resizes: true } },
  meta: {
    names: {
      display: 'Bunk bed',
      synonyms: ['bunk beds', 'double decker bed', 'kids bunk bed', 'two level bed', 'bed'],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.bed-bunk'],
  },
  params: { width: { min: 0.85, max: 1.1, default: 0.97, unit: 'm' } },
  materials: {
    frame: woodOf('oak'),
    linen: fabric('#EEE9DF'),
    accent: upholsteryOf('slate'),
  },
  finishes: woodFinishes(['frame']),
  defaultFinish: 'oak',
  pitch: 14,
  wall: true,
  parts: [
    ...postParts(),
    ...LEVELS.flatMap(levelParts),
    ...guardParts(),
    ...ladderParts(),
    block('blanket', 'accent', [by('width', 1, -2 * POST - 0.06), 0.045, 0.9], {
      at: [0, 0.45, 0.4],
      round: 0.02,
      segments: 3,
      minLod: 2,
    }),
  ],
});
