import type { ModelSpec } from '@smarteverything/domain';
import {
  by,
  diningFurniture,
  piece,
  rod,
  upholsteryOf,
  woodFinishes,
  woodOf,
  type Place,
} from '../fc09/kit';

const TILT = 8;
const TAN = Math.tan((TILT * Math.PI) / 180);
const COS = Math.cos((TILT * Math.PI) / 180);
const TOP_RADIUS = 0.14;
const SEAT_T = 0.05;
const RING_Y = 0.26;

const LEG_REACH = Number((0.5 * TAN).toFixed(4));
const LEG_BASE = Number((TOP_RADIUS + LEG_REACH * SEAT_T).toFixed(4));
const RING_REACH = Number(TAN.toFixed(4));
const RING_BASE = Number((TOP_RADIUS + TAN * (-SEAT_T - RING_Y)).toFixed(4));

interface Leg {
  readonly id: string;
  readonly side: 1 | -1;
  readonly axis: 'x' | 'z';
}

const LEGS: readonly Leg[] = [
  { id: 'legEast', side: 1, axis: 'x' },
  { id: 'legWest', side: -1, axis: 'x' },
  { id: 'legNorth', side: 1, axis: 'z' },
  { id: 'legSouth', side: -1, axis: 'z' },
];

function legPlace(leg: Leg): Place {
  const out = by('height', leg.side * LEG_REACH, leg.side * LEG_BASE);
  const y = by('height', 0.5, -SEAT_T / 2);
  return leg.axis === 'x'
    ? { at: [out, y, 0], turn: [0, 0, leg.side * TILT], contact: true }
    : { at: [0, y, out], turn: [-leg.side * TILT, 0, 0], contact: true };
}

export const BAR_STOOL_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.bar-stool',
  title: 'Bar stool',
  footprint: { width: 0.4972, depth: 0.4972, height: 0.6622 },
  size: {
    width: { param: 'height', scale: 0.2811, extra: 0.3117, resizes: false },
    depth: { param: 'height', scale: 0.2811, extra: 0.3117, resizes: false },
    height: { param: 'height', extra: 0.0022, resizes: true },
  },
  meta: {
    names: {
      display: 'Bar stool',
      synonyms: ['stool', 'counter stool', 'kitchen stool', 'island stool', 'high stool'],
    },
    sizeClass: 'small',
    aliases: ['cat.dining.counter-stool'],
  },
  params: { height: { min: 0.55, max: 0.8, default: 0.66, unit: 'm' } },
  materials: {
    body: woodOf('oak'),
    seat: upholsteryOf('oat'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    rod(
      'seat',
      'seat',
      { height: SEAT_T, top: 0.19, segments: 48 },
      { at: [0, by('height', 1, -SEAT_T / 2), 0] },
    ),
    rod(
      'plate',
      'body',
      { height: 0.02, top: 0.165, segments: 32 },
      { at: [0, by('height', 1, -SEAT_T - 0.01), 0], minLod: 1 },
    ),
    ...LEGS.map((leg) =>
      rod(
        leg.id,
        'body',
        { height: by('height', 1 / COS, -SEAT_T / COS), top: 0.016, bottom: 0.012, segments: 16 },
        legPlace(leg),
      ),
    ),
    piece(
      'rail',
      'accent',
      { type: 'torus', radius: by('height', RING_REACH, RING_BASE), tube: 0.011, segments: 32 },
      { at: [0, RING_Y, 0], turn: [90, 0, 0], minLod: 1 },
    ),
  ],
});
