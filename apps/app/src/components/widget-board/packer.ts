import {
  BOARD_COLUMNS,
  WIDGET_FOOTPRINTS,
  type BoardClass,
  type BoardWidget,
} from '@smarteverything/domain';
import { aspectRows, spanWidth, type Cell } from './board-geometry';

export interface Placement {
  readonly widget: BoardWidget;
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
  readonly height?: number;
}

export interface Sizing {
  readonly cell: Cell;
  readonly aspectOf: (type: string) => number | undefined;
}

interface Size {
  readonly columns: number;
  readonly rows: number;
}

function cellsOf(row: number, col: number, size: Size): readonly string[] {
  const cells: string[] = [];
  for (let r = row; r < row + size.rows; r += 1) {
    for (let c = col; c < col + size.columns; c += 1) {
      cells.push(`${String(r)}:${String(c)}`);
    }
  }
  return cells;
}

function firstFit(
  taken: ReadonlySet<string>,
  size: Size,
  columns: number,
): { row: number; col: number } {
  for (let row = 0; ; row += 1) {
    for (let col = 0; col + size.columns <= columns; col += 1) {
      if (cellsOf(row, col, size).every((cell) => !taken.has(cell))) {
        return { row, col };
      }
    }
  }
}

function sizeOf(
  board: BoardClass,
  widget: BoardWidget,
  sizing: Sizing | undefined,
): Size & { readonly height?: number } {
  const footprint = WIDGET_FOOTPRINTS[board][widget.size];
  const aspect = sizing?.aspectOf(widget.type);
  if (sizing === undefined || aspect === undefined) {
    return footprint;
  }
  return {
    columns: footprint.columns,
    rows: aspectRows(sizing.cell, footprint.columns, aspect),
    height: spanWidth(sizing.cell, footprint.columns) / aspect,
  };
}

export function fittedCell(
  board: BoardClass,
  widgets: readonly BoardWidget[],
  sizing: Sizing,
): Cell {
  const { cell } = sizing;
  const first = widgets.find((widget) => sizing.aspectOf(widget.type) !== undefined);
  const aspect = first === undefined ? undefined : sizing.aspectOf(first.type);
  if (first === undefined || aspect === undefined) {
    return cell;
  }
  const height = spanWidth(cell, WIDGET_FOOTPRINTS[board][first.size].columns) / aspect;
  const rows = Math.max(1, Math.round((height + cell.gap) / (cell.height + cell.gap)));
  return { ...cell, height: (height + cell.gap) / rows - cell.gap };
}

export function pack(
  board: BoardClass,
  widgets: readonly BoardWidget[],
  sizing?: Sizing,
): readonly Placement[] {
  const columns = BOARD_COLUMNS[board];
  const taken = new Set<string>();
  return widgets.map((widget) => {
    const size = sizeOf(board, widget, sizing);
    const spot = firstFit(taken, size, columns);
    for (const cell of cellsOf(spot.row, spot.col, size)) {
      taken.add(cell);
    }
    const placed = { widget, col: spot.col, row: spot.row, cols: size.columns, rows: size.rows };
    return size.height === undefined ? placed : { ...placed, height: size.height };
  });
}

export function rowsOf(placements: readonly Placement[]): number {
  return placements.reduce((most, placement) => Math.max(most, placement.row + placement.rows), 0);
}
