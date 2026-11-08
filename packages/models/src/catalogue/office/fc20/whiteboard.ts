import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece, rod } from '../../living/fc06/kit';
import { metalFinishes, officeItem } from '../fc19/kit';

const DEPTH = 0.03;
const FACE = 0.0185;

function sketch(): ModelSpecPart[] {
  const bar = (
    id: string,
    size: readonly [number, number],
    at: readonly [number, number],
  ): ModelSpecPart =>
    block(id, 'accent', [size[0], size[1], 0.003], {
      at: [by('width', at[0]), by('height', at[1]), FACE],
      round: 0.0012,
      segments: 3,
      minLod: 1,
    });
  return [
    bar('sketchTop', [0.26, 0.012], [-0.2, 0.74]),
    bar('sketchLink', [0.012, 0.18], [-0.2, 0.62]),
    bar('sketchBranch', [0.34, 0.012], [-0.06, 0.52]),
    piece(
      'sketchRing',
      'accent',
      { type: 'ring', innerRadius: 0.05, outerRadius: 0.062, segments: 48 },
      { at: [by('width', 0.22), by('height', 0.52), FACE], minLod: 1 },
    ),
  ];
}

function tray(): ModelSpecPart[] {
  return [
    block('tray', 'frame', [by('width', 1, -0.3), 0.022, 0.07], {
      at: [0, 0.011, 0.04],
      round: 0.008,
      segments: 3,
    }),
    rod(
      'markerA',
      'accent',
      { height: 0.13, top: 0.0085, segments: 24 },
      {
        at: [by('width', -0.5, 0.3), 0.032, 0.05],
        turn: [0, 8, 90],
        minLod: 1,
      },
    ),
    rod(
      'markerB',
      'accent',
      { height: 0.13, top: 0.0085, segments: 24 },
      {
        at: [by('width', -0.5, 0.48), 0.032, 0.05],
        turn: [0, -6, 90],
        minLod: 1,
      },
    ),
    block('eraser', 'frame', [0.1, 0.03, 0.045], {
      at: [by('width', 0.5, -0.3), 0.037, 0.05],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const WHITEBOARD_MODEL: ModelSpec = officeItem({
  id: 'cat.office.whiteboard',
  title: 'Whiteboard',
  footprint: { width: 1.2, depth: 0.1, height: 0.9 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Whiteboard',
      synonyms: [
        'dry erase board',
        'wall whiteboard',
        'magnetic whiteboard',
        'meeting board',
        'planning board',
        'marker board',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.white-board'],
  },
  params: {
    width: { min: 0.6, max: 2.4, default: 1.2, unit: 'm' },
    height: { min: 0.4, max: 1.4, default: 0.9, unit: 'm' },
  },
  materials: {
    frame: { finish: 'graphite' },
    board: { finish: 'matte-white', roughness: 0.25, clearcoat: 0.5 },
    accent: { color: '#2F6FB5', roughness: 0.5, clearcoat: 0.2 },
  },
  finishes: metalFinishes(['frame']),
  defaultFinish: 'graphite',
  pitch: 10,
  wall: true,
  parts: [
    block('frame', 'frame', [by('width', 1), by('height', 1), DEPTH], {
      at: [0, by('height', 0.5), 0],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('board', 'board', [by('width', 1, -0.04), by('height', 1, -0.04), 0.012], {
      at: [0, by('height', 0.5), 0.0105],
      round: 0.004,
      segments: 3,
    }),
    ...tray(),
    ...sketch(),
  ],
});
