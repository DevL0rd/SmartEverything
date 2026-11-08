import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, fabric, piece, upholsteryOf, woodFinishes, woodOf } from '../../living/fc06/kit';
import { bedroomItem } from './kit';

const WIDTH = 0.7;
const LENGTH = 1.3;
const HEIGHT = 0.95;
const POST = 0.05;
const SIDE_X = WIDTH / 2 - POST / 2;
const END_Z = LENGTH / 2 - POST / 2;
const TOP_Y = 0.9;
const LOW_Y = 0.33;
const SPINDLES = 11;

function postParts(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) =>
      block(`post${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`, 'frame', [POST, HEIGHT, POST], {
        at: [sx * SIDE_X, HEIGHT / 2, sz * END_Z],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
    ),
  );
}

function sideParts(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) => {
    const name = sx < 0 ? 'L' : 'R';
    return [
      block(`topRail${name}`, 'frame', [0.04, 0.045, LENGTH - 2 * POST], {
        at: [sx * SIDE_X, TOP_Y, 0],
        round: 0.012,
        segments: 3,
      }),
      block(`lowRail${name}`, 'frame', [0.035, 0.04, LENGTH - 2 * POST], {
        at: [sx * SIDE_X, LOW_Y, 0],
        round: 0.008,
        segments: 3,
        minLod: 2,
      }),
      piece(
        `spindles${name}`,
        'frame',
        {
          type: 'slats',
          count: SPINDLES,
          spacing: 0.1,
          width: 0.02,
          height: 0.02,
          depth: TOP_Y - LOW_Y - 0.045,
        },
        { at: [sx * SIDE_X, (TOP_Y + LOW_Y) / 2, 0], turn: [90, 0, 0] },
      ),
    ];
  });
}

function endParts(): ModelSpecPart[] {
  return [
    block('panelHead', 'frame', [WIDTH - 2 * POST, 0.58, 0.03], {
      at: [0, 0.63, -END_Z],
      round: 0.012,
      segments: 3,
    }),
    block('panelFoot', 'frame', [WIDTH - 2 * POST, 0.42, 0.025], {
      at: [0, 0.58, END_Z],
      round: 0.01,
      segments: 3,
    }),
    block('railHead', 'frame', [WIDTH - 2 * POST, 0.04, 0.04], {
      at: [0, TOP_Y, -END_Z],
      round: 0.012,
      segments: 3,
      minLod: 2,
    }),
    block('railFoot', 'frame', [WIDTH - 2 * POST, 0.04, 0.04], {
      at: [0, TOP_Y - 0.03, END_Z],
      round: 0.012,
      segments: 3,
      minLod: 2,
    }),
  ];
}

function bedding(): ModelSpecPart[] {
  return [
    block('support', 'frame', [WIDTH - 2 * POST + 0.02, 0.02, LENGTH - 2 * POST], {
      at: [0, 0.3, 0],
      round: 0.006,
      segments: 3,
      minLod: 2,
    }),
    block('mattress', 'linen', [WIDTH - 2 * POST, 0.11, LENGTH - 2 * POST - 0.02], {
      at: [0, 0.365, 0],
      round: 0.03,
      segments: 3,
    }),
    block('blanket', 'accent', [WIDTH - 2 * POST - 0.04, 0.035, 0.38], {
      at: [0, 0.44, 0.3],
      round: 0.015,
      segments: 3,
      minLod: 2,
    }),
  ];
}

export const CRIB_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.crib',
  title: 'Crib',
  footprint: { width: WIDTH, depth: LENGTH, height: HEIGHT },
  meta: {
    names: {
      display: 'Crib',
      synonyms: ['cot', 'baby bed', 'baby cot', 'nursery bed', 'infant bed'],
    },
    sizeClass: 'medium',
    aliases: ['cat.bedroom.cot', 'cat.bedroom.baby-bed'],
  },
  materials: {
    frame: woodOf('white-lacquer'),
    linen: fabric('#EEE9DF'),
    accent: upholsteryOf('oat'),
  },
  finishes: woodFinishes(['frame']),
  defaultFinish: 'white-lacquer',
  pitch: 18,
  parts: [...postParts(), ...sideParts(), ...endParts(), ...bedding()],
});
