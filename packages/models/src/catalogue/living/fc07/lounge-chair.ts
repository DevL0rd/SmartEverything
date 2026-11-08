import type { ModelSpecPart } from '@smarteverything/domain';
import { block, furniture, rod, upholsteryFinishes, upholsteryOf, woodOf } from '../fc06/kit';

const SPOKES = 5;
const REACH = 0.2;
const SEAT_Y = 0.38;
const SEAT_TILT = -7;
const BACK_TILT = -20;

function baseParts(): ModelSpecPart[] {
  const spokes = Array.from({ length: SPOKES }, (_, index): ModelSpecPart[] => {
    const angle = (index * 360) / SPOKES + 90;
    const rad = (angle * Math.PI) / 180;
    const x = REACH * Math.cos(rad);
    const z = -REACH * Math.sin(rad);
    const name = String(index + 1);
    return [
      block(`spoke${name}`, 'trim', [0.4, 0.035, 0.05], {
        at: [x, 0.03, z],
        turn: [0, angle, 0],
        round: 0.015,
        segments: 3,
      }),
      rod(
        `glide${name}`,
        'trim',
        { height: 0.02, top: 0.018, segments: 16 },
        { at: [1.9 * x, 0.01, 1.9 * z], contact: true, minLod: 1 },
      ),
    ];
  });
  return [
    ...spokes.flat(),
    rod(
      'column',
      'trim',
      { height: 0.28, top: 0.035, bottom: 0.045, segments: 32 },
      {
        at: [0, 0.17, 0],
      },
    ),
  ];
}

function shellParts(): ModelSpecPart[] {
  return [
    block('seatShell', 'frame', [0.7, 0.045, 0.62], {
      at: [0, SEAT_Y - 0.06, 0.06],
      turn: [SEAT_TILT, 0, 0],
      round: 0.02,
    }),
    block('backShell', 'frame', [0.7, 0.58, 0.045], {
      at: [0, 0.64, -0.29],
      turn: [BACK_TILT, 0, 0],
      round: 0.02,
    }),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'armLeft' : 'armRight', 'frame', [0.09, 0.035, 0.46], {
        at: [side * 0.37, 0.53, 0.02],
        round: 0.015,
      }),
    ),
  ];
}

function cushionParts(): ModelSpecPart[] {
  return [
    block('seat', 'body', [0.64, 0.11, 0.58], {
      at: [0, SEAT_Y + 0.02, 0.07],
      turn: [SEAT_TILT, 0, 0],
      round: 0.045,
    }),
    block('backCushion', 'body', [0.62, 0.52, 0.1], {
      at: [0, 0.66, -0.24],
      turn: [BACK_TILT, 0, 0],
      round: 0.045,
    }),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'padLeft' : 'padRight', 'body', [0.08, 0.04, 0.4], {
        at: [side * 0.37, 0.565, 0.03],
        round: 0.018,
        minLod: 1,
      }),
    ),
    ...[-1, 1].map((side) =>
      rod(
        side < 0 ? 'armPostLeft' : 'armPostRight',
        'trim',
        { height: 0.14, top: 0.012, segments: 16 },
        { at: [side * 0.37, 0.45, 0.12], minLod: 1 },
      ),
    ),
    block('seamBack', 'accent', [0.5, 0.008, 0.012], {
      at: [0, 0.58, -0.17],
      turn: [BACK_TILT, 0, 0],
      round: 0.003,
      segments: 3,
      minLod: 2,
    }),
  ];
}

export const LOUNGE_CHAIR_MODEL = furniture({
  id: 'cat.living.lounge-chair',
  title: 'Lounge chair',
  footprint: { width: 0.84, depth: 0.84, height: 0.92 },
  meta: {
    names: {
      display: 'Lounge chair',
      synonyms: ['swivel lounge chair', 'reading chair', 'club lounger', 'accent chair'],
    },
    sizeClass: 'medium',
    aliases: ['cat.living.swivel-chair'],
  },
  materials: {
    body: upholsteryOf('cognac'),
    frame: woodOf('walnut'),
    trim: { finish: 'brushed-aluminium' },
    accent: { finish: 'satin-black' },
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'cognac',
  parts: [...baseParts(), ...shellParts(), ...cushionParts()],
});
