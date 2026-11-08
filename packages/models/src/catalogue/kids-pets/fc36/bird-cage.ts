import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  TALL_VIEW,
  block,
  by,
  catalogueItem,
  hoop,
  piece,
  rod,
  wire,
  type Point,
} from '../fc35/kit';

const RADIUS = 0.22;
const BARS = 24;
const TRAY_T = 0.06;
const CAGE_H = 0.52;
const RING_TOP = TRAY_T / 2 + CAGE_H;
const DOME_H = 0.2;
const RIBS = 8;
const STAND = 0.7;
const DEG = Math.PI / 180;

function bars(): ModelSpecPart[] {
  return Array.from({ length: BARS }, (_, index) => {
    const angle = (index / BARS) * 360 * DEG;
    return rod(
      `bar${String(index + 1)}`,
      'wire',
      { height: CAGE_H, top: 0.0035, bevel: 0, segments: 8 },
      {
        at: [Math.cos(angle) * RADIUS, TRAY_T / 2 + CAGE_H / 2, Math.sin(angle) * RADIUS],
        parent: 'tray',
        minLod: 1,
      },
    );
  });
}

function ribs(): ModelSpecPart[] {
  return Array.from({ length: RIBS }, (_, index) => {
    const angle = (index / RIBS) * 360 * DEG;
    const points = [0, 25, 50, 75, 90].map((phi): Point => {
      const run = Math.cos(phi * DEG) * RADIUS;
      return [
        Number((run * Math.cos(angle)).toFixed(4)),
        Number((Math.sin(phi * DEG) * DOME_H).toFixed(4)),
        Number((run * Math.sin(angle)).toFixed(4)),
      ];
    });
    return wire(
      `rib${String(index + 1)}`,
      'wire',
      { points, radius: 0.004 },
      {
        at: [0, RING_TOP, 0],
        parent: 'tray',
        minLod: index % 2 === 0 ? 1 : 2,
      },
    );
  });
}

function rings(): ModelSpecPart[] {
  return [TRAY_T / 2 + 0.005, TRAY_T / 2 + CAGE_H * 0.5, RING_TOP].map((y, index) =>
    hoop(
      `ring${String(index + 1)}`,
      'wire',
      { radius: RADIUS, tube: 0.0065, segments: 32 },
      { at: [0, y, 0], parent: 'tray', minLod: index === 1 ? 1 : 0 },
    ),
  );
}

function fittings(): ModelSpecPart[] {
  return [
    ...([0.2, 0.42] as const).map((y, index) =>
      rod(
        `perch${String(index + 1)}`,
        'accent',
        { height: RADIUS * 2, top: 0.011, bevel: 0.004, segments: 16 },
        {
          at: [0, y + TRAY_T / 2, index === 0 ? 0.02 : -0.02],
          turn: [0, 0, 90],
          parent: 'tray',
          minLod: 1,
        },
      ),
    ),
    ...([-1, 1] as const).map((side) =>
      rod(
        `cup${side < 0 ? 'Left' : 'Right'}`,
        'tray',
        { height: 0.04, top: 0.04, bevel: 0.01, segments: 20 },
        { at: [side * 0.12, TRAY_T / 2 + 0.02, 0], parent: 'tray', minLod: 1 },
      ),
    ),
    hoop(
      'hook',
      'wire',
      { radius: 0.035, tube: 0.006, segments: 24 },
      { at: [0, RING_TOP + DOME_H + 0.03, 0], turn: [0, 0, 0], parent: 'tray', minLod: 1 },
    ),
  ];
}

export const BIRD_CAGE_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.bird-cage',
  title: 'Bird cage',
  category: 'kids-pets',
  footprint: { width: 0.5, depth: 0.5, height: 1.551 },
  size: { height: { param: 'stand', extra: 0.851, resizes: true } },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Bird cage',
      synonyms: ['birdcage', 'parrot cage', 'canary cage', 'aviary', 'cage on stand'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kids-pets.birdcage'],
  },
  params: { stand: { min: 0.5, max: 0.9, default: STAND, unit: 'm' } },
  materials: {
    wire: tokenMaterial('satin-black'),
    tray: tokenMaterial('matte-white'),
    sleeve: colorMaterial('#C9D2D8', { opacity: 0.12, roughness: 0.3 }),
    accent: tokenMaterial('oak'),
  },
  finish: finishSet(
    {
      black: {},
      white: { wire: { finish: 'matte-white' }, tray: { finish: 'warm-white' } },
      brass: { wire: { color: '#B8975A', roughness: 0.35 }, tray: { finish: 'warm-white' } },
    },
    'black',
  ),
  parts: [
    ...([-1, 1] as const).flatMap((sx) =>
      ([-1, 1] as const).map((sz) =>
        rod(
          `leg${sx < 0 ? 'West' : 'East'}${sz < 0 ? 'Back' : 'Front'}`,
          'wire',
          { height: by('stand'), top: 0.014, bottom: 0.012, segments: 16 },
          { at: [sx * 0.19, by('stand', 0.5), sz * 0.19], contact: true },
        ),
      ),
    ),
    block('shelf', 'wire', [0.42, 0.02, 0.42], {
      at: [0, 0.16, 0],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'tray',
      'tray',
      { height: TRAY_T, top: RADIUS + 0.03, bevel: 0.015, segments: 48 },
      { at: [0, by('stand', 1, TRAY_T / 2), 0] },
    ),
    rod(
      'sleeve',
      'sleeve',
      { height: CAGE_H, top: RADIUS, segments: 40 },
      { at: [0, TRAY_T / 2 + CAGE_H / 2, 0], parent: 'tray' },
    ),
    piece(
      'domeSleeve',
      'sleeve',
      { type: 'sphere', radius: RADIUS, thetaLength: 90, segments: 40 },
      { at: [0, RING_TOP, 0], scale: [1, DOME_H / RADIUS, 1], parent: 'tray' },
    ),
    ...rings(),
    ...bars(),
    ...ribs(),
    ...fittings(),
  ],
});
