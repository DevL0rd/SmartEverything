import {
  BOARD_CLASSES,
  BOARD_COLUMNS,
  arrangementOf,
  arrangementSourceOf,
  type ArrangementSource,
  type BoardClass,
  type BoardDefaultWidgets,
  type BoardLayout,
} from '@smarteverything/domain';
import { WIDTH_BREAKPOINTS } from '../../../design/size-class';

export const BOARD_LABELS: Readonly<Record<BoardClass, string>> = {
  compact: 'Compact',
  medium: 'Medium',
  expanded: 'Expanded',
};

export interface LayoutSizeRow {
  readonly board: BoardClass;
  readonly label: string;
  readonly range: string;
  readonly columns: number;
  readonly count: number;
  readonly source: ArrangementSource;
  readonly follows: BoardClass | null;
  readonly current: boolean;
}

function rangeOf(board: BoardClass): string {
  switch (board) {
    case 'compact':
      return `Under ${String(WIDTH_BREAKPOINTS.medium)} wide`;
    case 'medium':
      return `${String(WIDTH_BREAKPOINTS.medium)} to ${String(WIDTH_BREAKPOINTS.expanded - 1)} wide`;
    case 'expanded':
      return `${String(WIDTH_BREAKPOINTS.expanded)} and wider`;
  }
}

export function layoutSizeRows(
  layout: BoardLayout | null,
  defaults: BoardDefaultWidgets,
  current: BoardClass,
): readonly LayoutSizeRow[] {
  return BOARD_CLASSES.map((board) => ({
    board,
    label: BOARD_LABELS[board],
    range: rangeOf(board),
    columns: BOARD_COLUMNS[board],
    count: arrangementOf(layout, board, defaults).length,
    source: arrangementSourceOf(layout, board),
    follows: layout?.follow?.[board] ?? null,
    current: board === current,
  }));
}

export function sourceText(row: LayoutSizeRow): string {
  switch (row.source) {
    case 'own':
      return 'Your own arrangement';
    case 'following':
      return row.follows === null
        ? 'Default arrangement'
        : `Following ${BOARD_LABELS[row.follows]}`;
    case 'default':
      return 'Default arrangement';
  }
}

export function copyConfirmBody(from: BoardClass, to: BoardClass, hadOwn: boolean): string {
  const lost = hadOwn
    ? `The ${BOARD_LABELS[to]} layout you arranged will be replaced.`
    : `The ${BOARD_LABELS[to]} layout is currently not customised.`;
  return `${lost} It will become a copy of ${BOARD_LABELS[from]}, and the two stay independent afterwards. You can undo this once.`;
}

export function resetConfirmBody(board: BoardClass): string {
  return `Your ${BOARD_LABELS[board]} arrangement will be removed and the built-in default will be used again. Other sizes are not changed. You can undo this once.`;
}
