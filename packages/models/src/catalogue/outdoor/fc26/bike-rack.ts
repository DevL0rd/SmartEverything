import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { arch, block, by, catalogueModel, rod } from '../fc25/kit';

const PITCH = 0.7;
const MOST = 6;
const RAIL = 0.05;
const HOOP: readonly [number, number, number][] = [
  [-0.34, 0, 0],
  [-0.34, 0.55, 0],
  [-0.26, 0.74, 0],
  [0, 0.8, 0],
  [0.26, 0.74, 0],
  [0.34, 0.55, 0],
  [0.34, 0, 0],
];

function slot(index: number): {
  readonly x: ReturnType<typeof by>;
  readonly visible: ReturnType<typeof by>;
} {
  return {
    x: by('bikes', -PITCH / 2, PITCH * index + PITCH / 2),
    visible: by('bikes', 1, -index),
  };
}

function hoopAt(index: number): ModelSpecPart[] {
  const { x, visible } = slot(index);
  const name = String(index + 1);
  const bolts = ([-1, 1] as const).map((side) => ({
    ...rod(
      `bolt${name}${side < 0 ? 'Left' : 'Right'}`,
      'accent',
      { height: 0.012, top: 0.03, bevel: 0.004, segments: 20 },
      {
        at: [by('bikes', -PITCH / 2, PITCH * index + PITCH / 2 + side * 0.34), RAIL + 0.006, 0],
        minLod: 2,
      },
    ),
    visible,
  }));
  return [
    {
      ...arch(`hoop${name}`, 'hoop', { points: HOOP, radius: 0.022 }, { at: [x, RAIL, 0] }),
      visible,
    },
    ...bolts,
  ];
}

export const BIKE_RACK_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.bike-rack',
  title: 'Bike rack',
  category: 'outdoor',
  footprint: { width: 3, depth: 0.12, height: 0.87 },
  view: { yaw: 25, pitch: 20, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Bike rack',
      synonyms: ['bike rack', 'bicycle stand', 'cycle rack', 'bike stand', 'sheffield stand'],
    },
    sizeClass: 'medium',
  },
  params: { bikes: { min: 2, max: MOST, default: 4, unit: 'count' } },
  materials: {
    hoop: tokenMaterial('brushed-aluminium'),
    rail: tokenMaterial('graphite'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      galvanised: {},
      black: { hoop: { finish: 'satin-black' } },
      graphite: { hoop: { finish: 'graphite' } },
      signal: { hoop: { color: '#E6641E', roughness: 0.45 } },
    },
    'galvanised',
  ),
  parts: [
    block('rail', 'rail', [by('bikes', PITCH, 0.2), RAIL, 0.12], {
      round: 0.02,
      segments: 3,
      at: [0, RAIL / 2, 0],
      contact: true,
    }),
    ...Array.from({ length: MOST }, (_, index) => hoopAt(index)).flat(),
  ],
});
