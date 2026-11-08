import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, catalogueItem, fabricOf, link, paint, PAINTS, rod, type Point } from './kit';

const SEAT_Y = 0.5;
const SEAT_T = 0.045;
const HALF = 0.17;
const TRAY_Y = 0.66;

function post(side: 1 | -1, rear: boolean): ModelSpecPart {
  const name = `${rear ? 'rear' : 'front'}${side < 0 ? 'Left' : 'Right'}`;
  const foot: Point = [side * 0.23, 0, rear ? -0.3 : 0.28];
  const head: Point = rear ? [side * 0.18, 0.96, -0.2] : [side * HALF, SEAT_Y - 0.02, 0.15];
  return link(
    name,
    'body',
    { from: foot, to: head, top: 0.019, bottom: 0.015, segments: 20 },
    { contact: true },
  );
}

function support(): ModelSpecPart[] {
  return [
    block('seat', 'pad', [0.36, SEAT_T, 0.34], {
      at: [0, SEAT_Y, 0],
      round: 0.016,
      segments: 3,
    }),
    block('back', 'pad', [0.34, 0.34, 0.034], {
      at: [0, SEAT_Y + 0.22, -0.18],
      turn: [-9, 0, 0],
      round: 0.014,
      segments: 3,
    }),
    block('crown', 'body', [0.4, 0.045, 0.03], {
      at: [0, 0.94, -0.2],
      turn: [-9, 0, 0],
      round: 0.012,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'footrest',
      'body',
      { height: 0.46, top: 0.012, segments: 16 },
      { at: [0, 0.2, 0.2], turn: [0, 0, 90], minLod: 1 },
    ),
  ];
}

function tray(): ModelSpecPart[] {
  const arms = ([-1, 1] as const).map((side) =>
    link(
      `arm${side < 0 ? 'Left' : 'Right'}`,
      'body',
      {
        from: [side * 0.2, TRAY_Y - 0.03, -0.12],
        to: [side * 0.2, TRAY_Y - 0.03, 0.26],
        top: 0.012,
      },
      { minLod: 1 },
    ),
  );
  return [
    block('tray', 'body', [0.46, 0.022, 0.32], {
      at: [0, TRAY_Y, 0.22],
      round: 0.01,
      segments: 3,
    }),
    block('rimFront', 'body', [0.46, 0.03, 0.016], {
      at: [0, TRAY_Y + 0.02, 0.37],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('rimLeft', 'body', [0.016, 0.03, 0.32], {
      at: [-0.223, TRAY_Y + 0.02, 0.22],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('rimRight', 'body', [0.016, 0.03, 0.32], {
      at: [0.223, TRAY_Y + 0.02, 0.22],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...arms,
    rod(
      'buckle',
      'accent',
      { height: 0.04, top: 0.014, bevel: 0.005, segments: 16 },
      { at: [0, SEAT_Y + 0.045, 0.1], minLod: 2 },
    ),
  ];
}

export const HIGH_CHAIR_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.high-chair',
  title: 'High chair',
  category: 'kids-pets',
  footprint: { width: 0.52, depth: 0.7, height: 0.97 },
  view: { yaw: 30, pitch: 14, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'High chair',
      synonyms: ['baby chair', 'feeding chair', 'highchair', 'toddler chair', 'infant seat'],
    },
    sizeClass: 'small',
    aliases: ['cat.kids-pets.baby-chair'],
  },
  materials: {
    body: tokenMaterial('oak'),
    pad: { color: '#CBBDA5', roughness: 0.9, sheen: 0.8, pattern: 'knit' },
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      oak: {},
      walnut: { body: { finish: 'walnut' }, pad: fabricOf('#8A9AA6') },
      white: { body: paint(PAINTS.white), pad: fabricOf('#9FC1D9') },
      sage: { body: paint(PAINTS.sage), pad: fabricOf('#F0E8D6') },
      blush: { body: paint(PAINTS.blush), pad: fabricOf('#F6EFE6') },
    },
    'oak',
  ),
  parts: [
    ...([-1, 1] as const).flatMap((side) => [post(side, false), post(side, true)]),
    ...support(),
    ...tray(),
  ],
});
