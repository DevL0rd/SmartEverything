import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { PAPER, block, cyl, decorItem, fabric, finishesOf, piece, woodOf } from '../fc30/kit';

const PANEL = 0.018;
const SIDE = 0.17;
const FRONT = { z: 0.1, y: 0.12 } as const;
const BACK = { z: -0.1, y: 0.4 } as const;

const TILT = (Math.atan2(BACK.y - FRONT.y, FRONT.z - BACK.z) * 180) / Math.PI;
const SLING_LENGTH = Math.hypot(BACK.y - FRONT.y, FRONT.z - BACK.z);
const NORMAL = [Math.cos((TILT * Math.PI) / 180), Math.sin((TILT * Math.PI) / 180)] as const;
const TANGENT = [-NORMAL[1], NORMAL[0]] as const;
const CENTRE = [(FRONT.y + BACK.y) / 2, (FRONT.z + BACK.z) / 2] as const;

function panel(side: -1 | 1): ModelSpecPart {
  return piece(
    side < 0 ? 'panelLeft' : 'panelRight',
    'frame',
    {
      type: 'extrude',
      depth: PANEL,
      bevel: 0.004,
      path: [
        { op: 'move', x: 0.1, y: 0 },
        { op: 'line', x: -0.1, y: 0 },
        { op: 'quadratic', cx: -0.12, cy: 0, x: -0.12, y: 0.02 },
        { op: 'line', x: -0.12, y: 0.4 },
        { op: 'quadratic', cx: -0.12, cy: 0.44, x: -0.08, y: 0.43 },
        { op: 'line', x: 0.1, y: 0.22 },
        { op: 'quadratic', cx: 0.12, cy: 0.215, x: 0.12, y: 0.19 },
        { op: 'line', x: 0.12, y: 0.02 },
        { op: 'quadratic', cx: 0.12, cy: 0, x: 0.1, y: 0 },
      ],
    },
    { at: [side * SIDE, 0, 0], turn: [0, -90, 0], contact: true },
  );
}

function dowel(id: string, spot: { readonly z: number; readonly y: number }): ModelSpecPart {
  return cyl(
    id,
    'frame',
    { height: 2 * SIDE + 0.02, top: 0.009, bevel: 0.003, segments: 24 },
    { at: [0, spot.y, spot.z], turn: [0, 0, 90] },
  );
}

function magazine(index: number): ModelSpecPart[] {
  const lift = 0.0035 + 0.004 + 0.0095 * index;
  const slide = -0.015 * index;
  const place = {
    at: [
      0,
      CENTRE[0] + NORMAL[0] * lift + TANGENT[0] * slide,
      CENTRE[1] + NORMAL[1] * lift + TANGENT[1] * slide,
    ],
    turn: [TILT, 0, 0],
  } as const;
  return [
    block(`magazine${String(index + 1)}`, 'paper', [0.25, 0.008, 0.28], {
      ...place,
      round: 0.003,
      segments: 3,
    }),
    block(`cover${String(index + 1)}`, 'accent', [0.25, 0.0012, 0.07], {
      at: [
        0,
        place.at[1] + NORMAL[0] * 0.0046 + TANGENT[0] * 0.105,
        place.at[2] + NORMAL[1] * 0.0046 + TANGENT[1] * 0.105,
      ],
      turn: [TILT, 0, 0],
      round: 0.0005,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const MAGAZINE_RACK_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.magazine-rack',
  title: 'Magazine rack',
  footprint: { width: 0.4, depth: 0.28, height: 0.44 },
  meta: {
    names: {
      display: 'Magazine rack',
      synonyms: ['magazine holder', 'newspaper rack', 'magazine stand', 'sling rack', 'book rack'],
    },
    sizeClass: 'small',
  },
  materials: {
    frame: woodOf('oak'),
    sling: fabric('#C7B79B'),
    paper: PAPER,
    accent: { color: '#C4503A', roughness: 0.7 },
  },
  finish: finishesOf(
    {
      oak: {},
      walnut: { frame: woodOf('walnut'), sling: fabric('#4F5D53') },
      black: { frame: { finish: 'satin-black' }, sling: fabric('#8A5A44') },
    },
    'oak',
  ),
  mount: 'floor',
  parts: [
    panel(-1),
    panel(1),
    dowel('dowelFront', FRONT),
    dowel('dowelBack', BACK),
    dowel('dowelFoot', { z: -0.1, y: 0.05 }),
    block('sling', 'sling', [2 * SIDE - 0.03, 0.005, SLING_LENGTH], {
      at: [0, CENTRE[0], CENTRE[1]],
      turn: [TILT, 0, 0],
      round: 0.002,
      segments: 3,
    }),
    ...[0, 1, 2].flatMap((index) => magazine(index)),
  ],
});
