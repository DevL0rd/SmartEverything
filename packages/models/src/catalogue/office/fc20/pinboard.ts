import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece, woodFinishes, woodOf } from '../../living/fc06/kit';
import { officeItem } from '../fc19/kit';

const DEPTH = 0.035;
const FACE = 0.0235;

interface Note {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly size: readonly [number, number];
  readonly turn: number;
}

const NOTES: readonly Note[] = [
  { id: 'noteA', x: -0.28, y: 0.66, size: [0.12, 0.12], turn: -4 },
  { id: 'noteB', x: 0.05, y: 0.58, size: [0.14, 0.1], turn: 3 },
  { id: 'noteC', x: 0.3, y: 0.34, size: [0.1, 0.14], turn: -2 },
  { id: 'noteD', x: -0.18, y: 0.32, size: [0.16, 0.1], turn: 5 },
];

function notes(): ModelSpecPart[] {
  return NOTES.flatMap((note) => [
    block(note.id, 'paper', [note.size[0], note.size[1], 0.003], {
      at: [by('width', note.x), by('height', note.y), FACE + 0.001],
      turn: [0, 0, note.turn],
      round: 0.0012,
      segments: 3,
    }),
    piece(
      `pin${note.id.slice(-1)}`,
      'accent',
      { type: 'sphere', radius: 0.0075, segments: 24 },
      {
        at: [by('width', note.x), by('height', note.y, note.size[1] / 2 - 0.015), FACE + 0.005],
        minLod: 1,
      },
    ),
  ]);
}

export const PINBOARD_MODEL: ModelSpec = officeItem({
  id: 'cat.office.pinboard',
  title: 'Pinboard',
  footprint: { width: 1, depth: 0.08, height: 0.7 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Pinboard',
      synonyms: [
        'cork board',
        'notice board',
        'bulletin board',
        'memo board',
        'corkboard',
        'wall pin board',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.cork-board'],
  },
  params: {
    width: { min: 0.5, max: 1.6, default: 1, unit: 'm' },
    height: { min: 0.4, max: 1.2, default: 0.7, unit: 'm' },
  },
  materials: {
    frame: woodOf('oak'),
    cork: { color: '#C2956A', roughness: 0.95 },
    paper: { finish: 'warm-white' },
    accent: { color: '#C8362E', roughness: 0.4, clearcoat: 0.4 },
  },
  finishes: woodFinishes(['frame']),
  defaultFinish: 'oak',
  pitch: 10,
  wall: true,
  parts: [
    block('frame', 'frame', [by('width', 1), by('height', 1), DEPTH], {
      at: [0, by('height', 0.5), 0],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('cork', 'cork', [by('width', 1, -0.05), by('height', 1, -0.05), 0.012], {
      at: [0, by('height', 0.5), 0.0175],
      round: 0.004,
      segments: 3,
    }),
    ...notes(),
  ],
});
