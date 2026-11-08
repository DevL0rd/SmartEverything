import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { extrudePath, pathBuilder } from '../../../helpers/path';
import { OUTDOOR_FRAME, OUTDOOR_METAL, block, outdoorItem, piece, rod } from './kit';

const WIDTH = 0.9;
const BODY_Y = 0.86;
const BODY_H = 0.24;
const BODY_D = 0.52;
const LEG_H = 0.74;
const HOOD_D = BODY_D - 0.02;
const HOOD_H = 0.17;
const HANDLE_Y = BODY_Y + BODY_H / 2 + 0.09;
const KNOB_XS = [-0.3, -0.1, 0.1, 0.3] as const;

function hoodOutline(): ReturnType<typeof pathBuilder> {
  const half = HOOD_D / 2;
  return pathBuilder(-half, 0)
    .line(half, 0)
    .cubic([half, 0.094], [half * 0.55, HOOD_H], 0, HOOD_H)
    .cubic([-half * 0.55, HOOD_H], [-half, 0.094], -half, 0);
}

function legs(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) =>
      block(`leg${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`, 'frame', [0.04, LEG_H, 0.04], {
        at: [sx * 0.4, LEG_H / 2, sz * 0.2],
        round: 0.01,
        segments: 3,
        contact: sz > 0,
      }),
    ),
  );
}

function wheels(): ModelSpecPart[] {
  return [-1, 1].map((sx) =>
    rod(
      sx < 0 ? 'wheelLeft' : 'wheelRight',
      'accent',
      { height: 0.04, top: 0.065, segments: 24 },
      { at: [sx * 0.44, 0.065, -0.2], turn: [0, 0, 90], contact: true, minLod: 1 },
    ),
  );
}

function knobs(): ModelSpecPart[] {
  return KNOB_XS.map((x, index) =>
    rod(
      `knob${String(index + 1)}`,
      'accent',
      { height: 0.03, top: 0.026, segments: 20 },
      { at: [x, BODY_Y - 0.02, BODY_D / 2 + 0.014], turn: [90, 0, 0], minLod: 1 },
    ),
  );
}

export const BARBECUE_GRILL_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.barbecue-grill',
  title: 'Barbecue grill',
  footprint: { width: 1.6, depth: BODY_D + 0.1, height: 1.22 },
  meta: {
    names: {
      display: 'Barbecue grill',
      synonyms: ['bbq', 'barbecue', 'gas grill', 'cart grill', 'outdoor grill'],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.bbq', 'cat.outdoor.grill'],
  },
  materials: {
    frame: OUTDOOR_FRAME,
    hood: { finish: 'graphite' },
    accent: OUTDOOR_METAL,
  },
  slots: { frame: ['frame'] },
  pitch: 18,
  parts: [
    block('body', 'hood', [WIDTH, BODY_H, BODY_D], {
      at: [0, BODY_Y, 0],
      round: 0.02,
      segments: 3,
    }),
    piece('hood', 'hood', extrudePath(hoodOutline(), WIDTH - 0.02, 0.01), {
      at: [0, BODY_Y + BODY_H / 2, 0],
      turn: [0, 90, 0],
    }),
    ...legs(),
    block('shelf', 'frame', [WIDTH - 0.06, 0.03, BODY_D - 0.1], {
      at: [0, 0.22, 0],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
    ...[-1, 1].map((sx) =>
      block(sx < 0 ? 'sideLeft' : 'sideRight', 'frame', [0.34, 0.03, 0.42], {
        at: [sx * (WIDTH / 2 + 0.17), BODY_Y - 0.02, 0],
        round: 0.01,
        segments: 3,
      }),
    ),
    rod(
      'handle',
      'accent',
      { height: 0.5, top: 0.014, segments: 16 },
      { at: [0, HANDLE_Y, 0.285], turn: [0, 0, 90], minLod: 1 },
    ),
    ...[-1, 1].map((sx) =>
      rod(
        sx < 0 ? 'postLeft' : 'postRight',
        'accent',
        { height: 0.075, top: 0.01, segments: 12 },
        { at: [sx * 0.2, HANDLE_Y, 0.2475], turn: [90, 0, 0], minLod: 1 },
      ),
    ),
    ...knobs(),
    ...wheels(),
  ],
});
