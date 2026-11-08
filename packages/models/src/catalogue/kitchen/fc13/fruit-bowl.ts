import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { by, piece } from '../../living/fc06/kit';
import { kitchenItem } from './kit';

const RIM = 0.16;
const DEPTH = 0.1;
const FOOT = 0.052;
const WALL = 0.008;
const STEPS = 8;
const SPHERE = (RIM * RIM + DEPTH * DEPTH) / (2 * DEPTH);
const START = Math.asin(FOOT / SPHERE);
const END = Math.asin(RIM / SPHERE);

function arc(radius: number, angle: number): [number, number] {
  return [Math.sin(angle) * radius, SPHERE - Math.cos(angle) * radius];
}

function bowlProfile(): [number, number][] {
  const angles = Array.from({ length: STEPS + 1 }, (_, i) => START + ((END - START) * i) / STEPS);
  const outer = angles.map((angle) => arc(SPHERE, angle));
  const inner = angles.map((angle) => arc(SPHERE - WALL, angle)).reverse();
  const floor = inner[inner.length - 1]?.[1] ?? WALL;
  return [[0, 0], [FOOT - 0.004, 0], ...outer, ...inner, [0, floor]];
}

function bowl(): ModelSpecPart {
  const scale = by('diameter', 1 / (2 * RIM));
  return piece(
    'bowl',
    'bowl',
    { type: 'lathe', profile: bowlProfile(), segments: 64 },
    { scale: [scale, 1, scale], contact: true },
  );
}

interface Fruit {
  readonly id: string;
  readonly material: string;
  readonly radius: number;
  readonly at: readonly [number, number, number];
}

const FRUIT: readonly Fruit[] = [
  { id: 'apple1', material: 'apple', radius: 0.036, at: [-0.055, 0.057, 0.02] },
  { id: 'apple2', material: 'apple', radius: 0.035, at: [0.005, 0.057, -0.055] },
  { id: 'orange1', material: 'orange', radius: 0.033, at: [0.062, 0.052, 0.03] },
  { id: 'orange2', material: 'orange', radius: 0.032, at: [-0.01, 0.05, 0.07] },
  { id: 'apple3', material: 'apple', radius: 0.034, at: [0.005, 0.098, 0.005] },
];

function fruitParts(): ModelSpecPart[] {
  return FRUIT.map((fruit) =>
    piece(
      fruit.id,
      fruit.material,
      { type: 'sphere', radius: fruit.radius, segments: 32 },
      { at: fruit.at },
    ),
  );
}

function banana(): ModelSpecPart {
  return piece(
    'banana',
    'accent',
    {
      type: 'tube',
      points: [
        [-0.105, 0.116, 0.025],
        [-0.04, 0.098, 0.052],
        [0.03, 0.1, 0.05],
        [0.1, 0.122, 0.02],
      ],
      radius: 0.013,
      segments: 12,
    },
    { minLod: 1 },
  );
}

export const FRUIT_BOWL_MODEL: ModelSpec = kitchenItem({
  id: 'cat.kitchen.fruit-bowl',
  title: 'Fruit bowl',
  footprint: { width: 2 * RIM, depth: 2 * RIM, height: 0.15 },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    depth: { param: 'diameter', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Fruit bowl',
      synonyms: ['fruit basket', 'bowl', 'fruit dish', 'centrepiece bowl', 'serving bowl'],
    },
    sizeClass: 'small',
    aliases: ['cat.kitchen.bowl'],
  },
  params: { diameter: { min: 0.26, max: 0.42, default: 2 * RIM, unit: 'm' } },
  materials: {
    bowl: { finish: 'ceramic' },
    apple: { color: '#B3322A', roughness: 0.4, clearcoat: 0.35 },
    orange: { color: '#E48A2B', roughness: 0.55, clearcoat: 0.15 },
    accent: { color: '#E3C34A', roughness: 0.5, clearcoat: 0.1 },
  },
  defaultFinish: 'matte-white',
  slots: { body: ['bowl'] },
  pitch: 24,
  parts: [bowl(), ...fruitParts(), banana()],
});
