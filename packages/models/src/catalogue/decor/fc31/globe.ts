import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  BRASS,
  ball,
  blob,
  cyl,
  decorItem,
  finishesOf,
  hoop,
  rodBetween,
  woodOf,
} from '../fc30/kit';

const RADIUS = 0.15;
const CENTRE = 0.26;
const TILT = 23.5;
const RING = 0.172;
const DEG = Math.PI / 180;

interface Patch {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly across: number;
  readonly along: number;
}

const PATCHES: readonly Patch[] = [
  { id: 'northAmerica', lat: 45, lon: -100, across: 0.05, along: 0.036 },
  { id: 'southAmerica', lat: -10, lon: -60, across: 0.026, along: 0.05 },
  { id: 'europe', lat: 50, lon: 10, across: 0.036, along: 0.028 },
  { id: 'africa', lat: 5, lon: 20, across: 0.04, along: 0.05 },
  { id: 'asia', lat: 40, lon: 90, across: 0.062, along: 0.04 },
  { id: 'oceania', lat: -25, lon: 135, across: 0.034, along: 0.028 },
  { id: 'antarctica', lat: -68, lon: 20, across: 0.06, along: 0.02 },
];

function patch(entry: Patch): ModelSpecPart {
  const lat = entry.lat * DEG;
  const lon = entry.lon * DEG;
  const beta = Math.asin(Math.cos(lat) * Math.sin(lon));
  const alpha = Math.atan2(-Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const reach = RADIUS - 0.002;
  return blob(entry.id, 'land', [entry.across, entry.along, 0.006], {
    at: [
      reach * Math.cos(lat) * Math.sin(lon),
      reach * Math.sin(lat),
      reach * Math.cos(lat) * Math.cos(lon),
    ],
    turn: [alpha / DEG, beta / DEG, 0],
    parent: 'ocean',
    segments: 24,
    minLod: 1,
  });
}

function axle(sign: -1 | 1): ModelSpecPart {
  const tilt = TILT * DEG;
  const dir = [-Math.sin(tilt) * sign, Math.cos(tilt) * sign, 0] as const;
  return rodBetween(
    sign > 0 ? 'axleNorth' : 'axleSouth',
    'accent',
    {
      from: [dir[0] * RADIUS, CENTRE + dir[1] * RADIUS, 0],
      to: [dir[0] * RING, CENTRE + dir[1] * RING, 0],
      radius: 0.004,
    },
    { segments: 12, minLod: 1 },
  );
}

export const GLOBE_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.globe',
  title: 'Globe',
  footprint: { width: 0.36, depth: 0.24, height: 0.44 },
  meta: {
    names: {
      display: 'Globe',
      synonyms: ['world globe', 'desk globe', 'terrestrial globe', 'earth globe', 'map globe'],
    },
    sizeClass: 'small',
  },
  materials: {
    base: woodOf('walnut'),
    ocean: { color: '#4C7391', roughness: 0.35, clearcoat: 0.4 },
    land: { color: '#D8C79A', roughness: 0.55 },
    accent: BRASS,
  },
  finish: finishesOf(
    {
      classic: {},
      oak: { base: woodOf('oak') },
      noir: {
        base: { finish: 'satin-black' },
        ocean: { color: '#2F3A44' },
        land: { color: '#9AA3AB' },
      },
      sepia: { ocean: { color: '#B79A6B' }, land: { color: '#E8DCBC' } },
    },
    'classic',
  ),
  mount: 'desk',
  parts: [
    cyl(
      'base',
      'base',
      { height: 0.025, top: 0.1, bevel: 0.008, segments: 64 },
      { at: [0, 0.0125, 0], contact: true },
    ),
    cyl(
      'stem',
      'accent',
      { height: 0.07, top: 0.008, bevel: 0.003, segments: 24 },
      { at: [0, 0.058, 0] },
    ),
    hoop('meridian', 'accent', { radius: RING, tube: 0.006, segments: 64 }, { at: [0, CENTRE, 0] }),
    ball('ocean', 'ocean', RADIUS, { at: [0, CENTRE, 0], turn: [0, 0, TILT], segments: 64 }),
    hoop(
      'equator',
      'accent',
      { radius: RADIUS + 0.001, tube: 0.0025, segments: 64 },
      { turn: [90, 0, 0], parent: 'ocean', minLod: 1 },
    ),
    ...PATCHES.map((entry) => patch(entry)),
    axle(1),
    axle(-1),
  ],
});
