import {
  BOARD_COLUMNS,
  WIDGET_FOOTPRINTS,
  type BoardClass,
  type BoardWidget,
} from '@smarteverything/domain';
import { frameOf, type Cell } from './board-geometry';

export interface Placement {
  readonly widget: BoardWidget;
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
}

interface Size {
  readonly columns: number;
  readonly rows: number;
}

function firstOpenRow(placed: readonly Placement[], size: Size, col: number): number {
  let row = 0;
  for (const tile of placed) {
    if (col >= tile.col + tile.cols || col + size.columns <= tile.col) {
      continue;
    }
    if (row + size.rows <= tile.row) {
      break;
    }
    row = Math.max(row, tile.row + tile.rows);
  }
  return row;
}

function firstFit(
  placed: readonly Placement[],
  size: Size,
  columns: number,
): { readonly row: number; readonly col: number } {
  const ordered = [...placed].sort((a, b) => a.row - b.row);
  let best = { row: firstOpenRow(ordered, size, 0), col: 0 };
  for (let col = 1; col + size.columns <= columns && best.row > 0; col += 1) {
    const row = firstOpenRow(ordered, size, col);
    if (row < best.row) {
      best = { row, col };
    }
  }
  return best;
}

export function pack(
  board: BoardClass,
  widgets: readonly BoardWidget[],
  columns = BOARD_COLUMNS[board],
): readonly Placement[] {
  const placed: Placement[] = [];
  for (const widget of widgets) {
    const size = WIDGET_FOOTPRINTS[board][widget.size];
    const spot = firstFit(placed, size, columns);
    placed.push({ widget, ...spot, cols: size.columns, rows: size.rows });
  }
  return placed;
}

export function boardHeightOf(placements: readonly Placement[], cell: Cell): number {
  let height = 0;
  for (const placement of placements) {
    const frame = frameOf(cell, placement);
    height = Math.max(height, frame.top + frame.height);
  }
  return height;
}
