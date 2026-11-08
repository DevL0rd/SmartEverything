import type { ModelSpec } from '@smarteverything/domain';
import { CANOPY_COLOURS, OUTDOOR_FRAME, by, fabric, outdoorItem, piece, rod } from './kit';

const RADIUS = 0.5 * 2.7;
const RIM_Y = 1.98;
const POLE_H = 2.42;

const OUTER: readonly (readonly [number, number])[] = [
  [0, 0.41],
  [0.06, 0.405],
  [0.2, 0.385],
  [0.5, 0.32],
  [0.85, 0.23],
  [1.15, 0.12],
  [1.33, 0.035],
  [RADIUS, 0],
  [RADIUS - 0.02, -0.012],
];

const INNER: readonly (readonly [number, number])[] = [
  [1.15, 0.1],
  [0.85, 0.21],
  [0.5, 0.3],
  [0.2, 0.365],
  [0.06, 0.385],
  [0, 0.39],
];

function canopyProfile(): [number, number][] {
  return [...OUTER]
    .reverse()
    .concat([...INNER].reverse())
    .map(([x, y]) => [x, y]);
}

export const PARASOL_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.parasol',
  title: 'Parasol',
  footprint: { width: 2.708, depth: 2.708, height: POLE_H + 0.05 },
  size: {
    width: { param: 'diameter', scale: 1.003, extra: -0.0001, resizes: true },
    depth: { param: 'diameter', scale: 1.003, extra: -0.0001, resizes: true },
  },
  meta: {
    names: {
      display: 'Parasol',
      synonyms: ['patio umbrella', 'garden umbrella', 'sun shade', 'sunshade', 'market umbrella'],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.umbrella', 'cat.outdoor.patio-umbrella'],
  },
  params: { diameter: { min: 2, max: 3.6, default: 2 * RADIUS, unit: 'm' } },
  materials: {
    canopy: fabric(CANOPY_COLOURS.teak),
    frame: OUTDOOR_FRAME,
    base: { finish: 'graphite' },
  },
  slots: { frame: ['frame'], cloth: ['canopy'], palette: CANOPY_COLOURS },
  pitch: 12,
  parts: [
    rod(
      'base',
      'base',
      { height: 0.06, top: 0.3, segments: 48 },
      { at: [0, 0.03, 0], contact: true },
    ),
    rod(
      'hub',
      'base',
      { height: 0.18, top: 0.05, bottom: 0.07, segments: 32 },
      { at: [0, 0.15, 0], minLod: 1 },
    ),
    rod('pole', 'frame', { height: POLE_H, top: 0.025, segments: 24 }, { at: [0, POLE_H / 2, 0] }),
    piece(
      'canopy',
      'canopy',
      { type: 'lathe', profile: canopyProfile(), segments: 64 },
      {
        at: [0, RIM_Y, 0],
        scale: [by('diameter', 1 / (2 * RADIUS)), 1, by('diameter', 1 / (2 * RADIUS))],
      },
    ),
    piece(
      'finial',
      'frame',
      { type: 'sphere', radius: 0.045, segments: 24 },
      { at: [0, POLE_H + 0.02, 0], minLod: 1 },
    ),
    piece(
      'hem',
      'canopy',
      { type: 'torus', radius: RADIUS - 0.01, tube: 0.014, segments: 64 },
      { at: [0, 0, 0], turn: [90, 0, 0], parent: 'canopy', minLod: 1 },
    ),
  ],
});
