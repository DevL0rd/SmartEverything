const CARD_MIN_WIDTH = 240;
const ROW_GAP = 12;

export interface EventGridSize {
  readonly width: number;
  readonly height: number;
}

export function eventGridLayout(
  frame: EventGridSize,
  firstRow: EventGridSize,
): { readonly columns: number; readonly rows: number } {
  const columns = Math.max(2, Math.floor(frame.width / CARD_MIN_WIDTH));
  const rows =
    firstRow.width === frame.width && firstRow.height > 0
      ? Math.max(1, Math.floor((frame.height + ROW_GAP) / (firstRow.height + ROW_GAP)))
      : 1;
  return { columns, rows };
}
