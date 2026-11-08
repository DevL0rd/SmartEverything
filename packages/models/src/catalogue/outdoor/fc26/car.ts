import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { pathBuilder } from '../../../helpers/path';
import { block, catalogueModel, piece, rod } from '../fc25/kit';

const TURN = [0, -90, 0] as const;
const WHEELS: readonly (readonly [number, number])[] = [
  [-0.8, 1.42],
  [0.8, 1.42],
  [-0.8, -1.42],
  [0.8, -1.42],
];

function lowerPath(): ReturnType<ReturnType<typeof pathBuilder>['build']> {
  return pathBuilder(-2.2, 0.3)
    .line(2.2, 0.3)
    .quadratic(2.27, 0.32, 2.25, 0.5)
    .line(2.2, 0.72)
    .line(1.0, 0.92)
    .line(-1.75, 0.95)
    .quadratic(-2.15, 0.95, -2.25, 0.75)
    .line(-2.25, 0.45)
    .quadratic(-2.27, 0.32, -2.2, 0.3)
    .build();
}

function cabinPath(): ReturnType<ReturnType<typeof pathBuilder>['build']> {
  return pathBuilder(1, 0.92)
    .line(0.3, 1.38)
    .quadratic(-0.4, 1.46, -1.2, 1.38)
    .line(-1.8, 0.93)
    .line(1, 0.92)
    .build();
}

function roofPath(): ReturnType<ReturnType<typeof pathBuilder>['build']> {
  return pathBuilder(0.28, 1.38)
    .quadratic(-0.4, 1.47, -1.22, 1.4)
    .line(-1.2, 1.33)
    .quadratic(-0.4, 1.4, 0.3, 1.32)
    .line(0.28, 1.38)
    .build();
}

function shell(): ModelSpecPart[] {
  return [
    piece(
      'body',
      'paint',
      { type: 'extrude', path: [...lowerPath()], depth: 1.72, bevel: 0.05 },
      { turn: TURN, contact: true },
    ),
    piece(
      'cabin',
      'glass',
      { type: 'extrude', path: [...cabinPath()], depth: 1.5, bevel: 0.03 },
      { turn: TURN },
    ),
    piece(
      'roof',
      'paint',
      { type: 'extrude', path: [...roofPath()], depth: 1.56, bevel: 0.02 },
      { turn: TURN },
    ),
    block('pillar', 'paint', [1.58, 0.46, 0.07], {
      round: 0.02,
      segments: 3,
      at: [0, 1.15, -0.4],
      minLod: 1,
    }),
  ];
}

function wheels(): ModelSpecPart[] {
  return WHEELS.flatMap(([x, z], index) => {
    const name = String(index + 1);
    const side = x < 0 ? -1 : 1;
    return [
      rod(
        `tyre${name}`,
        'tyre',
        { height: 0.23, top: 0.33, bevel: 0.07, segments: 40 },
        { at: [x, 0.33, z], turn: [0, 0, 90], contact: true },
      ),
      rod(
        `hub${name}`,
        'accent',
        { height: 0.02, top: 0.2, bevel: 0.008, segments: 32 },
        { at: [x + side * 0.115, 0.33, z], turn: [0, 0, 90], minLod: 1 },
      ),
      rod(
        `arch${name}`,
        'tyre',
        { height: 0.02, top: 0.345, bevel: 0.006, segments: 32 },
        { at: [side * 0.912, 0.345, z], turn: [0, 0, 90], minLod: 1 },
      ),
    ];
  });
}

function fittings(): ModelSpecPart[] {
  const lights = ([-1, 1] as const).flatMap((side) => [
    block(`headlight${side < 0 ? 'Left' : 'Right'}`, 'accent', [0.4, 0.09, 0.05], {
      round: 0.03,
      segments: 3,
      at: [side * 0.62, 0.72, 2.27],
    }),
    block(`mirror${side < 0 ? 'Left' : 'Right'}`, 'paint', [0.14, 0.09, 0.1], {
      round: 0.035,
      segments: 3,
      at: [side * 1.0, 0.98, 0.78],
      minLod: 1,
    }),
  ]);
  return [
    ...lights,
    block('grille', 'glass', [0.8, 0.14, 0.04], {
      round: 0.02,
      segments: 3,
      at: [0, 0.5, 2.27],
      minLod: 1,
    }),
  ];
}

export const CAR_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.car',
  title: 'Parked car',
  category: 'outdoor',
  footprint: { width: 2.14, depth: 4.61, height: 1.5 },
  view: { yaw: 35, pitch: 16, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Parked car',
      synonyms: ['car', 'parked car', 'sedan', 'automobile', 'vehicle', 'family car'],
    },
    sizeClass: 'large',
  },
  materials: {
    paint: colorMaterial('#EDEBE6', { roughness: 0.3, clearcoat: 0.8 }),
    glass: tokenMaterial('smoked-acrylic'),
    tyre: tokenMaterial('rubber'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      pearl: {},
      graphite: { paint: { color: '#3A3D42' } },
      silver: { paint: { color: '#B9BDC3' } },
      crimson: { paint: { color: '#A3262E' } },
      navy: { paint: { color: '#1F3A5F' } },
      forest: { paint: { color: '#2F5A44' } },
    },
    'pearl',
  ),
  parts: [...shell(), ...wheels(), ...fittings()],
});
