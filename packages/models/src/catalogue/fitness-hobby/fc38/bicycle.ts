import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, catalogueItem, hoop, link, rod, type Point } from '../../kids-pets/fc35/kit';

const R = 0.34;
const TYRE = 0.024;
const REAR_Z = -0.49;
const FRONT_Z = 0.49;
const DEG = Math.PI / 180;

const BB: Point = [0, 0.28, 0];
const SEAT_TOP: Point = [0, 0.93, -0.17];
const SEAT_MID: Point = [0, 0.85, -0.155];
const HEAD_TOP: Point = [0, 0.9, 0.4];
const HEAD_LOW: Point = [0, 0.76, 0.43];
const BAR: Point = [0, 1, 0.385];

function wheel(name: string, z: number): ModelSpecPart[] {
  const spokes = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * 360 * DEG;
    const rim: Point = [
      index % 2 === 0 ? 0.012 : -0.012,
      Number((R + Math.sin(angle) * 0.3).toFixed(4)),
      Number((z + Math.cos(angle) * 0.3).toFixed(4)),
    ];
    return link(
      `spoke${name}${String(index + 1)}`,
      'accent',
      { from: [index % 2 === 0 ? 0.02 : -0.02, R, z], to: rim, top: 0.0013, bevel: 0, segments: 6 },
      { minLod: 2 },
    );
  });
  return [
    hoop(
      `tyre${name}`,
      'tyre',
      { radius: R - TYRE, tube: TYRE, segments: 40 },
      { at: [0, R, z], turn: [0, 90, 0], contact: true },
    ),
    hoop(
      `rim${name}`,
      'accent',
      { radius: 0.3, tube: 0.005, segments: 32 },
      { at: [0, R, z], turn: [0, 90, 0], minLod: 1 },
    ),
    rod(
      `hub${name}`,
      'accent',
      { height: 0.1, top: 0.018, bevel: 0, segments: 16 },
      { at: [0, R, z], turn: [0, 0, 90], minLod: 1 },
    ),
    ...spokes,
  ];
}

function frame(): ModelSpecPart[] {
  const main = [
    ['seatTube', BB, SEAT_TOP, 0.017],
    ['topTube', SEAT_MID, HEAD_TOP, 0.016],
    ['downTube', BB, HEAD_LOW, 0.02],
    ['headTube', HEAD_LOW, HEAD_TOP, 0.022],
  ] as const;
  const stays = ([-1, 1] as const).flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const axle: Point = [side * 0.055, R, REAR_Z];
    return [
      link(`chainStay${name}`, 'body', { from: [side * 0.035, BB[1], 0], to: axle, top: 0.011 }),
      link(`seatStay${name}`, 'body', {
        from: [side * 0.02, SEAT_MID[1], SEAT_MID[2]],
        to: axle,
        top: 0.009,
      }),
      link(`fork${name}`, 'body', {
        from: [side * 0.05, HEAD_LOW[1] + 0.02, HEAD_LOW[2]],
        to: [side * 0.05, R, FRONT_Z],
        top: 0.012,
        bottom: 0.009,
      }),
    ];
  });
  return [
    ...main.map(([id, from, to, top]) => link(id, 'body', { from, to, top, segments: 20 })),
    ...stays,
  ];
}

function cockpit(): ModelSpecPart[] {
  const grips = ([-1, 1] as const).map((side) =>
    rod(
      `grip${side < 0 ? 'Left' : 'Right'}`,
      'tyre',
      { height: 0.1, top: 0.016, bevel: 0.006, segments: 16 },
      { at: [side * 0.22, BAR[1], BAR[2]], turn: [0, 0, 90], minLod: 1 },
    ),
  );
  return [
    link('stem', 'trim', { from: HEAD_TOP, to: BAR, top: 0.012 }, { minLod: 1 }),
    rod(
      'bars',
      'trim',
      { height: 0.5, top: 0.011, bevel: 0, segments: 12 },
      { at: [0, BAR[1], BAR[2]], turn: [0, 0, 90] },
    ),
    ...grips,
    link('seatPost', 'trim', { from: SEAT_TOP, to: [0, 0.99, -0.185], top: 0.014 }, { minLod: 1 }),
    block('saddle', 'trim', [0.14, 0.05, 0.27], {
      at: [0, 1.015, -0.2],
      turn: [4, 0, 0],
      round: 0.02,
      segments: 3,
    }),
  ];
}

function drivetrain(): ModelSpecPart[] {
  const pedals = ([-1, 1] as const).flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const end: Point = [side * 0.1, BB[1] - side * 0.15, side * 0.09];
    return [
      link(
        `crank${name}`,
        'trim',
        { from: [side * 0.07, BB[1], 0], to: end, top: 0.01 },
        { minLod: 1 },
      ),
      block(`pedal${name}`, 'trim', [0.1, 0.018, 0.07], {
        at: [side * 0.13, end[1], end[2]],
        round: 0.006,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
  return [
    hoop(
      'chainring',
      'accent',
      { radius: 0.085, tube: 0.008, segments: 32 },
      { at: [0.05, BB[1], 0], turn: [0, 90, 0], minLod: 1 },
    ),
    ...pedals,
  ];
}

export const BICYCLE_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.bicycle',
  title: 'Bicycle',
  category: 'fitness-hobby',
  footprint: { width: 0.56, depth: 1.7, height: 1.05 },
  view: { yaw: 55, pitch: 14, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Bicycle',
      synonyms: ['bike', 'city bike', 'road bike', 'cycle', 'push bike'],
    },
    sizeClass: 'large',
    aliases: ['cat.fitness-hobby.bike'],
  },
  materials: {
    body: colorMaterial('#3C4F63', { roughness: 0.4, clearcoat: 0.4 }),
    tyre: tokenMaterial('rubber'),
    trim: tokenMaterial('graphite'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      slate: {},
      red: { body: { color: '#A3262E' } },
      white: { body: { color: '#ECE9E2' } },
      green: { body: { color: '#3E6A52' } },
      black: { body: { color: '#25272B' } },
    },
    'slate',
  ),
  parts: [
    ...wheel('Rear', REAR_Z),
    ...wheel('Front', FRONT_Z),
    ...frame(),
    ...cockpit(),
    ...drivetrain(),
  ],
});
