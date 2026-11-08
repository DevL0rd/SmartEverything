import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, blob, catalogueModel, piece, rod, strut } from '../fc25/kit';

const FRONT = 0.72;
const REAR = -0.68;
const AXLE = 0.35;

function wheel(name: string, z: number): ModelSpecPart[] {
  return [
    piece(
      `tyre${name}`,
      'tyre',
      { type: 'torus', radius: 0.27, tube: 0.082, segments: 32 },
      { at: [0, AXLE, z], turn: [0, 90, 0], contact: true },
    ),
    rod(
      `rim${name}`,
      'metal',
      { height: 0.05, top: 0.2, bevel: 0.012, segments: 32 },
      { at: [0, AXLE, z], turn: [0, 0, 90] },
    ),
    rod(
      `cap${name}`,
      'accent',
      { height: 0.1, top: 0.05, bevel: 0.012, segments: 24 },
      { at: [0, AXLE, z], turn: [0, 0, 90], minLod: 1 },
    ),
  ];
}

function forks(): ModelSpecPart[] {
  return ([-1, 1] as const).map((side) =>
    strut(`fork${side < 0 ? 'Left' : 'Right'}`, 'accent', {
      from: [side * 0.11, AXLE, FRONT],
      length: 0.72,
      tilt: 24,
      yaw: 270,
      top: 0.027,
      bottom: 0.03,
    }),
  );
}

function cockpit(): ModelSpecPart[] {
  const grips = ([-1, 1] as const).map((side) =>
    rod(
      `grip${side < 0 ? 'Left' : 'Right'}`,
      'tyre',
      { height: 0.12, top: 0.023, bevel: 0.008, segments: 20 },
      { at: [side * 0.33, 1.04, 0.5], turn: [0, 0, 90] },
    ),
  );
  return [
    rod(
      'bars',
      'metal',
      { height: 0.72, top: 0.016, bevel: 0.005, segments: 16 },
      { at: [0, 1.04, 0.5], turn: [0, 0, 90] },
    ),
    ...grips,
    rod(
      'headlight',
      'accent',
      { height: 0.08, top: 0.09, bevel: 0.02, segments: 32 },
      { at: [0, 0.9, 0.69], turn: [90, 0, 0] },
    ),
  ];
}

function drivetrain(): ModelSpecPart[] {
  const arms = ([-1, 1] as const).map((side) =>
    block(`swingarm${side < 0 ? 'Left' : 'Right'}`, 'metal', [0.05, 0.07, 0.7], {
      round: 0.015,
      segments: 3,
      at: [side * 0.12, 0.38, -0.34],
    }),
  );
  return [
    block('engine', 'metal', [0.3, 0.34, 0.42], { round: 0.06, segments: 4, at: [0, 0.46, 0.05] }),
    block('head', 'metal', [0.34, 0.2, 0.22], {
      round: 0.05,
      segments: 3,
      at: [0, 0.68, 0.14],
      minLod: 1,
    }),
    rod(
      'exhaust',
      'accent',
      { height: 1, top: 0.045, bevel: 0.012, segments: 24 },
      { at: [0.2, 0.3, -0.3], turn: [90, 0, 0] },
    ),
    ...arms,
  ];
}

export const MOTORBIKE_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.motorbike',
  title: 'Motorbike',
  category: 'outdoor',
  footprint: { width: 0.78, depth: 2.1, height: 1.06 },
  view: { yaw: 50, pitch: 14, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Motorbike',
      synonyms: ['motorbike', 'motorcycle', 'bike', 'roadster', 'street bike'],
    },
    sizeClass: 'medium',
  },
  materials: {
    paint: colorMaterial('#A3262E', { roughness: 0.3, clearcoat: 0.8 }),
    metal: tokenMaterial('graphite'),
    tyre: tokenMaterial('rubber'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      crimson: {},
      black: { paint: { color: '#1F2023' } },
      cobalt: { paint: { color: '#1F4F9A' } },
      pearl: { paint: { color: '#EDEBE6' } },
    },
    'crimson',
  ),
  parts: [
    ...wheel('Front', FRONT),
    ...wheel('Rear', REAR),
    ...forks(),
    ...cockpit(),
    ...drivetrain(),
    blob('tank', 'paint', [0.19, 0.16, 0.34], { at: [0, 0.88, 0.14], segments: 32 }),
    block('seat', 'tyre', [0.26, 0.09, 0.62], { round: 0.04, segments: 3, at: [0, 0.82, -0.4] }),
    block('tail', 'paint', [0.16, 0.1, 0.4], { round: 0.04, segments: 3, at: [0, 0.8, -0.78] }),
  ],
});
