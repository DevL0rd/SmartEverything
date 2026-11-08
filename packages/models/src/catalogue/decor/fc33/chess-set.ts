import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { BRASS, block, decorItem, finishesOf, piece, turned } from '../fc30/kit';

const SQUARE = 0.04;
const TOP = 0.0365;
const ORIGIN = -0.14;

type Kind = 'pawn' | 'rook' | 'bishop' | 'queen' | 'king' | 'knight';

const PROFILES: Readonly<Record<Kind, readonly (readonly [number, number])[]>> = {
  pawn: [
    [0, 0],
    [0.014, 0],
    [0.0145, 0.004],
    [0.009, 0.01],
    [0.006, 0.02],
    [0.0105, 0.022],
    [0.0085, 0.027],
    [0.0095, 0.032],
    [0.006, 0.036],
    [0, 0.037],
  ],
  rook: [
    [0, 0],
    [0.016, 0],
    [0.017, 0.004],
    [0.012, 0.012],
    [0.011, 0.03],
    [0.016, 0.034],
    [0.016, 0.042],
    [0.011, 0.042],
    [0, 0.04],
  ],
  bishop: [
    [0, 0],
    [0.016, 0],
    [0.017, 0.004],
    [0.011, 0.011],
    [0.007, 0.028],
    [0.012, 0.032],
    [0.009, 0.04],
    [0.01, 0.048],
    [0.004, 0.054],
    [0, 0.058],
  ],
  queen: [
    [0, 0],
    [0.018, 0],
    [0.019, 0.004],
    [0.012, 0.013],
    [0.008, 0.034],
    [0.015, 0.04],
    [0.011, 0.046],
    [0.017, 0.053],
    [0.011, 0.057],
    [0.004, 0.06],
    [0, 0.064],
  ],
  king: [
    [0, 0],
    [0.018, 0],
    [0.019, 0.004],
    [0.012, 0.013],
    [0.008, 0.036],
    [0.015, 0.042],
    [0.011, 0.05],
    [0.016, 0.056],
    [0.01, 0.06],
    [0, 0.06],
  ],
  knight: [
    [0, 0],
    [0.016, 0],
    [0.017, 0.004],
    [0.012, 0.012],
    [0.0115, 0.026],
    [0.009, 0.03],
    [0, 0.03],
  ],
};

interface Piece {
  readonly id: string;
  readonly kind: Kind;
  readonly side: 'light' | 'dark';
  readonly file: number;
  readonly rank: number;
  readonly lod: 0 | 1 | 2;
}

const PIECES: readonly Piece[] = [
  { id: 'lightKing', kind: 'king', side: 'light', file: 4, rank: 7, lod: 0 },
  { id: 'lightPawnA', kind: 'pawn', side: 'light', file: 4, rank: 6, lod: 0 },
  { id: 'lightRook', kind: 'rook', side: 'light', file: 0, rank: 7, lod: 0 },
  { id: 'darkKing', kind: 'king', side: 'dark', file: 4, rank: 0, lod: 0 },
  { id: 'darkQueen', kind: 'queen', side: 'dark', file: 3, rank: 0, lod: 0 },
  { id: 'darkPawnA', kind: 'pawn', side: 'dark', file: 4, rank: 1, lod: 0 },
  { id: 'lightQueen', kind: 'queen', side: 'light', file: 3, rank: 7, lod: 1 },
  { id: 'darkRook', kind: 'rook', side: 'dark', file: 7, rank: 0, lod: 1 },
  { id: 'lightBishop', kind: 'bishop', side: 'light', file: 2, rank: 7, lod: 2 },
  { id: 'lightKnight', kind: 'knight', side: 'light', file: 6, rank: 7, lod: 2 },
  { id: 'lightPawnB', kind: 'pawn', side: 'light', file: 3, rank: 6, lod: 2 },
  { id: 'darkKnight', kind: 'knight', side: 'dark', file: 1, rank: 0, lod: 2 },
  { id: 'darkPawnB', kind: 'pawn', side: 'dark', file: 3, rank: 1, lod: 2 },
];

function centre(index: number): number {
  return ORIGIN + SQUARE * index;
}

function column(file: number): ModelSpecPart {
  const first = file % 2 === 0 ? 1 : 0;
  return piece(
    `dark${String(file + 1)}`,
    'dark',
    { type: 'slats', count: 4, spacing: SQUARE * 2, width: SQUARE, height: SQUARE, depth: 0.008 },
    { at: [centre(file), TOP - 0.004 + 0.0005, centre(first + 3)], turn: [90, 0, 0] },
  );
}

function crown(entry: Piece, x: number, z: number): ModelSpecPart[] {
  const rise = TOP + 0.06;
  const make = (
    suffix: string,
    size: readonly [number, number, number],
    lift: number,
  ): ModelSpecPart =>
    block(`${entry.id}${suffix}`, 'accent', size, {
      at: [x, rise + lift, z],
      round: 0.0012,
      segments: 3,
      minLod: 2,
    });
  return [make('Post', [0.005, 0.016, 0.005], 0.008), make('Arm', [0.014, 0.005, 0.005], 0.012)];
}

function figure(entry: Piece): ModelSpecPart[] {
  const x = centre(entry.file);
  const z = centre(entry.rank);
  const body = turned(entry.id, entry.side, PROFILES[entry.kind], {
    at: [x, TOP, z],
    segments: 24,
    minLod: entry.lod,
  });
  return entry.kind === 'king' ? [body, ...crown(entry, x, z)] : [body];
}

export const CHESS_SET_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.chess-set',
  title: 'Chess set',
  footprint: { width: 0.4, depth: 0.4, height: 0.1 },
  meta: {
    names: {
      display: 'Chess set',
      synonyms: ['chess board', 'chess', 'board game', 'chessboard', 'chess pieces'],
    },
    sizeClass: 'small',
  },
  materials: {
    light: { finish: 'ash' },
    dark: { finish: 'walnut' },
    accent: BRASS,
  },
  finish: finishesOf(
    {
      classic: {},
      marble: { light: { finish: 'marble' }, dark: { finish: 'graphite' } },
      modern: { light: { finish: 'matte-white' }, dark: { finish: 'satin-black' } },
      oak: { light: { finish: 'oak' }, dark: { finish: 'satin-black' } },
    },
    'classic',
  ),
  mount: 'desk',
  parts: [
    block('board', 'light', [0.4, TOP, 0.4], {
      at: [0, TOP / 2, 0],
      round: 0.006,
      segments: 3,
      contact: true,
    }),
    ...Array.from({ length: 8 }, (_, file) => column(file)),
    ...PIECES.flatMap((entry) => figure(entry)),
  ],
});
