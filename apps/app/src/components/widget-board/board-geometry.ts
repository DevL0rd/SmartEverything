import { SEMANTIC_SIZES, type Density, type Idiom, type WidthClass } from '../../design/tokens';
import type { BoardClass } from './types';

export function boardClassOf(width: WidthClass): BoardClass {
  if (width === 'compact') {
    return 'compact';
  }
  return width === 'medium' ? 'medium' : 'expanded';
}

export interface Cell {
  readonly width: number;
  readonly height: number;
  readonly gap: number;
  readonly pad: number;
}

export function cellOf(boardWidth: number, columns: number, idiom: Idiom, density: Density): Cell {
  const sizes = SEMANTIC_SIZES[idiom][density];
  const gap = sizes.gridGap;
  return {
    width: (boardWidth - gap * (columns - 1)) / columns,
    height: sizes.rowUnit,
    gap,
    pad: sizes.cardPad,
  };
}

export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Span {
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
  readonly height?: number | undefined;
}

export function spanWidth(cell: Cell, columns: number): number {
  return columns * cell.width + (columns - 1) * cell.gap;
}

export function aspectRows(cell: Cell, columns: number, aspect: number): number {
  const height = spanWidth(cell, columns) / aspect;
  return Math.max(1, Math.ceil((height + cell.gap) / (cell.height + cell.gap)));
}

export function frameOf(cell: Cell, { col, row, cols, rows, height }: Span): Frame {
  return {
    left: col * (cell.width + cell.gap),
    top: row * (cell.height + cell.gap),
    width: spanWidth(cell, cols),
    height: height ?? rows * cell.height + (rows - 1) * cell.gap,
  };
}
