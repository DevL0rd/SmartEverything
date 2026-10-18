const CAPTION_COLUMN_MIN = 240;
const INLINE_COLUMN_MIN = 340;

export function controlColumnMin(inline: boolean): number {
  return inline ? INLINE_COLUMN_MIN : CAPTION_COLUMN_MIN;
}

export function columnCount(width: number, column: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (column + gap)));
}
